use super::run_git_checked;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// One conflicted region of a file: what each side wants, and where it sits.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRegion {
    pub index: usize,
    /// 1-based line of the `<<<<<<<` marker.
    pub start_line: u32,
    /// 1-based line of the `>>>>>>>` marker.
    pub end_line: u32,
    /// The label after `<<<<<<<` (usually the current branch).
    pub ours_label: String,
    /// The label after `>>>>>>>` (the branch being merged).
    pub theirs_label: String,
    pub ours: String,
    pub theirs: String,
}

/// Which side to keep when resolving a region.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Ours,
    Theirs,
    /// Keep both, ours first — the common "these are independent additions".
    Both,
}

/// Parse a file's conflict markers into regions.
///
/// Reado does not run the merge, so the markers on disk are the only record of
/// what the two sides wanted; parsing them here means the view and the resolver
/// agree on the region boundaries by construction.
fn parse_conflicts(text: &str) -> Vec<ConflictRegion> {
    enum Section {
        Outside,
        Ours,
        Base,
        Theirs,
    }

    let mut regions = Vec::new();
    let mut ours: Vec<&str> = Vec::new();
    let mut theirs: Vec<&str> = Vec::new();
    let mut section = Section::Outside;
    let mut start = 0u32;
    let mut ours_label = String::new();

    for (i, line) in text.lines().enumerate() {
        let no = i as u32 + 1;
        if let Some(label) = line.strip_prefix("<<<<<<< ") {
            section = Section::Ours;
            start = no;
            ours_label = label.trim().to_string();
            ours.clear();
            theirs.clear();
            continue;
        }
        match section {
            Section::Ours if line.starts_with("|||||||") => section = Section::Base,
            Section::Ours | Section::Base if line.starts_with("=======") => {
                section = Section::Theirs;
            }
            Section::Theirs => {
                if let Some(label) = line.strip_prefix(">>>>>>> ") {
                    regions.push(ConflictRegion {
                        index: regions.len(),
                        start_line: start,
                        end_line: no,
                        ours_label: ours_label.clone(),
                        theirs_label: label.trim().to_string(),
                        ours: ours.join("\n"),
                        theirs: theirs.join("\n"),
                    });
                    section = Section::Outside;
                } else {
                    theirs.push(line);
                }
            }
            Section::Ours => ours.push(line),
            Section::Base | Section::Outside => {}
        }
    }
    regions
}

/// The conflicted regions of a file, or empty when it has none.
#[tauri::command]
pub fn git_conflict_regions(root: String, file: String) -> Result<Vec<ConflictRegion>, String> {
    let path = Path::new(&root).join(&file);
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(parse_conflicts(&text))
}

/// Replace one conflicted region with the chosen side, markers and all.
fn resolve_in(text: &str, index: usize, side: Side) -> Option<String> {
    let regions = parse_conflicts(text);
    let region = regions.get(index)?;
    let lines: Vec<&str> = text.split_inclusive('\n').collect();
    let kept = match side {
        Side::Ours => region.ours.clone(),
        Side::Theirs => region.theirs.clone(),
        Side::Both if region.ours.is_empty() => region.theirs.clone(),
        Side::Both if region.theirs.is_empty() => region.ours.clone(),
        Side::Both => format!("{}\n{}", region.ours, region.theirs),
    };

    let before = &lines[..(region.start_line as usize - 1)];
    let after = &lines[region.end_line as usize..];
    let newline = if lines[region.start_line as usize - 1].ends_with("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut joined = before.concat();
    if !kept.is_empty() {
        joined.push_str(&kept.replace('\n', newline));
        joined.push_str(newline);
    }
    joined.extend(after.iter().copied());
    // Preserve the absence of a final newline.
    if after.is_empty() && !text.ends_with('\n') && joined.ends_with(newline) {
        joined.truncate(joined.len() - newline.len());
    }
    Some(joined)
}

/// Resolve one conflicted region by keeping a side. The file is rewritten with
/// that region's markers gone; the others are left for the next decision.
#[tauri::command]
pub fn git_resolve_conflict(
    root: String,
    file: String,
    index: usize,
    side: Side,
) -> Result<(), String> {
    let path = Path::new(&root).join(&file);
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let resolved = resolve_in(&text, index, side).ok_or("no such conflicted region")?;
    std::fs::write(&path, resolved).map_err(|e| e.to_string())
}

/// Abandon an in-progress merge (`git merge --abort`).
#[tauri::command]
pub fn git_merge_abort(root: String) -> Result<(), String> {
    run_git_checked(&root, &["merge", "--abort"])
}

/// Abandon an in-progress rebase (`git rebase --abort`).
#[tauri::command]
pub fn git_rebase_abort(root: String) -> Result<(), String> {
    run_git_checked(&root, &["rebase", "--abort"])
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFLICT: &str =
        "before\n<<<<<<< HEAD\nours line\n=======\ntheirs line\n>>>>>>> feature\nafter\n";

    #[test]
    fn parses_a_conflict_region_with_both_sides_and_their_labels() {
        let regions = parse_conflicts(CONFLICT);
        assert_eq!(regions.len(), 1);
        let r = &regions[0];
        assert_eq!(r.start_line, 2);
        assert_eq!(r.end_line, 6);
        assert_eq!(r.ours_label, "HEAD");
        assert_eq!(r.theirs_label, "feature");
        assert_eq!(r.ours, "ours line");
        assert_eq!(r.theirs, "theirs line");
    }

    const DIFF3: &str = "before\n<<<<<<< HEAD\nours line\n||||||| base\nbase line\n=======\ntheirs line\n>>>>>>> feature\nafter\n";

    #[test]
    fn parses_diff3_without_including_the_base_in_ours() {
        let regions = parse_conflicts(DIFF3);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].ours, "ours line");
        assert_eq!(regions[0].theirs, "theirs line");
        assert_eq!(regions[0].start_line, 2);
        assert_eq!(regions[0].end_line, 8);
    }

    #[test]
    fn resolving_diff3_drops_the_base_for_every_side() {
        for (side, expected) in [
            (Side::Ours, "before\nours line\nafter\n"),
            (Side::Theirs, "before\ntheirs line\nafter\n"),
            (Side::Both, "before\nours line\ntheirs line\nafter\n"),
        ] {
            assert_eq!(resolve_in(DIFF3, 0, side).unwrap(), expected);
        }
    }

    #[test]
    fn a_file_without_markers_has_no_regions() {
        assert!(parse_conflicts("just code\n").is_empty());
    }

    #[test]
    fn a_separator_outside_a_conflict_is_ordinary_text() {
        // `=======` is a Markdown setext rule, an ASCII table edge, a changelog
        // divider. Without the state guard the parser treats one as the start of
        // "theirs" and reports a phantom region — which `git_resolve_conflict`
        // would then happily rewrite the file from.
        assert!(parse_conflicts("Title\n=======\nbody\n>>>>>>> nope\n").is_empty());

        // A rule *before* a real conflict must not disturb it either.
        let mixed = "Title\n=======\nintro\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n";
        let regions = parse_conflicts(mixed);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].start_line, 4);
    }

    #[test]
    fn parses_several_regions_independently() {
        let two = format!("{CONFLICT}{CONFLICT}");
        let regions = parse_conflicts(&two);
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[1].index, 1);
    }

    #[test]
    fn resolving_keeps_the_chosen_side_and_drops_the_markers() {
        let ours = resolve_in(CONFLICT, 0, Side::Ours).unwrap();
        assert_eq!(ours, "before\nours line\nafter\n");
        let theirs = resolve_in(CONFLICT, 0, Side::Theirs).unwrap();
        assert_eq!(theirs, "before\ntheirs line\nafter\n");
        let both = resolve_in(CONFLICT, 0, Side::Both).unwrap();
        assert_eq!(both, "before\nours line\ntheirs line\nafter\n");
    }

    #[test]
    fn resolving_one_region_leaves_the_others_conflicted() {
        let two = format!("{CONFLICT}{CONFLICT}");
        let resolved = resolve_in(&two, 0, Side::Ours).unwrap();
        assert_eq!(
            parse_conflicts(&resolved).len(),
            1,
            "the second still stands"
        );
    }

    #[test]
    fn resolving_preserves_the_trailing_newline() {
        let without = "a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b";
        assert!(!resolve_in(without, 0, Side::Ours).unwrap().ends_with('\n'));
        assert!(resolve_in(CONFLICT, 0, Side::Ours).unwrap().ends_with('\n'));
    }

    #[test]
    fn resolving_preserves_crlf_for_every_side() {
        for trailing_newline in [false, true] {
            let conflict = CONFLICT.replace('\n', "\r\n");
            let conflict = if trailing_newline {
                conflict.as_str()
            } else {
                conflict.trim_end_matches("\r\n")
            };
            for (side, kept) in [
                (Side::Ours, "ours line"),
                (Side::Theirs, "theirs line"),
                (Side::Both, "ours line\r\ntheirs line"),
            ] {
                let ending = if trailing_newline { "\r\n" } else { "" };
                let expected = format!("before\r\n{kept}\r\nafter{ending}");
                assert_eq!(resolve_in(conflict, 0, side).unwrap(), expected);
            }
        }
    }

    #[test]
    fn resolving_preserves_line_endings_outside_the_region() {
        let conflict = CONFLICT.replace('\n', "\r\n");
        let text = format!("prefix\n{conflict}{conflict}suffix\n");
        let expected = format!("prefix\nbefore\r\nours line\r\nafter\r\n{conflict}suffix\n");
        assert_eq!(resolve_in(&text, 0, Side::Ours).unwrap(), expected);
    }

    #[test]
    fn keeping_both_of_an_empty_side_does_not_add_a_blank_line() {
        let empty_ours = "a\n<<<<<<< HEAD\n=======\ny\n>>>>>>> b\n";
        assert_eq!(resolve_in(empty_ours, 0, Side::Both).unwrap(), "a\ny\n");
    }

    #[test]
    fn resolving_an_unknown_region_is_refused() {
        assert!(resolve_in(CONFLICT, 5, Side::Ours).is_none());
    }
}
