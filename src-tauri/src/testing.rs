//! Finding a project's tests without running anything.
//!
//! The Test Explorer needs a list before it can offer to run one, and the honest
//! ways to get that list are all expensive: ask the framework (a process per
//! framework, and it has to be installed), or parse the language (a grammar per
//! language). What every framework does share is that a test is *written down* in
//! a recognisable shape — `it("…")`, `#[test] fn …`, `def test_…`, `func TestX` —
//! so that is what this reads.
//!
//! ponytail: regex per framework, and suite nesting is inferred from indentation
//! rather than from the brace structure. That is right for formatted code and
//! wrong for a test whose `describe` and `it` sit on one line; a tree-sitter pass
//! is the upgrade if the wrongness ever costs anything. Nothing downstream trusts
//! the list absolutely — running a test asks the framework by name, and the
//! framework is the authority on what exists.

use std::path::Path;
use std::sync::OnceLock;

use ignore::WalkBuilder;
use regex::Regex;
use serde::Serialize;

/// Files bigger than this are not tests anyone wrote by hand.
const MAX_TEST_FILE_BYTES: u64 = 512 * 1024;
/// Ceiling on the whole sweep, so a monorepo cannot hang the panel.
const MAX_TESTS: usize = 5000;

/// One runnable test.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestItem {
    /// What the framework calls it — the string a filter flag takes.
    pub name: String,
    /// Enclosing suites, outermost first. Empty for a top-level test.
    pub suites: Vec<String>,
    /// 1-based line of the declaration, for jumping to it and for the gutter.
    pub line: u32,
}

/// One file's worth of tests, and who runs them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestFile {
    /// Project-relative path.
    pub path: String,
    /// `vitest`, `jest`, `cargo`, `pytest` or `go`.
    pub framework: String,
    pub tests: Vec<TestItem>,
    /// Last-modified time in ms since the epoch. A verdict remembered from a
    /// previous session is only worth showing while the file it judged has not
    /// moved on — this is what "may be out of date" is decided from. Free: the
    /// size check already stats the file.
    pub modified: Option<u64>,
}

struct Patterns {
    /// `describe("x"` / `it("x"` / `test("x"` — with the keyword captured so a
    /// suite can be told from a test.
    js: Regex,
    /// `#[test]`, `#[tokio::test]`, `#[rstest]` — the attribute, not the fn.
    rust_attr: Regex,
    rust_fn: Regex,
    rust_mod: Regex,
    py_test: Regex,
    py_class: Regex,
    go_test: Regex,
}

fn patterns() -> &'static Patterns {
    static P: OnceLock<Patterns> = OnceLock::new();
    P.get_or_init(|| Patterns {
        js: Regex::new(
            r#"(?m)^(\s*)(?:(?:export\s+)?(?:async\s+)?)?\b(describe|it|test|suite)(?:\.\w+)*\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)"#,
        )
        .unwrap(),
        rust_attr: Regex::new(r"^\s*#\[(?:\w+::)*(?:\w+_)?test\b").unwrap(),
        rust_fn: Regex::new(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)").unwrap(),
        rust_mod: Regex::new(r"^\s*(?:pub\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)").unwrap(),
        py_test: Regex::new(r"^(\s*)(?:async\s+)?def\s+(test[A-Za-z0-9_]*)").unwrap(),
        py_class: Regex::new(r"^\s*class\s+(Test[A-Za-z0-9_]*)").unwrap(),
        go_test: Regex::new(r"^\s*func\s+((?:Test|Benchmark|Fuzz)[A-Za-z0-9_]*)\s*\(").unwrap(),
    })
}

/// Which framework, if any, owns a file — decided by its name and extension,
/// which is also how every one of these frameworks decides it.
fn framework_of(rel: &str) -> Option<&'static str> {
    let name = rel.rsplit('/').next().unwrap_or(rel);
    if name.ends_with(".rs") {
        // Rust tests live beside the code as well as under `tests/`, so the file
        // name says nothing; `#[test]` in it does, and that is checked later.
        return Some("cargo");
    }
    if name.ends_with("_test.go") {
        return Some("go");
    }
    if name.starts_with("test_") && name.ends_with(".py")
        || name.ends_with("_test.py")
        || name.ends_with("_tests.py")
    {
        return Some("pytest");
    }
    let is_js = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]
        .iter()
        .any(|e| name.ends_with(e));
    if is_js {
        let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);
        // `.test.ts`, `.spec.tsx`, and Reado's own `.uitest.tsx`.
        if stem.ends_with(".test")
            || stem.ends_with(".spec")
            || stem.ends_with(".uitest")
            || stem.ends_with("test")
        {
            return Some("vitest");
        }
    }
    None
}

fn extract_js(content: &str) -> Vec<TestItem> {
    let p = patterns();
    // Line offsets, so a match position becomes a line number without counting
    // the file again per match.
    let mut starts = vec![0usize];
    for (i, c) in content.char_indices() {
        if c == '\n' {
            starts.push(i + 1);
        }
    }
    let line_of = |pos: usize| starts.partition_point(|&s| s <= pos) as u32;

    let mut out = Vec::new();
    let mut stack: Vec<(usize, String)> = Vec::new();
    for caps in p.js.captures_iter(content) {
        let indent = caps.get(1).map(|m| m.as_str().len()).unwrap_or(0);
        let keyword = &caps[2];
        let name = caps
            .get(3)
            .or_else(|| caps.get(4))
            .or_else(|| caps.get(5))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        stack.retain(|(i, _)| *i < indent);
        if keyword == "describe" || keyword == "suite" {
            stack.push((indent, name));
            continue;
        }
        out.push(TestItem {
            // The stack was pruned to this indent a few lines up, so everything
            // still on it encloses this test.
            suites: stack.iter().map(|(_, n)| n.clone()).collect(),
            name,
            line: line_of(caps.get(0).map(|m| m.start()).unwrap_or(0)),
        });
    }
    out
}

fn extract_rust(content: &str) -> Vec<TestItem> {
    let p = patterns();
    let mut out = Vec::new();
    // The test module is the suite, and a file has few of them; the innermost
    // `mod` seen before the test is the one it is in.
    let mut module: Vec<String> = Vec::new();
    let mut attributed = false;
    for (i, line) in content.lines().enumerate() {
        if let Some(m) = p.rust_mod.captures(line) {
            module = vec![m[1].to_string()];
        }
        if p.rust_attr.is_match(line) {
            attributed = true;
            continue;
        }
        if !attributed {
            continue;
        }
        // Attributes stack; keep waiting through them for the fn.
        if line.trim_start().starts_with('#') {
            continue;
        }
        if let Some(m) = p.rust_fn.captures(line) {
            out.push(TestItem {
                name: m[1].to_string(),
                suites: module.clone(),
                line: i as u32 + 1,
            });
        }
        attributed = false;
    }
    out
}

fn extract_python(content: &str) -> Vec<TestItem> {
    let p = patterns();
    let mut out = Vec::new();
    let mut class: Option<String> = None;
    for (i, line) in content.lines().enumerate() {
        if let Some(m) = p.py_class.captures(line) {
            class = Some(m[1].to_string());
            continue;
        }
        if let Some(m) = p.py_test.captures(line) {
            let indent = m[1].len();
            // A `def test_` at column 0 has left any class behind it.
            if indent == 0 {
                class = None;
            }
            out.push(TestItem {
                name: m[2].to_string(),
                suites: class.iter().cloned().collect(),
                line: i as u32 + 1,
            });
        }
    }
    out
}

fn extract_go(content: &str) -> Vec<TestItem> {
    let p = patterns();
    content
        .lines()
        .enumerate()
        .filter_map(|(i, line)| {
            p.go_test.captures(line).map(|m| TestItem {
                name: m[1].to_string(),
                suites: vec![],
                line: i as u32 + 1,
            })
        })
        .collect()
}

/// The tests in one file's text, for the framework that owns it.
pub fn extract(framework: &str, content: &str) -> Vec<TestItem> {
    match framework {
        "vitest" | "jest" => extract_js(content),
        "cargo" => extract_rust(content),
        "pytest" => extract_python(content),
        "go" => extract_go(content),
        _ => vec![],
    }
}

/// Every test in the project, grouped by file.
///
/// Gitignore-aware (so `node_modules` and `target` are not walked), bounded, and
/// never an error: a project with no tests gets an empty list, which is what the
/// panel's empty state is for.
///
/// `async` so a full walk of the project doesn't block the UI thread — the same
/// reason `semantic_rebuild` and `git_info` are.
#[tauri::command(async)]
pub fn discover_tests(root: String) -> Vec<TestFile> {
    let root_path = Path::new(&root);
    let mut out: Vec<TestFile> = Vec::new();
    let mut total = 0usize;
    // `require_git(false)`: without it the walker only honours `.gitignore`
    // inside a repository, and a project that is not one gets its whole
    // `node_modules` walked — which is both wrong (those tests are not the
    // reader's) and slow.
    for entry in WalkBuilder::new(root_path)
        .require_git(false)
        .build()
        .flatten()
    {
        if total >= MAX_TESTS {
            break;
        }
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let path = entry.path();
        let Ok(rel) = path.strip_prefix(root_path) else {
            continue;
        };
        let rel = rel.to_string_lossy().replace('\\', "/");
        let Some(framework) = framework_of(&rel) else {
            continue;
        };
        let meta = std::fs::metadata(path).ok();
        if meta.as_ref().is_some_and(|m| m.len() > MAX_TEST_FILE_BYTES) {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(path) else {
            continue;
        };
        let tests = extract(framework, &content);
        if tests.is_empty() {
            continue;
        }
        total += tests.len();
        out.push(TestFile {
            path: rel,
            framework: framework.to_string(),
            tests,
            modified: meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64),
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_nested_suites_out_of_a_js_test_file() {
        let src = r#"
describe("outer", () => {
  it("does a thing", () => {})
  describe("inner", () => {
    test('does another', () => {})
  })
})
it("top level", () => {})
"#;
        let items = extract("vitest", src);
        let names: Vec<_> = items.iter().map(|i| i.name.as_str()).collect();
        assert_eq!(names, ["does a thing", "does another", "top level"]);
        assert_eq!(items[0].suites, ["outer"]);
        assert_eq!(items[1].suites, ["outer", "inner"]);
        assert!(items[2].suites.is_empty());
        // Lines are 1-based and point at the declaration.
        assert_eq!(items[0].line, 3);
    }

    #[test]
    fn reads_rust_tests_through_their_attributes() {
        let src = r#"
mod tests {
    #[test]
    fn plain() {}

    #[tokio::test]
    #[ignore]
    async fn asynchronous() {}

    fn not_a_test() {}
}
"#;
        let items = extract("cargo", src);
        let names: Vec<_> = items.iter().map(|i| i.name.as_str()).collect();
        assert_eq!(names, ["plain", "asynchronous"]);
        assert_eq!(items[0].suites, ["tests"]);
    }

    #[test]
    fn reads_python_tests_and_their_class() {
        let src = "class TestThing:\n    def test_one(self):\n        pass\n\ndef test_two():\n    pass\n";
        let items = extract("pytest", src);
        assert_eq!(items[0].name, "test_one");
        assert_eq!(items[0].suites, ["TestThing"]);
        assert_eq!(items[1].name, "test_two");
        assert!(items[1].suites.is_empty());
    }

    #[test]
    fn reads_go_tests() {
        let items = extract("go", "func TestOne(t *testing.T) {}\nfunc helper() {}\n");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "TestOne");
    }

    #[test]
    fn decides_the_framework_from_the_file_name() {
        assert_eq!(framework_of("src/a.test.ts"), Some("vitest"));
        assert_eq!(framework_of("src/a.uitest.tsx"), Some("vitest"));
        assert_eq!(framework_of("src/a.spec.js"), Some("vitest"));
        assert_eq!(framework_of("tests/test_thing.py"), Some("pytest"));
        assert_eq!(framework_of("pkg/thing_test.go"), Some("go"));
        assert_eq!(framework_of("src/lib.rs"), Some("cargo"));
        assert_eq!(framework_of("src/app.ts"), None);
        assert_eq!(framework_of("README.md"), None);
    }
}

#[cfg(test)]
mod walk_tests {
    use super::*;

    /// A project on disk, so the sweep is exercised the way it runs — the parts
    /// that go wrong silently (path stripping, the gitignore walk, files that
    /// look like tests and hold none) are all in the walk, not the regexes.
    fn project(files: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (rel, body) in files {
            let path = dir.path().join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, body).unwrap();
        }
        dir
    }

    #[test]
    fn finds_tests_under_project_relative_paths() {
        let dir = project(&[
            ("src/a.test.ts", "it(\"works\", () => {})\n"),
            ("src/a.ts", "export const a = 1\n"),
            ("tests/test_b.py", "def test_b():\n    pass\n"),
        ]);
        let found = discover_tests(dir.path().to_string_lossy().into_owned());
        let paths: Vec<_> = found.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["src/a.test.ts", "tests/test_b.py"]);
        assert_eq!(found[0].framework, "vitest");
        assert_eq!(found[1].framework, "pytest");
        assert_eq!(found[0].tests[0].name, "works");
    }

    #[test]
    fn skips_a_file_that_looks_like_tests_but_declares_none() {
        // Every `.rs` is a candidate — listing the ones with no `#[test]` would
        // be a tree of empty files.
        let dir = project(&[("src/lib.rs", "pub fn add(a: i32) -> i32 { a }\n")]);
        assert!(discover_tests(dir.path().to_string_lossy().into_owned()).is_empty());
    }

    #[test]
    fn does_not_walk_into_what_git_ignores() {
        // The one that matters on a real project: node_modules is full of files
        // named `*.test.js`, and walking it is both wrong and slow.
        let dir = project(&[
            (".gitignore", "node_modules/\n"),
            ("node_modules/pkg/x.test.js", "it('theirs', () => {})\n"),
            ("src/mine.test.js", "it('mine', () => {})\n"),
        ]);
        let found = discover_tests(dir.path().to_string_lossy().into_owned());
        assert_eq!(
            found.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(),
            ["src/mine.test.js"]
        );
    }
}
