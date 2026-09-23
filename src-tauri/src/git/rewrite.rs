use super::status::conflicted_files;
use super::{run_git, run_git_checked, run_git_checked_env, GitCommit};
use std::path::Path;

use serde::Deserialize;

// ---- Fixing what just happened ----------------------------------------------
//
// Amend, revert, cherry-pick, tags and remotes. These are what a reader reaches
// for *after* a commit — a typo in the message, a commit that has to come back
// out, a fix that belongs on this branch too — and until now every one of them
// meant leaving the editor for a terminal.

/// Whether the commit at HEAD is already on the upstream.
///
/// Amending it then rewrites history other people may already have, which is a
/// different decision from fixing a commit that never left this machine — so the
/// UI asks first, and this is the question behind that.
#[tauri::command]
pub fn git_head_is_pushed(root: String) -> bool {
    let path = Path::new(&root);
    let Some(head) = run_git(path, &["rev-parse", "HEAD"]) else {
        return false;
    };
    // `branch -r --contains` lists the remote branches holding this commit;
    // anything at all means it is out there.
    run_git(path, &["branch", "-r", "--contains", head.trim()])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

/// Amend the last commit with whatever is staged. An empty message reuses the
/// existing one (`--no-edit`), which is the "I forgot a file" case.
#[tauri::command]
pub fn git_amend(root: String, message: Option<String>) -> Result<(), String> {
    match message.as_deref().map(str::trim).filter(|m| !m.is_empty()) {
        Some(m) => run_git_checked(&root, &["commit", "--amend", "-m", m]),
        None => run_git_checked(&root, &["commit", "--amend", "--no-edit"]),
    }
}

/// What an apply-a-commit operation did.
#[derive(Debug, serde::Serialize)]
pub struct ApplyOutcome {
    /// Files left conflicted; empty means it applied cleanly.
    pub conflicted: Vec<String>,
}

/// Revert a commit: a new commit that undoes it, leaving the original in place.
#[tauri::command]
pub fn git_revert(root: String, commit: String) -> Result<ApplyOutcome, String> {
    apply_commit(&root, &["revert", "--no-edit", commit.trim()])
}

/// Apply one commit from elsewhere onto the current branch.
#[tauri::command]
pub fn git_cherry_pick(root: String, commit: String) -> Result<ApplyOutcome, String> {
    apply_commit(&root, &["cherry-pick", commit.trim()])
}

/// The shared half of revert and cherry-pick: run it, and read a failure as
/// conflicts when that is what it is.
fn apply_commit(root: &str, args: &[&str]) -> Result<ApplyOutcome, String> {
    apply_commit_env(root, args, &[])
}

/// As [`apply_commit`], carrying environment variables through.
fn apply_commit_env(
    root: &str,
    args: &[&str],
    env: &[(&str, &str)],
) -> Result<ApplyOutcome, String> {
    match run_git_checked_env(root, args, env) {
        Ok(()) => Ok(ApplyOutcome { conflicted: vec![] }),
        Err(e) => {
            // Not a failure with a message nobody can act on: it is work waiting
            // in the working tree, and Reado already has a resolver for it.
            let conflicted = conflicted_files(root);
            if conflicted.is_empty() {
                Err(e)
            } else {
                Ok(ApplyOutcome { conflicted })
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The rest of the daily loop: merging, rebasing, worktrees, submodules, and the
// history as a graph. What these have in common is that they were the reasons
// left to open a terminal.
// ---------------------------------------------------------------------------

/// Merge a branch into the current one. A conflicting merge is not an error —
/// it is work waiting in the working tree, the same as a cherry-pick's.
#[tauri::command]
pub fn git_merge(root: String, branch: String) -> Result<ApplyOutcome, String> {
    apply_commit(&root, &["merge", "--no-edit", branch.trim()])
}

/// Replay this branch's commits on top of another (`git rebase <onto>`).
#[tauri::command]
pub fn git_rebase(root: String, onto: String) -> Result<ApplyOutcome, String> {
    apply_commit(&root, &["rebase", onto.trim()])
}

/// What the sequencer is in the middle of, if anything. The conflict resolver
/// needs it to know what finishing means: a merge ends with a commit, a rebase
/// with `--continue`, and telling the user to commit during a rebase is how a
/// rebase gets lost.
#[tauri::command]
pub fn git_sequencer(root: String) -> Option<String> {
    let dir = run_git(Path::new(&root), &["rev-parse", "--git-dir"])?;
    let dir = Path::new(&root).join(dir.trim());
    // `rebase-merge` is the interactive/merge backend, `rebase-apply` the old
    // am-based one; either means a rebase is halfway through.
    for (marker, state) in [
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
        ("MERGE_HEAD", "merge"),
    ] {
        if dir.join(marker).exists() {
            return Some(state.to_string());
        }
    }
    None
}

/// Carry on after the conflicts of a rebase / cherry-pick / revert are resolved.
/// Staging is ours to do: git will not continue with unmerged paths, and the
/// resolver writes the files without touching the index.
#[tauri::command]
pub fn git_sequencer_continue(root: String) -> Result<ApplyOutcome, String> {
    let op = git_sequencer(root.clone()).ok_or("Nothing to continue.")?;
    if op == "merge" {
        return Err("Finish a merge by committing.".into());
    }
    run_git_checked(&root, &["add", "-A"])?;
    // `--no-edit` keeps the commit message git already has, and `GIT_EDITOR`
    // catches the editor git opens anyway on the paths that ignore it — an
    // interactive rebase continuing through a squash is one. Without both, the
    // command waits forever on an editor that does not exist here.
    apply_commit_env(
        &root,
        &[op.as_str(), "--continue", "--no-edit"],
        &[("GIT_EDITOR", "true")],
    )
}

/// One line of an interactive rebase's plan.
#[derive(Debug, Deserialize)]
pub struct TodoLine {
    /// One of [`TODO_ACTIONS`].
    pub action: String,
    pub hash: String,
}

/// What a plan may ask for. `reword` is absent on purpose: it is the one action
/// that opens an editor per commit, and it has no answer to give here — Reado
/// amends instead. Anything outside this list is refused rather than written:
/// these lines go into a file git *executes*, so the list is a trust boundary,
/// not a convenience.
const TODO_ACTIONS: [&str; 4] = ["pick", "squash", "fixup", "drop"];

/// The commits an interactive rebase onto `upstream` would replay, oldest first
/// — the order the todo file uses, so the UI can present the plan as git will.
///
/// `--no-merges` because that is what git's own todo contains: a plain
/// `rebase -i` flattens history and never lists a merge, and asking it to `pick`
/// one is an error. Listing a commit the plan cannot act on would be offering a
/// button that fails.
#[tauri::command]
pub fn git_rebase_commits(root: String, upstream: String) -> Vec<GitCommit> {
    run_git(
        Path::new(&root),
        &[
            "log",
            "--reverse",
            "--no-merges",
            "--format=%H%x1f%s",
            &format!("{}..HEAD", upstream.trim()),
        ],
    )
    .map(|s| {
        s.lines()
            .filter_map(|l| l.split_once('\x1f'))
            .map(|(hash, subject)| GitCommit {
                hash: hash.to_string(),
                subject: subject.to_string(),
            })
            .collect()
    })
    .unwrap_or_default()
}

/// Run an interactive rebase from a plan Reado already has.
///
/// `git rebase -i` wants a human with an editor: it writes a todo file and opens
/// `$GIT_SEQUENCE_EDITOR` on it. Reado has the plan the moment the user presses
/// the button, so the "editor" is a copy of our file over git's — the same
/// mechanism `GIT_SEQUENCE_EDITOR=true` uses to accept the default, pointed at a
/// file instead. `GIT_EDITOR=true` covers the second editor git opens, for the
/// message of a squash.
#[tauri::command]
pub fn git_rebase_interactive(
    root: String,
    upstream: String,
    todo: Vec<TodoLine>,
) -> Result<ApplyOutcome, String> {
    if todo.is_empty() {
        return Err("Nothing to rebase.".into());
    }
    for line in &todo {
        if !TODO_ACTIONS.contains(&line.action.as_str()) {
            return Err(format!("Unknown rebase action: {}", line.action));
        }
        if line.hash.len() < 4 || !line.hash.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("A rebase plan takes commit hashes.".into());
        }
    }
    if todo.iter().all(|l| l.action == "drop") {
        return Err("A rebase that drops every commit would leave nothing.".into());
    }
    // A squash or fixup has nothing to fold into when it is first.
    if matches!(todo[0].action.as_str(), "squash" | "fixup") {
        return Err("The first commit has nothing to squash into.".into());
    }
    let plan: String = todo
        .iter()
        .map(|l| format!("{} {}\n", l.action, l.hash))
        .collect();
    // Written beside the repo's git dir rather than the system temp: it holds
    // commit hashes, and it is deleted either way.
    let file = std::env::temp_dir().join(format!("reado-rebase-{}.todo", std::process::id()));
    std::fs::write(&file, plan).map_err(|e| e.to_string())?;
    let quoted = file.display();
    let editor = if cfg!(windows) {
        format!("cmd /c copy /y \"{quoted}\"")
    } else {
        format!("cp '{quoted}'")
    };
    let outcome = apply_commit_env(
        &root,
        &["rebase", "-i", upstream.trim()],
        &[("GIT_SEQUENCE_EDITOR", &editor), ("GIT_EDITOR", "true")],
    );
    let _ = std::fs::remove_file(&file);
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::{log, repo};

    #[test]
    fn amend_rewrites_the_last_commit_rather_than_adding_one() {
        let dir = repo("amend");
        let root = dir.to_string_lossy().into_owned();
        std::fs::write(dir.join("b.txt"), "two\n").unwrap();
        run_git_checked(&root, &["add", "."]).unwrap();
        git_amend(root.clone(), Some("first, properly".into())).unwrap();
        assert_eq!(log(&root), vec!["first, properly"]);
        // The forgotten file is part of that one commit now.
        let files = run_git(
            Path::new(&root),
            &["show", "--name-only", "--format=", "HEAD"],
        )
        .unwrap();
        assert!(files.contains("b.txt"), "got: {files}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn amend_with_no_message_keeps_the_one_it_had() {
        let dir = repo("amend-nomsg");
        let root = dir.to_string_lossy().into_owned();
        std::fs::write(dir.join("b.txt"), "two\n").unwrap();
        run_git_checked(&root, &["add", "."]).unwrap();
        git_amend(root.clone(), None).unwrap();
        assert_eq!(log(&root), vec!["first"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_commit_that_never_left_is_not_reported_as_pushed() {
        let dir = repo("pushed");
        let root = dir.to_string_lossy().into_owned();
        assert!(!git_head_is_pushed(root));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn revert_undoes_a_commit_and_leaves_it_in_the_history() {
        let dir = repo("revert");
        let root = dir.to_string_lossy().into_owned();
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        run_git_checked(&root, &["commit", "-aqm", "second"]).unwrap();
        let head = run_git(Path::new(&root), &["rev-parse", "HEAD"]).unwrap();
        let out = git_revert(root.clone(), head.trim().into()).unwrap();
        assert!(out.conflicted.is_empty());
        assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "one\n");
        // Three entries: the revert is a new commit, not a rewrite.
        assert_eq!(log(&root).len(), 3);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_revert_that_conflicts_reports_the_files_rather_than_claiming_success() {
        let dir = repo("revert-conflict");
        let root = dir.to_string_lossy().into_owned();
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        run_git_checked(&root, &["commit", "-aqm", "second"]).unwrap();
        let head = run_git(Path::new(&root), &["rev-parse", "HEAD"]).unwrap();
        // Move the same line again, so undoing the middle commit cannot apply.
        std::fs::write(dir.join("a.txt"), "three\n").unwrap();
        run_git_checked(&root, &["commit", "-aqm", "third"]).unwrap();
        let out = git_revert(root.clone(), head.trim().into()).unwrap();
        assert_eq!(out.conflicted, vec!["a.txt".to_string()]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cherry_pick_brings_one_commit_across() {
        let dir = repo("cherry");
        let root = dir.to_string_lossy().into_owned();
        run_git_checked(&root, &["checkout", "-qb", "side"]).unwrap();
        std::fs::write(dir.join("c.txt"), "from side\n").unwrap();
        run_git_checked(&root, &["add", "."]).unwrap();
        run_git_checked(&root, &["commit", "-qm", "side work"]).unwrap();
        let head = run_git(Path::new(&root), &["rev-parse", "HEAD"]).unwrap();
        run_git_checked(&root, &["checkout", "-q", "main"]).unwrap();
        assert!(!dir.join("c.txt").exists());
        let out = git_cherry_pick(root.clone(), head.trim().into()).unwrap();
        assert!(out.conflicted.is_empty());
        assert!(dir.join("c.txt").exists());
        std::fs::remove_dir_all(&dir).ok();
    }
}

#[cfg(test)]
mod rebase_plan_tests {
    use super::*;

    fn line(action: &str, hash: &str) -> TodoLine {
        TodoLine {
            action: action.into(),
            hash: hash.into(),
        }
    }

    // The plan is written into a file git executes, so what may appear in it is
    // a trust boundary — checked before anything is written, in a directory that
    // need not even be a repository.
    #[test]
    fn refuses_anything_that_is_not_one_of_the_four_actions() {
        for bad in ["exec", "x; rm -rf /", "pick\nexec echo hi", ""] {
            let err = git_rebase_interactive(
                "/nonexistent".into(),
                "main".into(),
                vec![line(bad, "abc1234")],
            )
            .unwrap_err();
            assert!(err.contains("Unknown rebase action"), "{bad}: {err}");
        }
    }

    #[test]
    fn refuses_a_hash_that_is_not_one() {
        let err = git_rebase_interactive(
            "/nonexistent".into(),
            "main".into(),
            vec![line("pick", "$(whoami)")],
        )
        .unwrap_err();
        assert!(err.contains("commit hashes"), "{err}");
    }

    #[test]
    fn refuses_the_plans_git_would_refuse() {
        let empty = git_rebase_interactive("/nonexistent".into(), "main".into(), vec![]);
        assert!(empty.unwrap_err().contains("Nothing to rebase"));

        let all_dropped = git_rebase_interactive(
            "/nonexistent".into(),
            "main".into(),
            vec![line("drop", "aaaaaaa"), line("drop", "bbbbbbb")],
        );
        assert!(all_dropped.unwrap_err().contains("every commit"));

        let folds_first = git_rebase_interactive(
            "/nonexistent".into(),
            "main".into(),
            vec![line("squash", "aaaaaaa"), line("pick", "bbbbbbb")],
        );
        assert!(folds_first.unwrap_err().contains("nothing to squash"));
    }
}

#[cfg(test)]
mod rebase_range_tests {
    use super::*;
    use std::process::Command;

    /// A repository with a branch that was merged back, so the range being
    /// replayed contains a merge.
    fn repo_with_a_merge() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let at = dir.path();
        let git = |args: &[&str]| {
            let out = Command::new("git")
                .arg("-C")
                .arg(at)
                .args(args)
                .output()
                .expect("git");
            assert!(out.status.success(), "git {args:?}: {:?}", out);
        };
        let write = |name: &str, body: &str| std::fs::write(at.join(name), body).unwrap();
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.email", "t@example.com"]);
        git(&["config", "user.name", "T"]);
        write("a", "one\n");
        git(&["add", "-A"]);
        git(&["commit", "-qm", "base"]);
        git(&["branch", "start"]);
        git(&["checkout", "-qb", "side"]);
        write("b", "side\n");
        git(&["add", "-A"]);
        git(&["commit", "-qm", "on the side"]);
        git(&["checkout", "-q", "main"]);
        write("c", "trunk\n");
        git(&["add", "-A"]);
        git(&["commit", "-qm", "on the trunk"]);
        git(&["merge", "--no-ff", "-q", "-m", "merge side", "side"]);
        dir
    }

    // Found by running a rebase in the app: the plan listed the merge commit,
    // and git cannot `pick` one in a plain interactive rebase — it is not in the
    // todo it generates. Offering it is offering a button that fails.
    #[test]
    fn the_plan_leaves_out_merge_commits() {
        let dir = repo_with_a_merge();
        let root = dir.path().to_string_lossy().into_owned();
        let subjects: Vec<String> = git_rebase_commits(root, "start".into())
            .into_iter()
            .map(|c| c.subject)
            .collect();
        assert!(
            !subjects.iter().any(|s| s.starts_with("merge ")),
            "the merge commit must not be in the plan: {subjects:?}"
        );
        // And everything that *is* replayable still is, oldest first.
        assert_eq!(subjects, ["on the side", "on the trunk"]);
    }
}
