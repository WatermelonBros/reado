use super::run_git_raw;
use crate::proc::command;
use std::path::Path;

use serde::Serialize;

// ---- Review-grade git: per-hunk staging and conflict resolution -------------
//
// Staging a whole file is the wrong granularity for review: a working tree
// usually holds one change you want to commit and three you don't. These commands
// operate on a single hunk by feeding `git apply` a patch containing only that
// hunk — which is exactly what `git add -p` does, without the interactive prompt.

/// One hunk of a file's diff, with a patch that applies just it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    /// Position in the file's diff, for stable identity across a refresh.
    pub index: usize,
    /// The `@@ … @@` line, for a compact label.
    pub header: String,
    /// A complete patch applying only this hunk (file headers + the hunk).
    pub patch: String,
    /// First line the hunk touches on the working-tree side, for scroll-to.
    pub new_start: u32,
    /// Added lines in the hunk.
    pub added: u32,
    /// Removed lines in the hunk.
    pub removed: u32,
    /// One patch per added line, when the hunk is unambiguous — no removals, so
    /// keeping the context and one `+` line is a patch that means exactly what
    /// it looks like. Empty for a hunk with removals, where a line in isolation
    /// would be a guess about which side of a replacement you wanted.
    pub line_patches: Vec<LinePatch>,
}

/// One added line of a hunk, with a patch that stages just it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LinePatch {
    /// 1-based line on the working-tree side.
    pub line: u32,
    /// The line's text, without the leading `+`.
    pub text: String,
    pub patch: String,
}

/// Split a pure-addition hunk into one patch per added line.
///
/// Only for hunks with no removals: there, every other `+` line can be dropped
/// and the context kept, and the result is a patch that adds exactly one line.
/// A hunk that also removes lines has no such reading — a `+` in a replacement
/// belongs with the `-` it replaces — so those get nothing rather than something
/// that might stage a half-change.
fn split_hunk_lines(
    header: &[&str],
    hunk_header: &str,
    body: &[String],
    new_start: u32,
) -> Vec<LinePatch> {
    if body.iter().any(|l| l.starts_with('-')) {
        return Vec::new();
    }
    let added: Vec<usize> = body
        .iter()
        .enumerate()
        .filter(|(_, l)| l.starts_with('+'))
        .map(|(i, _)| i)
        .collect();
    // A hunk with one addition is already the finest grain there is.
    if added.len() < 2 {
        return Vec::new();
    }

    let mut out = Vec::new();
    for &keep in &added {
        let mut patch = header.join("\n");
        patch.push('\n');
        patch.push_str(hunk_header);
        patch.push('\n');
        // Offset of this line on the new side: context lines before it, plus one.
        let mut line = new_start;
        for (i, l) in body.iter().enumerate() {
            // Keep every context line, and exactly one of the additions: the
            // other `+` lines are what this patch is deliberately leaving behind.
            if i == keep || !l.starts_with('+') {
                patch.push_str(l);
                patch.push('\n');
            }
            if i < keep && !l.starts_with('-') {
                line += 1;
            }
        }
        out.push(LinePatch {
            line,
            text: body[keep][1..].to_string(),
            patch,
        });
    }
    out
}

/// Split a unified diff of a single file into one applicable patch per hunk.
///
/// Each patch repeats the file's header lines, because `git apply` needs to know
/// which file it is patching — the hunk body alone is not a patch.
fn split_hunks(diff: &str) -> Vec<Hunk> {
    let mut lines = diff.lines().peekable();
    let mut header = Vec::new();
    // Everything before the first `@@` is the file header (diff/index/---/+++).
    while let Some(line) = lines.peek() {
        if line.starts_with("@@") {
            break;
        }
        header.push(*line);
        lines.next();
    }
    if header.is_empty() {
        return Vec::new();
    }

    let mut hunks = Vec::new();
    let mut current: Option<(String, Vec<String>)> = None;
    let flush = |current: Option<(String, Vec<String>)>, hunks: &mut Vec<Hunk>, header: &[&str]| {
        let Some((head, body)) = current else { return };
        let added = body.iter().filter(|l| l.starts_with('+')).count() as u32;
        let removed = body.iter().filter(|l| l.starts_with('-')).count() as u32;
        let new_start = head
            .split_whitespace()
            .find(|t| t.starts_with('+'))
            .and_then(|t| t[1..].split(',').next().and_then(|n| n.parse().ok()))
            .unwrap_or(1);
        let mut patch = header.join("\n");
        patch.push('\n');
        patch.push_str(&head);
        patch.push('\n');
        for line in &body {
            patch.push_str(line);
            patch.push('\n');
        }
        let line_patches = split_hunk_lines(header, &head, &body, new_start);
        hunks.push(Hunk {
            index: hunks.len(),
            header: head,
            patch,
            new_start,
            added,
            removed,
            line_patches,
        });
    };

    for line in lines {
        if line.starts_with("@@") {
            flush(current.take(), &mut hunks, &header);
            current = Some((line.to_string(), Vec::new()));
        } else if let Some((_, body)) = current.as_mut() {
            body.push(line.to_string());
        }
    }
    flush(current.take(), &mut hunks, &header);
    hunks
}

/// The hunks of one file's diff. `staged` reads the index against HEAD (what a
/// commit would contain); otherwise the working tree against the index.
#[tauri::command]
pub fn git_file_hunks(root: String, file: String, staged: bool) -> Vec<Hunk> {
    let mut args = vec!["diff", "--no-color", "--no-ext-diff", "--unified=3"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    let path = Path::new(&root);
    let mut all = args.clone();
    all.push(&file);
    match run_git_raw(path, &all) {
        Some(diff) => split_hunks(&diff),
        None => Vec::new(),
    }
}

/// Whether a patch only touches paths inside the project.
///
/// `git apply` is run with the repo as its cwd and without `--unsafe-paths`, so
/// it already refuses to write outside the working tree; this rejects the patch
/// before it gets there, so a traversal attempt is an error we report rather than
/// a git message we relay.
fn patch_is_confined(patch: &str) -> bool {
    patch
        .lines()
        .filter(|l| l.starts_with("--- ") || l.starts_with("+++ "))
        .all(|l| {
            let path = l[4..].trim();
            let path = path
                .strip_prefix("a/")
                .or_else(|| path.strip_prefix("b/"))
                .unwrap_or(path);
            path == "/dev/null"
                || (!path.starts_with('/')
                    && !path.starts_with("..")
                    && !path.split(['/', '\\']).any(|c| c == ".."))
        })
}

/// Apply a patch with `git apply`.
///
/// `cached` targets the index (staging or unstaging); without it the patch hits
/// the working tree (discarding). `reverse` undoes rather than applies, which is
/// how unstage and discard are expressed — the same patch, run backwards.
#[tauri::command]
pub fn git_apply_patch(
    root: String,
    patch: String,
    cached: bool,
    reverse: bool,
) -> Result<(), String> {
    if !patch_is_confined(&patch) {
        return Err("the patch names a path outside the project".into());
    }
    let mut cmd = command("git");
    cmd.arg("-C").arg(&root).arg("apply");
    if cached {
        cmd.arg("--cached");
    }
    if reverse {
        cmd.arg("--reverse");
    }
    // `--recount` tolerates a hunk whose line counts we recomputed; `-` reads the
    // patch from stdin, so nothing is written to a temp file.
    cmd.args(["--recount", "-"]);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    {
        use std::io::Write;
        let stdin = child.stdin.as_mut().ok_or("could not write the patch")?;
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err(if err.is_empty() {
        "git apply failed".into()
    } else {
        err
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIFF: &str = "diff --git a/src/a.ts b/src/a.ts\nindex 1111111..2222222 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,4 @@\n one\n+two\n three\n four\n@@ -10,2 +11,2 @@\n-old\n+new\n";

    #[test]
    fn splits_a_diff_into_one_applicable_patch_per_hunk() {
        let hunks = split_hunks(DIFF);
        assert_eq!(hunks.len(), 2);
        // Each patch must carry the file headers: a hunk body alone is not a
        // patch, and `git apply` would not know what it is patching.
        for h in &hunks {
            assert!(h.patch.starts_with("diff --git a/src/a.ts b/src/a.ts"));
            assert!(h.patch.contains("--- a/src/a.ts"));
            assert!(h.patch.contains("+++ b/src/a.ts"));
        }
        // …and only its own hunk.
        assert!(hunks[0].patch.contains("+two"));
        assert!(!hunks[0].patch.contains("+new"));
        assert!(hunks[1].patch.contains("+new"));
        assert!(!hunks[1].patch.contains("+two"));
    }

    #[test]
    fn counts_a_hunks_additions_and_removals() {
        let hunks = split_hunks(DIFF);
        assert_eq!((hunks[0].added, hunks[0].removed), (1, 0));
        assert_eq!((hunks[1].added, hunks[1].removed), (1, 1));
        assert_eq!(hunks[0].new_start, 1);
        assert_eq!(hunks[1].new_start, 11);
    }

    const ADDITIONS: &str = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,4 @@\n one\n+two\n+three\n four\n";

    #[test]
    fn a_pure_addition_hunk_offers_one_patch_per_line() {
        let hunks = split_hunks(ADDITIONS);
        let lines = &hunks[0].line_patches;
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "two");
        assert_eq!(lines[1].text, "three");
        // Each patch keeps the context and exactly one of the additions, so it
        // means what it looks like.
        assert!(lines[0].patch.contains("+two"));
        assert!(!lines[0].patch.contains("+three"));
        assert!(lines[0].patch.contains(" one"));
        assert!(lines[1].patch.contains("+three"));
        assert!(!lines[1].patch.contains("+two"));
    }

    #[test]
    fn a_line_patch_reports_where_the_line_lands() {
        let lines = &split_hunks(ADDITIONS)[0].line_patches;
        assert_eq!(lines[0].line, 2);
        assert_eq!(lines[1].line, 3);
    }

    #[test]
    fn a_hunk_with_removals_offers_no_line_patches() {
        // A `+` inside a replacement belongs with the `-` it replaces; staging
        // it alone would be a guess about which side you wanted.
        let hunks = split_hunks(DIFF);
        assert!(hunks[1].line_patches.is_empty());
    }

    #[test]
    fn a_single_addition_needs_no_finer_grain() {
        let one = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n one\n+two\n";
        assert!(split_hunks(one)[0].line_patches.is_empty());
    }

    #[test]
    fn an_empty_diff_has_no_hunks() {
        assert!(split_hunks("").is_empty());
        assert!(split_hunks("diff --git a/x b/x\n").is_empty());
    }

    #[test]
    fn a_patch_escaping_the_project_is_refused() {
        let escape = "diff --git a/../../etc/passwd b/../../etc/passwd\n--- a/../../etc/passwd\n+++ b/../../etc/passwd\n@@ -1 +1 @@\n-x\n+y\n";
        assert!(!patch_is_confined(escape));
        let absolute = "--- /etc/passwd\n+++ /etc/passwd\n";
        assert!(!patch_is_confined(absolute));
        assert!(patch_is_confined(DIFF));
    }

    #[test]
    fn a_patch_escaping_through_a_mid_path_dotdot_is_refused() {
        // The prefix checks miss this one: the path starts with a harmless
        // `src/`, and only the component scan catches the traversal.
        let sneaky = "diff --git a/src/../../../.ssh/authorized_keys b/src/../../../.ssh/authorized_keys\n--- a/src/../../../.ssh/authorized_keys\n+++ b/src/../../../.ssh/authorized_keys\n@@ -1 +1 @@\n-x\n+y\n";
        assert!(!patch_is_confined(sneaky));
        // Windows separators are a traversal too.
        let backslashed = "--- a/src\\..\\..\\evil\n+++ b/src\\..\\..\\evil\n";
        assert!(!patch_is_confined(backslashed));
        // A file legitimately named with dots is still fine.
        let dotted = "--- a/src/..config/x.ts\n+++ b/src/..config/x.ts\n";
        assert!(patch_is_confined(dotted));
    }

    #[test]
    fn a_new_file_patch_is_confined_despite_dev_null() {
        let created =
            "diff --git a/new.ts b/new.ts\n--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+x\n";
        assert!(patch_is_confined(created));
    }
}
