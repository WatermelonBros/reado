use std::path::{Path, PathBuf};

use ignore::WalkBuilder;

use super::ensure_within;
use super::list::MAX_INDEXED_FILES;
use crate::error::Result;

/// Resolve a relative import specifier (`./foo`, `../lib/bar`) from `from_file`
/// to an existing file inside `root`, trying the usual extensions and `index`
/// files. Returns the absolute path, or `None` when nothing resolves. Used for
/// modifier-click navigation on import paths.
#[tauri::command]
pub fn resolve_import(root: String, from_file: String, spec: String) -> Result<Option<String>> {
    // Only relative specifiers — bare specs (npm packages) aren't navigable.
    if !(spec.starts_with("./") || spec.starts_with("../")) {
        return Ok(None);
    }
    let root = PathBuf::from(&root);
    let from_dir = PathBuf::from(&from_file);
    let base = from_dir.parent().unwrap_or(Path::new(".")).join(&spec);

    const EXTS: &[&str] = &[
        "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "css", "scss", "rs",
    ];
    let mut candidates = vec![base.clone()];
    candidates.extend(
        EXTS.iter()
            .map(|ext| PathBuf::from(format!("{}.{ext}", base.display()))),
    );
    candidates.extend(
        ["ts", "tsx", "js", "jsx"]
            .iter()
            .map(|ext| base.join(format!("index.{ext}"))),
    );

    for cand in candidates {
        if cand.is_file() {
            if let Ok(p) = ensure_within(&root, &cand) {
                return Ok(Some(p.to_string_lossy().into_owned()));
            }
        }
    }
    Ok(None)
}

/// Links between the project's own markdown documents.
///
/// The knowledge graph used to draw only containment — a document sits in a
/// folder, a comment sits on a file — which is what the file tree already shows,
/// and drawing it as a graph produced one hairball of look-alike nodes. The
/// relations a tree *can't* show are the links the documents make to each other,
/// and those are written in the markdown itself.
///
/// Reads each of `files` (project-relative) and returns the `(from, to)` pairs
/// whose target resolves to another file in that same list. Inline links
/// (`[text](../other.md)`) and reference definitions both count; anything
/// off-project — a URL, a missing file, a link to code — is dropped.
#[tauri::command]
pub fn doc_links(root: String, files: Vec<String>) -> Vec<(String, String)> {
    let root = PathBuf::from(&root);
    let known: std::collections::HashSet<&str> = files.iter().map(String::as_str).collect();
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for from in files.iter().take(MAX_LINKED_DOCS) {
        let path = root.join(from);
        // A document big enough to be a data file is not one someone links notes
        // through; skip it rather than read megabytes to find no links.
        if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_DOC_BYTES) {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let dir = Path::new(from).parent().unwrap_or(Path::new(""));
        for target in doc_link_targets(&text) {
            // `dir/../a.md` → `a.md`, without touching the disk: the link is
            // relative to the document that makes it.
            let Some(to) = normalize_rel(&dir.join(target)) else {
                continue;
            };
            if to == *from || !known.contains(to.as_str()) {
                continue;
            }
            if seen.insert((from.clone(), to.clone())) {
                out.push((from.clone(), to));
            }
        }
    }
    out
}

/// Documents read per call, and the size past which one is skipped — the graph
/// is drawn while the user waits, and a generated changelog or a data dump is
/// not what anyone links their notes through.
const MAX_LINKED_DOCS: usize = 2000;
const MAX_DOC_BYTES: u64 = 512 * 1024;

/// The markdown-link targets in `text` that point at another markdown file.
fn doc_link_targets(text: &str) -> Vec<&str> {
    static LINK: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = LINK.get_or_init(|| {
        // `[text](target)` and `[label]: target` alike; the target runs to the
        // first `)`, whitespace, `#` or quote, so anchors and titles fall away.
        regex::Regex::new(r#"(?m)(?:\]\(|^\[[^\]]*\]:\s*)<?([^)>\s#"']+)"#).unwrap()
    });
    re.captures_iter(text)
        .filter_map(|c| c.get(1))
        .map(|m| m.as_str())
        .filter(|t| {
            !t.contains("://")
                && !t.starts_with("mailto:")
                && t.rsplit('.').next().is_some_and(|e| {
                    ["md", "markdown", "mdx"]
                        .iter()
                        .any(|k| e.eq_ignore_ascii_case(k))
                })
        })
        .collect()
}

/// Collapse `.`/`..` in a project-relative path, without touching the disk and
/// without ever escaping the project (`../..` from the root yields None).
fn normalize_rel(p: &Path) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    for c in p.components() {
        match c {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                parts.pop()?;
            }
            std::path::Component::Normal(s) => parts.push(s.to_str()?),
            // An absolute link is not a project-relative document.
            _ => return None,
        }
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

/// Resolve a path printed in the terminal (`src/foo.ts`, or an absolute path) to
/// an existing file inside `root`. Returns the absolute path, or `None`. Used to
/// make `path:line:col` in agent/build output clickable.
///
/// With `search`, a spec that doesn't exist under the root is looked up by
/// suffix across the indexed files. Agents and build tools print paths relative
/// to wherever they ran, or none at all (`Terminal.tsx:104`), so a root-join is
/// the minority case — without the fallback most clicks resolve to nothing.
#[tauri::command]
pub fn resolve_path(root: String, spec: String, search: Option<bool>) -> Result<Option<String>> {
    let root = PathBuf::from(&root);
    let p = PathBuf::from(&spec);
    let absolute = p.is_absolute();
    let cand = if absolute { p } else { root.join(&spec) };
    if cand.is_file() {
        if let Ok(abs) = ensure_within(&root, &cand) {
            return Ok(Some(abs.to_string_lossy().into_owned()));
        }
    }
    if search != Some(true) || absolute {
        return Ok(None);
    }
    Ok(find_by_suffix(&root, &spec).map(|p| p.to_string_lossy().into_owned()))
}

/// Shallowest indexed file whose relative path ends on `spec`'s segments, so
/// `Terminal.tsx` finds `src/components/organisms/Terminal.tsx` and a duplicate
/// buried in a vendor directory never wins over the real one.
fn find_by_suffix(root: &Path, spec: &str) -> Option<PathBuf> {
    let needle = spec.replace('\\', "/");
    let needle = needle.trim_start_matches("./").trim_start_matches('/');
    if needle.is_empty() {
        return None;
    }
    let tail = format!("/{needle}");
    let mut best: Option<PathBuf> = None;
    for entry in WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .parents(true)
        .build()
        .filter_map(|r| r.ok())
        .filter(|e| e.file_type().is_some_and(|t| t.is_file()))
        .take(MAX_INDEXED_FILES)
    {
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        if rel != needle && !rel.ends_with(&tail) {
            continue;
        }
        if best
            .as_ref()
            .is_none_or(|b| b.as_os_str().len() > path.as_os_str().len())
        {
            best = Some(path.to_path_buf());
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn resolves_a_parent_relative_import() {
        // `../` is at least as common as `./` and had no coverage at all.
        let proj = tempfile::TempDir::new().unwrap();
        let root = proj.path();
        std::fs::create_dir_all(root.join("src/a")).unwrap();
        std::fs::write(root.join("src/c.ts"), "").unwrap();
        let out = super::resolve_import(
            root.to_string_lossy().into_owned(),
            root.join("src/a/b.ts").to_string_lossy().into_owned(),
            "../c".into(),
        )
        .unwrap();
        assert!(
            out.as_deref().is_some_and(|p| p.ends_with("src/c.ts")),
            "expected src/c.ts, got {out:?}"
        );
    }

    #[test]
    fn doc_links_are_the_links_the_documents_actually_make() {
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("docs/deep")).unwrap();
        fs::write(
            root.join("README.md"),
            "see [guide](docs/guide.md) and [ext](https://x.dev/a.md)\n\
             [ref]: docs/deep/notes.md\n\
             [code](src/main.rs) [missing](docs/nope.md) [anchor](docs/guide.md#part)\n",
        )
        .unwrap();
        fs::write(root.join("docs/guide.md"), "back to [home](../README.md)\n").unwrap();
        fs::write(
            root.join("docs/deep/notes.md"),
            "up to [guide](../guide.md)\n",
        )
        .unwrap();
        let files: Vec<String> = ["README.md", "docs/guide.md", "docs/deep/notes.md"]
            .iter()
            .map(|s| (*s).to_string())
            .collect();

        let mut got = doc_links(root.to_string_lossy().into_owned(), files);
        got.sort();
        assert_eq!(
            got,
            vec![
                ("README.md".into(), "docs/deep/notes.md".into()),
                ("README.md".into(), "docs/guide.md".into()),
                ("docs/deep/notes.md".into(), "docs/guide.md".into()),
                ("docs/guide.md".into(), "README.md".into()),
            ],
            "URLs, code, missing targets and duplicate anchors are all dropped"
        );
    }

    #[test]
    fn a_link_cannot_escape_the_project() {
        assert_eq!(
            normalize_rel(Path::new("docs/../a.md")).as_deref(),
            Some("a.md")
        );
        assert_eq!(normalize_rel(Path::new("docs/../../secrets.md")), None);
        assert_eq!(normalize_rel(Path::new("/etc/passwd.md")), None);
    }

    /// A bare filename printed by an agent (`Terminal.tsx:104`) is not a
    /// root-relative path — without the suffix search the click resolves to
    /// nothing, which is what made terminal links look broken.
    #[test]
    fn resolve_path_finds_files_by_suffix() {
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        fs::create_dir_all(root.join("src/components")).unwrap();
        fs::create_dir_all(root.join("vendor/dup/src/components")).unwrap();
        fs::write(root.join("src/components/Terminal.tsx"), "").unwrap();
        fs::write(root.join("vendor/dup/src/components/Terminal.tsx"), "").unwrap();

        // Off by default: an existing caller probing for a root-level file
        // (`angular.json`) must not start matching one nested in a subfolder.
        assert_eq!(
            super::resolve_path(s(root.into()), "Terminal.tsx".into(), None).unwrap(),
            None
        );
        // On, the shallowest match wins over the vendored duplicate.
        assert_eq!(
            super::resolve_path(s(root.into()), "Terminal.tsx".into(), Some(true)).unwrap(),
            Some(s(root.join("src/components/Terminal.tsx")))
        );
        // A partial path still anchors on segment boundaries…
        assert_eq!(
            super::resolve_path(s(root.into()), "components/Terminal.tsx".into(), Some(true))
                .unwrap(),
            Some(s(root.join("src/components/Terminal.tsx")))
        );
        // …so a suffix that isn't a whole segment doesn't match.
        assert_eq!(
            super::resolve_path(s(root.into()), "inal.tsx".into(), Some(true)).unwrap(),
            None
        );
    }
}
