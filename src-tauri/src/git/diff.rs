use super::run_git_raw;
use crate::proc::command;
use std::path::Path;

/// The contents of a tracked file at a given ref (a branch, commit, or `HEAD`),
/// for the on-demand diff view. Returns `None` when the file is absent there or
/// git is unavailable. Output is verbatim (no trimming) so the diff is exact.
///
/// "Absent" and "no such ref" are the same answer here on purpose: a caller that
/// wants the file's *bytes* at a ref (the PR reader) falls back to the working
/// tree either way. A caller that wants a document to *diff against* wants
/// `git_diff_base` instead.
#[tauri::command]
pub fn git_show_ref(root: String, file: String, base: String) -> Option<String> {
    let reference = if base.is_empty() { "HEAD" } else { &base };
    // `git show <ref>:<path>` expects forward slashes, which is what we store.
    let output = command("git")
        .arg("-C")
        .arg(&root)
        .args(["show", &format!("{reference}:{file}")])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// The document to diff a file against at `base` — a different question from
/// "what are this file's bytes there", and it needs a different answer:
///
///   - `Some(text)` — the file is in that commit.
///   - `Some("")`   — the commit is fine but the file isn't in it. The file was
///                    added since the base, so its base is an empty document and
///                    the diff reads as all-added. A new file deserves a green
///                    diff, not "no base to compare against".
///   - `None`       — the ref itself doesn't resolve (not a repo, no commits, a
///                    base that no longer exists). Only then is there genuinely
///                    nothing to diff against.
#[tauri::command]
pub fn git_diff_base(root: String, file: String, base: String) -> Option<String> {
    let reference = if base.is_empty() {
        "HEAD"
    } else {
        base.as_str()
    };
    let exists = ref_exists(Path::new(&root), reference);
    git_show_ref(root, file, base).or_else(|| exists.then(String::new))
}

/// Whether `reference` resolves to a commit in this repository.
fn ref_exists(root: &Path, reference: &str) -> bool {
    run_git_raw(
        root,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{reference}^{{commit}}"),
        ],
    )
    .is_some()
}

/// Line ranges the working tree changes relative to HEAD, for the diff gutter.
///
/// Distinct from `git_diff_lines`, which compares two refs: the gutter is about
/// what *you* have touched and not committed, so the right-hand side is the file
/// on disk, not another commit. Ranges are 1-based and inclusive, on the working
/// copy's numbering, which is what the editor is showing.
#[tauri::command]
pub fn git_working_diff_lines(root: String, file: String) -> Vec<[u32; 2]> {
    let output = match command("git")
        .arg("-C")
        .arg(&root)
        // `HEAD` (not `--cached`) so both staged and unstaged edits are marked:
        // the gutter answers "is this line different from the last commit".
        .args(["diff", "--unified=0", "HEAD", "--", &file])
        .output()
    {
        Ok(o) if o.status.success() => o,
        // Not a repo, or a file git has never seen — no marks, not an error.
        _ => return Vec::new(),
    };
    parse_diff_hunks(&String::from_utf8_lossy(&output.stdout))
}

/// The line ranges a file gained or changed between two refs (`base...head`,
/// merge-base semantics — a PR's own changes). Each `[start, end]` is 1-based and
/// inclusive on the *head* side, for inline change markers in the reader. Empty
/// on any failure. Pure deletions (no head lines) are omitted.
#[tauri::command]
pub fn git_diff_lines(root: String, file: String, base: String, head: String) -> Vec<[u32; 2]> {
    let range = format!("{base}...{head}");
    let output = match command("git")
        .arg("-C")
        .arg(&root)
        .args(["diff", "--unified=0", &range, "--", &file])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };
    let text = String::from_utf8_lossy(&output.stdout);
    parse_diff_hunks(&text)
}

/// Parse the head-side changed-line ranges out of a `git diff --unified=0` body.
/// Reads each unified-diff hunk header `@@ -a,b +c,d @@ …` and keeps the `+c,d`
/// (head) side: `[start, start + count - 1]`, 1-based and inclusive. A missing
/// count defaults to 1 (`@@ -1 +2 @@` → `[2, 2]`); a zero count is a pure
/// deletion and is skipped; malformed headers are ignored. Pure so it can be
/// unit-tested without spawning git.
fn parse_diff_hunks(diff: &str) -> Vec<[u32; 2]> {
    let mut ranges = Vec::new();
    for line in diff.lines() {
        // Hunk header: `@@ -a,b +c,d @@ …`. The `+c,d` is the head-side range.
        let Some(rest) = line.strip_prefix("@@") else {
            continue;
        };
        let Some(plus) = rest.split_whitespace().find(|t| t.starts_with('+')) else {
            continue;
        };
        let mut nums = plus[1..].split(',');
        let Some(start) = nums.next().and_then(|s| s.parse::<u32>().ok()) else {
            continue;
        };
        let count = nums.next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(1);
        if count == 0 {
            continue; // a pure deletion — nothing to mark on the head side
        }
        ranges.push([start, start + count - 1]);
    }
    ranges
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_diff_hunk_headers() {
        // Added block: start 5, count 3 → [5, 7].
        assert_eq!(parse_diff_hunks("@@ -1,0 +5,3 @@"), vec![[5, 7]]);
        // Omitted count defaults to 1: `+2` → [2, 2].
        assert_eq!(parse_diff_hunks("@@ -1 +2 @@"), vec![[2, 2]]);
        // Pure deletion (count 0 on the head side) is skipped.
        assert!(parse_diff_hunks("@@ -3,2 +4,0 @@").is_empty());

        // Multiple hunks in one diff body, interleaved with content lines.
        let diff = "\
diff --git a/f b/f
--- a/f
+++ b/f
@@ -1,0 +5,3 @@
+added
+added
+added
@@ -10,1 +20,1 @@ fn ctx()
-old
+new
@@ -30,2 +40,0 @@
-gone
-gone";
        assert_eq!(parse_diff_hunks(diff), vec![[5, 7], [20, 20]]);

        // Malformed headers are ignored: no `@@` prefix, no `+` token, and a
        // non-numeric start all yield nothing.
        assert!(parse_diff_hunks("not a hunk header").is_empty());
        assert!(parse_diff_hunks("@@ -1,2 nope @@").is_empty());
        assert!(parse_diff_hunks("@@ -1 +abc @@").is_empty());
    }

    /// A repository with one committed file, for the `git_show_ref` cases below.
    fn repo_with_one_commit() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let git = |args: &[&str]| {
            let ok = command("git")
                .arg("-C")
                .arg(root)
                .args(args)
                .output()
                .expect("git is available")
                .status
                .success();
            assert!(ok, "git {args:?} failed");
        };
        git(&["init", "--initial-branch=main"]);
        git(&["config", "user.email", "test@example.com"]);
        git(&["config", "user.name", "Test"]);
        std::fs::write(root.join("tracked.txt"), "one\ntwo\n").unwrap();
        git(&["add", "tracked.txt"]);
        git(&["commit", "-m", "first"]);
        dir
    }

    #[test]
    fn the_diff_base_of_a_committed_file_is_its_committed_contents() {
        let dir = repo_with_one_commit();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "tracked.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text.as_deref(), Some("one\ntwo\n"));
    }

    #[test]
    fn a_file_added_since_the_base_diffs_against_an_empty_base() {
        // A brand-new file isn't in HEAD. That's not "no base to diff against" —
        // it's a file whose every line is added, so the base is an empty document
        // and the diff reads all-green.
        let dir = repo_with_one_commit();
        std::fs::write(dir.path().join("brand-new.txt"), "hello\n").unwrap();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "brand-new.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text.as_deref(), Some(""));
    }

    #[test]
    fn a_staged_new_file_also_diffs_against_an_empty_base() {
        let dir = repo_with_one_commit();
        std::fs::write(dir.path().join("staged.txt"), "hello\n").unwrap();
        command("git")
            .arg("-C")
            .arg(dir.path())
            .args(["add", "staged.txt"])
            .output()
            .unwrap();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "staged.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text.as_deref(), Some(""));
    }

    #[test]
    fn reading_a_file_absent_from_the_ref_still_reports_nothing() {
        // git_show_ref keeps its old contract: the PR reader falls back to the
        // working tree when the path isn't in the ref.
        let dir = repo_with_one_commit();
        std::fs::write(dir.path().join("brand-new.txt"), "hello\n").unwrap();
        let text = git_show_ref(
            dir.path().to_string_lossy().into_owned(),
            "brand-new.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text, None);
    }

    #[test]
    fn a_base_that_does_not_resolve_has_no_contents_at_all() {
        // Only here is there genuinely nothing to diff against.
        let dir = repo_with_one_commit();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "tracked.txt".into(),
            "no-such-branch".into(),
        );
        assert_eq!(text, None);
    }

    #[test]
    fn outside_a_repository_there_is_no_base() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "hello\n").unwrap();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "a.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text, None);
    }
}
