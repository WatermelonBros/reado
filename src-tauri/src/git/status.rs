use super::{is_reado_own, run_git, run_git_checked, run_git_raw};
use std::path::Path;

use serde::Serialize;

/// Git status for an opened project.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    /// Whether `root` is inside a git working tree.
    pub is_repo: bool,
    /// Current branch name, or `None` when detached / not a repo.
    pub branch: Option<String>,
    /// Commits on HEAD not yet on the upstream (how many to push). 0 with no
    /// upstream.
    pub ahead: u32,
    /// Commits on the upstream not yet on HEAD (how many to pull). 0 with no
    /// upstream.
    pub behind: u32,
    /// Whether any remote is configured (so fetch/pull/sync can do anything).
    pub has_remote: bool,
    /// Whether the current branch tracks an upstream (so ahead/behind are
    /// meaningful; a branch with a remote but no upstream can still be published
    /// by a first push).
    pub has_upstream: bool,
    /// Files with working-tree or index changes, for the Source Control badge.
    pub changed_files: u32,
}

/// Working-tree status, one line per path. `-uall` lists individual untracked
/// files instead of collapsing an untracked directory to a single folder entry;
/// `-c core.quotepath=false` stops git octal-escaping non-ASCII bytes (e.g.
/// `na\303\257ve.rs`), so the paths match the real files on disk.
const STATUS_ARGS: [&str; 5] = [
    "-c",
    "core.quotepath=false",
    "status",
    "--porcelain",
    "-uall",
];

/// Project-relative paths changed for a guided-review scope. With no `base`,
/// the working-tree changes (tracked edits + untracked files) against HEAD; with
/// a `base` branch/ref, the files that differ on this branch (`base...HEAD`).
/// Used to seed a guided review's scope; never errors (empty on any failure).
#[tauri::command]
pub fn git_changed_files(root: String, base: Option<String>) -> Vec<String> {
    let root = Path::new(&root);
    let mut files: Vec<String> = Vec::new();
    let mut push = |s: Option<String>| {
        if let Some(out) = s {
            for line in out.lines() {
                let p = line.trim();
                if !p.is_empty() && !is_reado_own(p) && !files.iter().any(|f| f == p) {
                    files.push(p.to_string());
                }
            }
        }
    };
    match base
        .as_deref()
        .map(str::trim)
        // Reject a base that would be read as a git option (`-`/`--…`) rather
        // than a revision — defence against argument injection.
        .filter(|b| !b.is_empty() && !b.starts_with('-'))
    {
        Some(base) => {
            // Branch scope: what this branch changed relative to its base.
            let range = format!("{base}...HEAD");
            push(run_git(root, &["diff", "--name-only", &range]));
        }
        None => {
            // Diff scope: the working tree vs HEAD, plus untracked files.
            push(run_git(root, &["diff", "--name-only", "HEAD"]));
            push(run_git(
                root,
                &["ls-files", "--others", "--exclude-standard"],
            ));
        }
    }
    files.sort();
    files
}

/// Inspect the git state of a project root. Never errors: a missing `git`, or a
/// non-repository folder, simply yields `is_repo: false`.
/// `async` so it runs on a worker: it shells out to git several times, the UI
/// polls it, and a slow repo answering on the main thread freezes the window.
#[tauri::command(async)]
pub fn git_info(root: String) -> GitInfo {
    let root = Path::new(&root);
    let is_repo = run_git(root, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false);

    let branch = if is_repo {
        // A detached HEAD yields the literal "HEAD"; report it as `None` (no
        // branch), matching git_branches and the documented contract.
        run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])
            .filter(|b| !b.is_empty() && b != "HEAD")
    } else {
        None
    };

    let has_remote = is_repo
        && run_git(root, &["remote"])
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);

    // ahead/behind vs the tracking branch. `rev-list --left-right --count
    // @{upstream}...HEAD` prints "<behind>\t<ahead>"; it fails (→ None) when the
    // branch has no upstream, which is how we detect `has_upstream`.
    let (behind, ahead, has_upstream) = is_repo
        .then(|| {
            run_git(
                root,
                &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
            )
        })
        .flatten()
        .map(|counts| {
            let (behind, ahead) = parse_left_right(&counts);
            (behind, ahead, true)
        })
        .unwrap_or((0, 0, false));

    // One porcelain line per path (a rename is still one line), so counting
    // lines counts *files* — staged and unstaged edits to the same file must
    // not badge as two.
    let changed_files = is_repo
        .then(|| status_entries(root))
        .flatten()
        .map(|entries| entries.len() as u32)
        .unwrap_or(0);

    GitInfo {
        is_repo,
        branch,
        ahead,
        behind,
        has_remote,
        has_upstream,
        changed_files,
    }
}

/// One changed file in the working tree, on one side (staged or unstaged). A
/// file modified both in the index and the working tree produces two entries.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    /// Project-relative path (the new path for renames).
    pub path: String,
    /// Category: "modified" | "added" | "deleted" | "renamed" | "untracked".
    pub status: String,
    /// Whether this entry is in the index (staged) vs the working tree.
    pub staged: bool,
}

/// Map a single porcelain status char to a category.
fn categorize_char(c: char) -> &'static str {
    match c {
        'R' | 'C' => "renamed",
        'D' => "deleted",
        'A' => "added",
        '?' => "untracked",
        _ => "modified",
    }
}

/// The path a porcelain status line names — rename target, unquoted — or empty
/// for a line too short to carry one. Shared so the badge count and the change
/// list read the same path out of the same line.
fn status_line_path(line: &str) -> String {
    if line.len() <= 3 {
        return String::new();
    }
    let mut path = line[3..].to_string();
    // Renames are "old -> new"; keep the new path.
    if let Some(idx) = path.find(" -> ") {
        path = path[idx + 4..].to_string();
    }
    path.trim_matches('"').to_string()
}

/// Expand one `git status --porcelain` line into its staged/unstaged entries.
/// The two status chars are X (index) and Y (working tree); "MM path" yields
/// both a staged and an unstaged change, mirroring how SCM UIs present it.
fn expand_status_line(line: &str) -> Vec<GitChange> {
    if line.len() <= 3 {
        return Vec::new();
    }
    let bytes = line.as_bytes();
    let (x, y) = (bytes[0] as char, bytes[1] as char);
    let path = status_line_path(line);

    if x == '?' {
        return vec![GitChange {
            path,
            status: "untracked".into(),
            staged: false,
        }];
    }
    // Unmerged (merge-conflict) states — `U` on either side, or `AA`/`DD`. These
    // must not be split into a staged "modified" entry (which reads as "resolved
    // and staged"); surface a single `conflicted` entry instead.
    if matches!((x, y), ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D')) {
        return vec![GitChange {
            path,
            status: "conflicted".into(),
            staged: false,
        }];
    }
    let mut out = Vec::new();
    if x != ' ' {
        out.push(GitChange {
            path: path.clone(),
            status: categorize_char(x).into(),
            staged: true,
        });
    }
    if y != ' ' {
        out.push(GitChange {
            path,
            status: categorize_char(y).into(),
            staged: false,
        });
    }
    out
}

/// The working tree's changed files, one per porcelain line (a rename is one
/// line), as `(XY status code, path)` with Reado's own files left out; `None`
/// when git fails. The badge count and the Anywhere phone's change list both
/// read it, so they agree with each other and with [`git_status`].
pub(crate) fn status_entries(root: &Path) -> Option<Vec<(String, String)>> {
    let out = run_git_raw(root, &STATUS_ARGS)?;
    Some(
        out.lines()
            .filter(|l| l.len() > 3)
            .map(|l| (l[..2].to_string(), status_line_path(l)))
            .filter(|(_, path)| !is_reado_own(path))
            .collect(),
    )
}

/// The working-tree status for the Source Control view, split into staged and
/// unstaged entries. (Raw, untrimmed output: porcelain lines begin with the
/// two status columns, so the leading space of an unstaged-only change matters.)
/// `async` for the same reason as `git_info`: polled, and slow on a big tree.
#[tauri::command(async)]
pub fn git_status(root: String) -> Vec<GitChange> {
    let Some(out) = run_git_raw(Path::new(&root), &STATUS_ARGS) else {
        return Vec::new();
    };
    out.lines()
        .flat_map(expand_status_line)
        .filter(|c| !is_reado_own(&c.path))
        .collect()
}

/// Stage a path (`git add`). Also stages a deletion.
#[tauri::command]
pub fn git_stage(root: String, path: String) -> Result<(), String> {
    run_git_checked(&root, &["add", "--", &path])
}

/// Unstage a path (`git reset HEAD`).
#[tauri::command]
pub fn git_unstage(root: String, path: String) -> Result<(), String> {
    run_git_checked(&root, &["reset", "-q", "HEAD", "--", &path])
}

/// Stage every change (`git add -A`).
#[tauri::command]
pub fn git_stage_all(root: String) -> Result<(), String> {
    run_git_checked(&root, &["add", "-A"])
}

/// Unstage everything (`git reset HEAD`).
#[tauri::command]
pub fn git_unstage_all(root: String) -> Result<(), String> {
    run_git_checked(&root, &["reset", "-q", "HEAD"])
}

/// Discard working-tree changes for a path. For an untracked file this deletes
/// it; for a tracked file it restores it to HEAD. Destructive — the caller must
/// confirm with the user first.
#[tauri::command]
pub fn git_discard(root: String, path: String, untracked: bool) -> Result<(), String> {
    if untracked {
        // Confine the deletion to the project root: an untracked `path` that
        // escapes (`../…`) or is absolute must never let remove_dir_all wipe
        // files outside the repo. Reuse the same confinement guard as fs.rs.
        let full = Path::new(&root).join(&path);
        let full = crate::fs::ensure_within(Path::new(&root), &full).map_err(|e| e.to_string())?;
        if full.is_dir() {
            std::fs::remove_dir_all(&full).map_err(|e| e.to_string())
        } else {
            std::fs::remove_file(&full).map_err(|e| e.to_string())
        }
    } else {
        run_git_checked(&root, &["checkout", "--", &path])
    }
}

/// Commit the staged changes with a message (`git commit -m`).
#[tauri::command]
pub fn git_commit(root: String, message: String) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Empty commit message".into());
    }
    run_git_checked(&root, &["commit", "-m", &message])
}

/// Discard working-tree changes in bulk. Always restores tracked files to the
/// index (`checkout -- .`); when `untracked` is set, also removes untracked
/// files and directories (`clean -fd`). Destructive — confirm first.
#[tauri::command]
pub fn git_discard_all(root: String, untracked: bool) -> Result<(), String> {
    run_git_checked(&root, &["checkout", "--", "."])?;
    if untracked {
        run_git_checked(&root, &["clean", "-fd"])?;
    }
    Ok(())
}

/// Parse `git rev-list --left-right --count @{u}...HEAD` output ("<behind>\t<ahead>")
/// into `(behind, ahead)`. Left = upstream-only commits (to pull), right =
/// HEAD-only commits (to push). Missing/garbage fields fall back to 0.
fn parse_left_right(counts: &str) -> (u32, u32) {
    let mut it = counts.split_whitespace();
    let behind = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let ahead = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    (behind, ahead)
}

/// Project-relative paths currently in a merge-conflict state.
pub(super) fn conflicted_files(root: &str) -> Vec<String> {
    git_status(root.to_string())
        .into_iter()
        .filter(|c| c.status == "conflicted")
        .map(|c| c.path)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::repo;

    #[test]
    fn reados_own_files_never_count_as_the_users_changes() {
        let dir = repo("reado-own");
        let root = dir.to_string_lossy().into_owned();
        // What the user did.
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        std::fs::write(dir.join("new.txt"), "mine\n").unwrap();
        // What Reado did to the same project, unasked: local history snapshots
        // and the MCP registration. `.gitignore` is not offered until the first
        // comment, so without a filter these land in every git-derived view —
        // 110 "changes" for a project with two.
        std::fs::create_dir_all(dir.join(".reado/.history/a.txt")).unwrap();
        std::fs::write(
            dir.join(".reado/.history/a.txt/1789780987010143000"),
            "one\n",
        )
        .unwrap();
        std::fs::write(dir.join(".reado/bookmarks.json"), "[]\n").unwrap();
        std::fs::write(dir.join(".mcp.json"), "{}\n").unwrap();

        let paths: Vec<String> = git_status(root.clone())
            .into_iter()
            .map(|c| c.path)
            .collect();
        assert!(paths.contains(&"a.txt".to_string()), "{paths:?}");
        assert!(paths.contains(&"new.txt".to_string()), "{paths:?}");
        assert!(
            !paths
                .iter()
                .any(|p| p.starts_with(".reado") || p == ".mcp.json"),
            "Reado's own files reached the Source Control view: {paths:?}"
        );

        let scope = git_changed_files(root.clone(), None);
        assert!(
            !scope
                .iter()
                .any(|p| p.starts_with(".reado") || p == ".mcp.json"),
            "Reado's own files reached a review scope: {scope:?}"
        );

        // …and the badge counts the same two files the list shows.
        assert_eq!(git_info(root).changed_files, 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn status_entries_carry_the_code_and_the_real_path() {
        let dir = repo("status-entries");
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("sub/naïve file.txt"), "x\n").unwrap();
        std::fs::create_dir_all(dir.join(".reado")).unwrap();
        std::fs::write(dir.join(".reado/bookmarks.json"), "[]\n").unwrap();
        let mut entries = status_entries(&dir).unwrap();
        entries.sort();
        // Untracked directories expand to files, paths come back unquoted and
        // unescaped, and Reado's own files are not the user's changes.
        assert_eq!(
            entries,
            vec![
                (" M".to_string(), "a.txt".to_string()),
                ("??".to_string(), "sub/naïve file.txt".to_string()),
            ]
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn left_right_counts_are_behind_then_ahead() {
        // git prints "<behind>\t<ahead>": 2 to pull, 3 to push.
        assert_eq!(parse_left_right("2\t3"), (2, 3));
        // Space-separated works too; up-to-date is (0, 0).
        assert_eq!(parse_left_right("0 0"), (0, 0));
        // Garbage / empty degrades to zeros rather than panicking.
        assert_eq!(parse_left_right(""), (0, 0));
        assert_eq!(parse_left_right("x"), (0, 0));
    }

    #[test]
    fn categorizes_status_chars() {
        assert_eq!(categorize_char('?'), "untracked");
        assert_eq!(categorize_char('M'), "modified");
        assert_eq!(categorize_char('A'), "added");
        assert_eq!(categorize_char('D'), "deleted");
        assert_eq!(categorize_char('R'), "renamed");
    }

    #[test]
    fn expands_status_lines() {
        let unstaged = expand_status_line(" M src/main.rs");
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0].path, "src/main.rs");
        assert_eq!(unstaged[0].status, "modified");
        assert!(!unstaged[0].staged);

        let staged = expand_status_line("A  new.rs");
        assert_eq!(staged.len(), 1);
        assert!(staged[0].staged);
        assert_eq!(staged[0].status, "added");

        // Both index and working tree changed → two entries.
        let both = expand_status_line("MM both.rs");
        assert_eq!(both.len(), 2);
        assert!(both[0].staged && !both[1].staged);

        // Unmerged (conflict) states collapse to a single `conflicted` entry,
        // never a staged "modified" one.
        let conflict = expand_status_line("UU both.rs");
        assert_eq!(conflict.len(), 1);
        assert_eq!(conflict[0].status, "conflicted");
        assert!(!conflict[0].staged);
        assert_eq!(expand_status_line("AA x.rs")[0].status, "conflicted");
        assert_eq!(expand_status_line("DU y.rs")[0].status, "conflicted");

        let rename = expand_status_line("R  old.rs -> new.rs");
        assert_eq!(rename[0].path, "new.rs");
        assert_eq!(rename[0].status, "renamed");
        assert!(rename[0].staged);

        let untracked = expand_status_line("?? \"weird name.rs\"");
        assert_eq!(untracked[0].path, "weird name.rs");
        assert_eq!(untracked[0].status, "untracked");
        assert!(!untracked[0].staged);

        assert!(expand_status_line("").is_empty());
    }
}
