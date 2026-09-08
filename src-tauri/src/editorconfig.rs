//! `.editorconfig` support.
//!
//! The file that tells every editor how a repository is written — indentation,
//! line endings, whether to trim trailing whitespace — so the answer travels
//! with the code instead of living in each person's settings. Reado already
//! *guesses* a file's indentation by looking at it; this is the project saying
//! so out loud, and it wins.
//!
//! Resolution follows the spec: walk up from the file to the filesystem root,
//! stopping at the first `.editorconfig` whose preamble says `root = true`, then
//! apply the collected files outermost-first so the closest one wins.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::Result;

/// The properties Reado understands. `None` means "the file didn't say", which
/// is different from "the file said no" — the frontend falls back to its own
/// detection only for the ones nobody set.
#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorConfig {
    /// "tab" or "space".
    pub indent_style: Option<String>,
    /// Columns per indent level. `indent_size = tab` resolves to `tab_width`.
    pub indent_size: Option<u32>,
    pub tab_width: Option<u32>,
    /// "lf", "crlf" or "cr".
    pub end_of_line: Option<String>,
    pub trim_trailing_whitespace: Option<bool>,
    pub insert_final_newline: Option<bool>,
    /// `max_line_length = off` comes back as `Some(0)` — "explicitly none",
    /// which has to outrank an outer file's number.
    pub max_line_length: Option<u32>,
    /// Whether any `.editorconfig` applied to this file at all. The frontend
    /// shows "following .editorconfig" only when something really did.
    pub applies: bool,
}

/// Translate one editorconfig glob into a globset pattern, relative to the
/// directory holding the `.editorconfig`.
///
/// The spec's two rules that a plain glob library doesn't know: a pattern with
/// no `/` matches the file name at any depth, and a leading `/` anchors it to
/// the config's own directory.
///
/// Not supported: `{num1..num2}` numeric ranges, which globset has no equivalent
/// for and which almost nothing uses.
fn to_glob(pattern: &str) -> String {
    let p = pattern.trim();
    if let Some(rest) = p.strip_prefix('/') {
        return rest.to_string();
    }
    if p.contains('/') {
        p.to_string()
    } else {
        format!("**/{p}")
    }
}

/// Whether `rel` (a path relative to the `.editorconfig`'s directory, with `/`
/// separators) is covered by `pattern`.
fn matches(pattern: &str, rel: &str) -> bool {
    // Braces in editorconfig can hold a single alternative (`{ts}`); globset
    // rejects those, so a failed compile means "doesn't match", never a panic.
    globset::GlobBuilder::new(&to_glob(pattern))
        .literal_separator(true)
        .build()
        .ok()
        .is_some_and(|g| g.compile_matcher().is_match(rel))
}

fn parse_bool(v: &str) -> Option<bool> {
    match v.to_ascii_lowercase().as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

/// Fold one `.editorconfig` file's matching sections into `out`.
///
/// `root = true` is *not* read here: `resolve` needs it during the upward walk,
/// before this runs, so it parses the preamble itself — a second answer here
/// would be one nobody could act on.
fn apply_file(text: &str, dir: &Path, target: &Path, out: &mut EditorConfig) {
    let Ok(rel) = target.strip_prefix(dir) else {
        return;
    };
    let rel = rel.to_string_lossy().replace('\\', "/");

    let mut in_preamble = true;
    let mut active = false;

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if let Some(section) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
            in_preamble = false;
            active = matches(section, &rel);
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        if in_preamble {
            continue;
        }
        if !active {
            continue;
        }
        match key.as_str() {
            "indent_style" => out.indent_style = Some(value.to_ascii_lowercase()),
            "indent_size" => {
                // `indent_size = tab` defers to tab_width; recorded as unset here
                // and resolved once every file has been folded in.
                out.indent_size = value.parse().ok()
            }
            "tab_width" => out.tab_width = value.parse().ok(),
            "end_of_line" => out.end_of_line = Some(value.to_ascii_lowercase()),
            "trim_trailing_whitespace" => out.trim_trailing_whitespace = parse_bool(value),
            "insert_final_newline" => out.insert_final_newline = parse_bool(value),
            "max_line_length" => {
                out.max_line_length = if value.eq_ignore_ascii_case("off") {
                    Some(0)
                } else {
                    value.parse().ok()
                }
            }
            _ => continue,
        }
        out.applies = true;
    }
}

/// Resolve the `.editorconfig` properties that apply to `target`.
///
/// `stop_at` bounds the upward walk (the project root): a config above the
/// opened project would be describing files Reado can't see anyway, and reading
/// arbitrary parent directories is a surface we don't need.
pub fn resolve(stop_at: &Path, target: &Path) -> EditorConfig {
    // Collect innermost-first, then apply in reverse so the closest file wins.
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut cursor = target.parent();
    while let Some(dir) = cursor {
        dirs.push(dir.to_path_buf());
        if dir == stop_at {
            break;
        }
        cursor = dir.parent();
    }

    let mut files: Vec<(PathBuf, String)> = Vec::new();
    for dir in &dirs {
        let path = dir.join(".editorconfig");
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let is_root = text
            .lines()
            .take_while(|l| !l.trim_start().starts_with('['))
            .filter_map(|l| l.split_once('='))
            .any(|(k, v)| {
                k.trim().eq_ignore_ascii_case("root") && parse_bool(v.trim()) == Some(true)
            });
        files.push((dir.clone(), text));
        if is_root {
            break;
        }
    }

    let mut out = EditorConfig::default();
    for (dir, text) in files.iter().rev() {
        apply_file(text, dir, target, &mut out);
    }
    // `indent_size = tab` and a bare `tab_width`: either can stand in for the
    // other, which is what makes a tab-indented project need only one of them.
    if out.indent_size.is_none() {
        out.indent_size = out.tab_width;
    }
    if out.tab_width.is_none() {
        out.tab_width = out.indent_size;
    }
    out
}

/// The `.editorconfig` properties for one project file.
#[tauri::command]
pub fn editor_config_for(root: String, path: String) -> Result<EditorConfig> {
    let root = PathBuf::from(&root);
    let target = crate::fs::ensure_within(&root, &PathBuf::from(&path))?;
    Ok(resolve(&root, &target))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Write `files` (relative path → content) under a fresh temp root.
    fn tree(files: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (rel, body) in files {
            let path = dir.path().join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, body).unwrap();
        }
        dir
    }

    #[test]
    fn reads_the_properties_reado_acts_on() {
        let d = tree(&[
            (
                ".editorconfig",
                "root = true\n\n[*]\nindent_style = space\nindent_size = 4\nend_of_line = crlf\ntrim_trailing_whitespace = true\ninsert_final_newline = true\nmax_line_length = 100\n",
            ),
            ("a.ts", ""),
        ]);
        let cfg = resolve(d.path(), &d.path().join("a.ts"));
        assert_eq!(cfg.indent_style.as_deref(), Some("space"));
        assert_eq!(cfg.indent_size, Some(4));
        assert_eq!(cfg.end_of_line.as_deref(), Some("crlf"));
        assert_eq!(cfg.trim_trailing_whitespace, Some(true));
        assert_eq!(cfg.insert_final_newline, Some(true));
        assert_eq!(cfg.max_line_length, Some(100));
        assert!(cfg.applies);
    }

    #[test]
    fn says_nothing_when_no_file_applies() {
        let d = tree(&[("a.ts", "")]);
        let cfg = resolve(d.path(), &d.path().join("a.ts"));
        assert_eq!(cfg, EditorConfig::default());
        assert!(!cfg.applies);
    }

    #[test]
    fn a_later_section_wins_over_an_earlier_one() {
        let d = tree(&[
            (
                ".editorconfig",
                "[*]\nindent_size = 4\n\n[*.ts]\nindent_size = 2\n",
            ),
            ("a.ts", ""),
            ("a.py", ""),
        ]);
        assert_eq!(
            resolve(d.path(), &d.path().join("a.ts")).indent_size,
            Some(2)
        );
        assert_eq!(
            resolve(d.path(), &d.path().join("a.py")).indent_size,
            Some(4)
        );
    }

    #[test]
    fn the_closest_file_wins_over_the_one_above_it() {
        let d = tree(&[
            (
                ".editorconfig",
                "[*]\nindent_size = 4\nindent_style = space\n",
            ),
            ("src/.editorconfig", "[*]\nindent_size = 2\n"),
            ("src/a.ts", ""),
        ]);
        let cfg = resolve(d.path(), &d.path().join("src/a.ts"));
        assert_eq!(cfg.indent_size, Some(2));
        // Untouched by the inner file, so the outer one still supplies it.
        assert_eq!(cfg.indent_style.as_deref(), Some("space"));
    }

    #[test]
    fn root_true_stops_the_walk() {
        let d = tree(&[
            (".editorconfig", "[*]\nindent_style = tab\n"),
            ("src/.editorconfig", "root = true\n[*]\nindent_size = 2\n"),
            ("src/a.ts", ""),
        ]);
        let cfg = resolve(d.path(), &d.path().join("src/a.ts"));
        assert_eq!(cfg.indent_size, Some(2));
        assert_eq!(
            cfg.indent_style, None,
            "the file above root=true must not apply"
        );
    }

    #[test]
    fn a_bare_pattern_matches_at_any_depth_and_a_slashed_one_does_not() {
        let d = tree(&[
            (
                ".editorconfig",
                "[*.ts]\nindent_size = 2\n\n[/top.md]\nindent_size = 8\n",
            ),
            ("deep/nested/a.ts", ""),
            ("top.md", ""),
            ("deep/top.md", ""),
        ]);
        assert_eq!(
            resolve(d.path(), &d.path().join("deep/nested/a.ts")).indent_size,
            Some(2)
        );
        assert_eq!(
            resolve(d.path(), &d.path().join("top.md")).indent_size,
            Some(8)
        );
        // Anchored by the leading slash: the nested one is a different file.
        assert_eq!(
            resolve(d.path(), &d.path().join("deep/top.md")).indent_size,
            None
        );
    }

    #[test]
    fn brace_alternation_and_double_star_work() {
        let d = tree(&[
            (
                ".editorconfig",
                "[*.{js,ts}]\nindent_size = 2\n\n[lib/**/*.py]\nindent_size = 4\n",
            ),
            ("a.js", ""),
            ("lib/deep/b.py", ""),
            ("other/b.py", ""),
        ]);
        assert_eq!(
            resolve(d.path(), &d.path().join("a.js")).indent_size,
            Some(2)
        );
        assert_eq!(
            resolve(d.path(), &d.path().join("lib/deep/b.py")).indent_size,
            Some(4)
        );
        assert_eq!(
            resolve(d.path(), &d.path().join("other/b.py")).indent_size,
            None
        );
    }

    #[test]
    fn indent_size_and_tab_width_stand_in_for_each_other() {
        // A tab-indented project usually sets only one of the two.
        let d = tree(&[
            (".editorconfig", "[*]\nindent_style = tab\ntab_width = 8\n"),
            ("a.ts", ""),
        ]);
        let cfg = resolve(d.path(), &d.path().join("a.ts"));
        assert_eq!(cfg.indent_size, Some(8));
        assert_eq!(cfg.tab_width, Some(8));
    }

    #[test]
    fn max_line_length_off_is_a_real_answer() {
        // "off" has to outrank an outer file's number, so it can't be `None`.
        let d = tree(&[
            (".editorconfig", "[*]\nmax_line_length = 80\n"),
            ("src/.editorconfig", "[*]\nmax_line_length = off\n"),
            ("src/a.ts", ""),
        ]);
        assert_eq!(
            resolve(d.path(), &d.path().join("src/a.ts")).max_line_length,
            Some(0)
        );
    }

    #[test]
    fn comments_and_junk_lines_are_skipped() {
        let d = tree(&[
            (
                ".editorconfig",
                "# a comment\n; another\n[*]\nindent_size = 2\nnot a pair\nunknown_key = 9\n",
            ),
            ("a.ts", ""),
        ]);
        let cfg = resolve(d.path(), &d.path().join("a.ts"));
        assert_eq!(cfg.indent_size, Some(2));
        assert!(cfg.applies);
    }

    #[test]
    fn the_walk_stops_at_the_project_root() {
        // A config above the opened project describes files Reado can't see.
        let outer = tempfile::tempdir().unwrap();
        std::fs::write(outer.path().join(".editorconfig"), "[*]\nindent_size = 9\n").unwrap();
        let root = outer.path().join("proj");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("a.ts"), "").unwrap();
        assert_eq!(resolve(&root, &root.join("a.ts")).indent_size, None);
    }
}
