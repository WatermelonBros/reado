//! Format Document via the project's own formatters.
//!
//! Like VS Code, Reado doesn't bundle formatters — it runs whatever the project
//! provides. What it does *not* do is guess: a formatter is only ever run when
//! the project declares it (a config file it owns, or its name in the project's
//! package manifest). Falling back to whatever happened to be on the global PATH
//! meant a globally-installed Biome silently reformatted every Prettier project
//! it opened, which rewrites the whole file in the wrong style.
//!
//! The table below is the curated allowlist, not a catalogue: the marketplace's
//! formatter manifests carry the names, descriptions and install commands, and
//! name a formatter only by id. The program that actually gets spawned is chosen
//! here, so a manifest can never turn Format Document into an
//! arbitrary-command primitive — the same rule the language servers follow.
//!
//! The active file's content is piped through the chosen formatter (preferring
//! the project-local `node_modules/.bin`) and the formatted text is returned for
//! the editor to apply. The file on disk is never touched here; saving stays the
//! user's choice.

use crate::proc::{command, on_path};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, Stdio};
use std::time::{Duration, Instant};

/// Hard ceiling on one formatter run. This is a hang guard, not a latency
/// budget: a wedged formatter must never be able to block a save forever.
const FORMAT_TIMEOUT: Duration = Duration::from_secs(10);

/// File types Prettier serves. Biome's list is deliberately narrower (below) —
/// handing Biome a Markdown file makes it fail rather than decline, which would
/// surface as a format error instead of falling through to Prettier.
const PRETTIER_EXTS: &[&str] = &[
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "json", "jsonc", "css", "scss", "less",
    "html", "vue", "svelte", "md", "mdx", "yaml", "yml", "graphql",
];

/// File types Biome formats.
const BIOME_EXTS: &[&str] = &[
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "json", "jsonc", "css", "graphql",
];

/// A formatter and the evidence that proves this project uses it.
struct Rule {
    /// Formatter id — also the binary name we spawn.
    id: &'static str,
    /// Arguments; `{path}` is replaced with the file's path.
    args: &'static [&'static str],
    /// Extensions this formatter serves.
    exts: &'static [&'static str],
    /// Root entries that prove the project uses it. A trailing `*` matches a
    /// prefix, so `.prettierrc*` covers every serialisation of that file.
    configs: &'static [&'static str],
    /// Project manifests to search for `needles`.
    manifests: &'static [&'static str],
    /// Substrings that prove the formatter when found in a manifest.
    needles: &'static [&'static str],
    /// The language has one conventional formatter shipped with its toolchain,
    /// so there is nothing to disambiguate: being installed is the declaration.
    path_is_proof: bool,
}

/// Formatters, in preference order within each file type. The first *declared
/// and installed* rule for a file wins.
const RULES: &[Rule] = &[
    Rule {
        id: "biome",
        args: &["format", "--stdin-file-path={path}"],
        exts: BIOME_EXTS,
        configs: &["biome.json", "biome.jsonc"],
        manifests: &["package.json"],
        needles: &["@biomejs/biome"],
        path_is_proof: false,
    },
    Rule {
        id: "prettier",
        args: &["--stdin-filepath", "{path}"],
        exts: PRETTIER_EXTS,
        // `.prettierrc*` also covers `.prettierrc.json`, `.prettierrc.yaml`, …
        configs: &[".prettierrc*", "prettier.config.*"],
        manifests: &["package.json"],
        // Matches both a dependency and a top-level `"prettier"` config block.
        // Quoted so `eslint-config-prettier` and `prettier-plugin-*` don't count.
        needles: &["\"prettier\""],
        path_is_proof: false,
    },
    Rule {
        id: "rustfmt",
        args: &["--emit", "stdout"],
        exts: &["rs"],
        configs: &[],
        manifests: &[],
        needles: &[],
        path_is_proof: true,
    },
    Rule {
        id: "gofmt",
        args: &[],
        exts: &["go"],
        configs: &[],
        manifests: &[],
        needles: &[],
        path_is_proof: true,
    },
    Rule {
        id: "shfmt",
        args: &[],
        exts: &["sh", "bash"],
        configs: &[],
        manifests: &[],
        needles: &[],
        path_is_proof: true,
    },
    Rule {
        id: "ruff",
        args: &["format", "-"],
        exts: &["py", "pyi"],
        configs: &["ruff.toml", ".ruff.toml"],
        manifests: &["pyproject.toml"],
        needles: &["[tool.ruff"],
        path_is_proof: false,
    },
    Rule {
        id: "black",
        args: &["-q", "-"],
        exts: &["py", "pyi"],
        configs: &[],
        manifests: &["pyproject.toml"],
        needles: &["[tool.black"],
        path_is_proof: false,
    },
    Rule {
        id: "rubocop",
        args: &["-a", "-s", "{path}"],
        exts: &["rb"],
        configs: &[".rubocop.yml", ".rubocop.yaml"],
        manifests: &["Gemfile"],
        needles: &["rubocop"],
        path_is_proof: false,
    },
];

/// A formatter invocation: a program and its arguments (content arrives on stdin).
struct Candidate {
    id: &'static str,
    program: String,
    args: Vec<String>,
}

/// What a format attempt produced. `formatter` is `None` when the project
/// declares no formatter for this file — a normal outcome, not a failure, and
/// one the UI must be able to tell apart from "ran and changed nothing".
#[derive(serde::Serialize, Debug)]
pub struct FormatResult {
    formatter: Option<String>,
    text: String,
    changed: bool,
}

/// Resolve a binary inside the project's `node_modules/.bin`, if present.
fn local_bin(root: &str, name: &str) -> Option<String> {
    let p = Path::new(root).join("node_modules").join(".bin").join(name);
    p.exists().then(|| p.to_string_lossy().into_owned())
}

/// The rules serving `path`'s extension, in preference order. Pure: no
/// filesystem, no PATH — evidence is applied separately by `candidates_for`.
fn rules_for_ext(path: &str) -> Vec<&'static Rule> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    RULES.iter().filter(|r| r.exts.contains(&&*ext)).collect()
}

/// Whether any entry name matches `pat` (a trailing `*` matches a prefix).
fn matches_entry(entries: &[String], pat: &str) -> bool {
    match pat.strip_suffix('*') {
        Some(prefix) => entries.iter().any(|e| e.starts_with(prefix)),
        None => entries.iter().any(|e| e == pat),
    }
}

/// The names of `root`'s direct entries — read once per format, then shared by
/// every rule's config check.
fn root_entries(root: &str) -> Vec<String> {
    std::fs::read_dir(root)
        .map(|d| {
            d.flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

/// Whether this project declares `rule`.
///
/// ponytail: manifest evidence is a substring search, not a parse — it has to
/// work across `package.json`, `pyproject.toml` and `Gemfile` alike, and the
/// needles are quoted tightly enough that near-misses (`eslint-config-prettier`)
/// don't match. Ceiling: a formatter named only inside a comment counts. Parse
/// per manifest format if that ever bites.
fn declares(root: &str, entries: &[String], rule: &Rule) -> bool {
    if rule.path_is_proof {
        return on_path(rule.id);
    }
    if rule.configs.iter().any(|c| matches_entry(entries, c)) {
        return true;
    }
    rule.manifests.iter().any(|m| {
        std::fs::read_to_string(Path::new(root).join(m))
            .is_ok_and(|s| rule.needles.iter().any(|n| s.contains(n)))
    })
}

/// A rule, resolved into something spawnable for this project and file.
fn to_candidate(root: &str, rule: &'static Rule, path: &str) -> Candidate {
    Candidate {
        id: rule.id,
        program: local_bin(root, rule.id).unwrap_or_else(|| rule.id.to_string()),
        args: rule
            .args
            .iter()
            .map(|a| a.replace("{path}", path))
            .collect(),
    }
}

/// The formatters this project declares for `path`, most-preferred first.
fn candidates_for(root: &str, path: &str) -> Vec<Candidate> {
    let entries = root_entries(root);
    rules_for_ext(path)
        .into_iter()
        .filter(|r| declares(root, &entries, r))
        .map(|r| to_candidate(root, r, path))
        .collect()
}

/// Wait for `child`, killing it if it outlives [`FORMAT_TIMEOUT`]. `None` means
/// it was killed.
///
/// ponytail: a 10 ms poll rather than a platform wait-with-timeout. A formatter
/// run is milliseconds to seconds, so the poll costs nothing; reach for a real
/// timed wait only if this ever needs to be precise.
fn wait_bounded(child: &mut Child) -> Result<Option<std::process::ExitStatus>, String> {
    let deadline = Instant::now() + FORMAT_TIMEOUT;
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => return Ok(Some(status)),
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Ok(None);
            }
            None => std::thread::sleep(Duration::from_millis(10)),
        }
    }
}

/// Drain a child pipe on its own thread, so neither pipe can fill and deadlock
/// the other.
fn read_pipe<R: Read + Send + 'static>(mut pipe: Option<R>) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(p) = pipe.as_mut() {
            let _ = p.read_to_end(&mut buf);
        }
        buf
    })
}

/// Run a single candidate over `content`. Returns `Ok(None)` if the program is
/// not installed (so the caller can try the next one), `Ok(Some(text))` on a
/// clean format, or `Err(stderr)` when the formatter ran but failed.
fn run(root: &str, c: &Candidate, content: &str) -> Result<Option<String>, String> {
    let mut child = match command(&c.program)
        .args(&c.args)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    // Feed stdin from its own thread and read both pipes from theirs: writing a
    // large file inline deadlocks as soon as the formatter's output fills the
    // stdout pipe it can't drain while we're still writing. Dropping stdin at
    // the end of the thread signals EOF. Not joined — if the child dies early
    // the write fails with EPIPE and the thread ends on its own.
    let mut stdin = child.stdin.take();
    let owned = content.to_string();
    std::thread::spawn(move || {
        if let Some(s) = stdin.as_mut() {
            let _ = s.write_all(owned.as_bytes());
        }
        drop(stdin);
    });
    let out = read_pipe(child.stdout.take());
    let err = read_pipe(child.stderr.take());

    let status = wait_bounded(&mut child)?;
    let stdout = out.join().unwrap_or_default();
    let stderr = err.join().unwrap_or_default();

    let Some(status) = status else {
        return Err(format!(
            "{} did not finish within {}s.",
            c.id,
            FORMAT_TIMEOUT.as_secs()
        ));
    };
    if status.success() {
        Ok(Some(String::from_utf8_lossy(&stdout).into_owned()))
    } else {
        Err(String::from_utf8_lossy(&stderr).trim().to_string())
    }
}

/// A formatter's standing for the open project: whether the project declares it,
/// and whether it is actually installed. The marketplace shows both.
#[derive(serde::Serialize)]
pub struct FormatterStatus {
    id: &'static str,
    /// Extensions this formatter serves, so the UI can group and offer it.
    exts: &'static [&'static str],
    /// The project's configuration or manifest names it (or, for a toolchain
    /// formatter, it is simply installed).
    declared: bool,
    installed: bool,
}

/// Every formatter in the allowlist, with its standing for `root`. Ordered by
/// preference within each file type, which is the order selection follows.
#[tauri::command]
pub fn formatter_status(root: String) -> Vec<FormatterStatus> {
    let entries = root_entries(&root);
    RULES
        .iter()
        .map(|r| FormatterStatus {
            id: r.id,
            exts: r.exts,
            declared: declares(&root, &entries, r),
            installed: local_bin(&root, r.id).is_some() || on_path(r.id),
        })
        .collect()
}

/// Format `content` (the active file's text).
///
/// `formatter` pins one by id — the per-project override. Without it, the first
/// formatter this project declares for the file type wins. Not finding one is a
/// normal result, not an error.
#[tauri::command]
pub fn format_file(
    root: String,
    path: String,
    content: String,
    formatter: Option<String>,
) -> Result<FormatResult, String> {
    let mut candidates = candidates_for(&root, &path);
    if let Some(pinned) = formatter.as_deref() {
        // A pinned formatter still has to serve this file type and exist in the
        // allowlist; the id arrives from the webview.
        candidates = rules_for_ext(&path)
            .into_iter()
            .filter(|r| r.id == pinned)
            .map(|r| to_candidate(&root, r, &path))
            .collect();
        if candidates.is_empty() {
            return Err(format!("{pinned} can't format this kind of file."));
        }
    }
    if candidates.is_empty() {
        return Ok(FormatResult {
            formatter: None,
            changed: false,
            text: content,
        });
    }
    for c in &candidates {
        // `None` means that formatter isn't installed — try the next candidate.
        match run(&root, c, &content) {
            Ok(Some(formatted)) => {
                crate::log::info(
                    "format",
                    "formatted",
                    serde_json::json!({ "path": path, "formatter": c.id }),
                );
                return Ok(FormatResult {
                    formatter: Some(c.id.to_string()),
                    changed: formatted != content,
                    text: formatted,
                });
            }
            Ok(None) => continue,
            Err(e) => {
                crate::log::error(
                    "format",
                    "formatter failed",
                    serde_json::json!({ "path": path, "formatter": c.id, "error": e }),
                );
                return Err(e);
            }
        }
    }
    // Declared but absent: the project asks for a formatter the machine doesn't
    // have. Naming it is the difference between a fixable message and a shrug.
    Err(format!(
        "This project uses {}, which isn't installed.",
        candidates
            .iter()
            .map(|c| c.id)
            .collect::<Vec<_>>()
            .join(" or ")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A project root with the given files at its top level.
    fn project(files: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (name, body) in files {
            std::fs::write(dir.path().join(name), body).unwrap();
        }
        dir
    }

    fn ids(root: &std::path::Path, path: &str) -> Vec<&'static str> {
        candidates_for(root.to_str().unwrap(), path)
            .iter()
            .map(|c| c.id)
            .collect()
    }

    #[test]
    fn the_allowlist_and_the_manifests_name_the_same_formatters() {
        // Two lists keyed on one set of ids, on opposite sides of the IPC
        // boundary — the split is deliberate (the spawn command must not come
        // from the webview) but the ids can drift silently: a manifest with no
        // rule renders a row that can never format anything, and a rule with no
        // manifest is invisible in the marketplace though it still runs.
        let ts = std::fs::read_to_string("../src/lib/extensions.ts").expect("read manifests");
        let block = ts
            .split("export const FORMATTERS: FormatterExt[] = [")
            .nth(1)
            .expect("FORMATTERS block");
        let declared: std::collections::BTreeSet<&str> = block
            .lines()
            .take_while(|l| !l.starts_with(']'))
            .filter_map(|l| l.trim().strip_prefix("id: \""))
            .filter_map(|l| l.split('"').next())
            .collect();
        let compiled: std::collections::BTreeSet<&str> = RULES.iter().map(|r| r.id).collect();
        assert_eq!(
            declared, compiled,
            "FORMATTERS ids and RULES ids have drifted"
        );
    }

    #[test]
    fn extensions_match_whatever_case_the_file_uses() {
        // `Component.TSX` and `README.MD` are ordinary on case-insensitive
        // filesystems; without the fold, Format Document silently does nothing.
        assert_eq!(rules_for_ext("a.TSX").len(), rules_for_ext("a.tsx").len());
        assert!(!rules_for_ext("a.RS").is_empty());
    }

    #[test]
    fn picks_rules_by_extension() {
        let ts: Vec<_> = rules_for_ext("a.ts").iter().map(|r| r.id).collect();
        assert_eq!(ts, vec!["biome", "prettier"]);
        // Markdown is Prettier's alone: Biome fails on it rather than declining,
        // which would surface as a format error instead of a fallthrough.
        assert_eq!(
            rules_for_ext("a.md")
                .iter()
                .map(|r| r.id)
                .collect::<Vec<_>>(),
            vec!["prettier"]
        );
        assert_eq!(
            rules_for_ext("a.rs")
                .iter()
                .map(|r| r.id)
                .collect::<Vec<_>>(),
            vec!["rustfmt"]
        );
        assert!(rules_for_ext("a.unknownext").is_empty());
    }

    #[test]
    fn orders_rules_by_preference() {
        // `picks_rules_by_extension` pins the web pair; pin Python's too, so a
        // reversed `RULES` entry (black before ruff) fails here.
        assert_eq!(
            rules_for_ext("a.py")
                .iter()
                .map(|r| r.id)
                .collect::<Vec<_>>(),
            vec!["ruff", "black"]
        );
    }

    #[test]
    fn a_project_declaring_nothing_gets_no_formatter() {
        // The bug this whole rule set exists for: with no evidence, a globally
        // installed formatter must NOT be reached for.
        let dir = project(&[("index.ts", "")]);
        assert!(ids(dir.path(), "index.ts").is_empty());
    }

    #[test]
    fn a_prettier_project_never_reaches_for_biome() {
        // A user with Biome on their global PATH (because another project uses
        // it) opened a Prettier project and had every file rewritten in Biome's
        // style. Evidence gating is the fix; this is the regression test.
        let dir = project(&[(".prettierrc", "{}"), ("index.ts", "")]);
        assert_eq!(ids(dir.path(), "index.ts"), vec!["prettier"]);
    }

    #[test]
    fn config_evidence_is_recognised_in_every_serialisation() {
        for name in [".prettierrc", ".prettierrc.json", "prettier.config.mjs"] {
            let dir = project(&[(name, "{}")]);
            assert_eq!(ids(dir.path(), "a.ts"), vec!["prettier"], "for {name}");
        }
        let dir = project(&[("biome.jsonc", "{}")]);
        assert_eq!(ids(dir.path(), "a.ts"), vec!["biome"]);
    }

    #[test]
    fn manifest_evidence_counts_and_near_misses_do_not() {
        let dep = project(&[("package.json", r#"{"devDependencies":{"prettier":"^3"}}"#)]);
        assert_eq!(ids(dep.path(), "a.ts"), vec!["prettier"]);

        let key = project(&[("package.json", r#"{"prettier":{"semi":false}}"#)]);
        assert_eq!(ids(key.path(), "a.ts"), vec!["prettier"]);

        let biome = project(&[(
            "package.json",
            r#"{"devDependencies":{"@biomejs/biome":"2"}}"#,
        )]);
        assert_eq!(ids(biome.path(), "a.ts"), vec!["biome"]);

        // `eslint-config-prettier` and `prettier-plugin-*` are not Prettier.
        let near = project(&[(
            "package.json",
            r#"{"devDependencies":{"eslint-config-prettier":"9","prettier-plugin-x":"1"}}"#,
        )]);
        assert!(ids(near.path(), "a.ts").is_empty());
    }

    #[test]
    fn both_declared_keeps_the_preference_order() {
        let dir = project(&[("biome.json", "{}"), (".prettierrc", "{}")]);
        assert_eq!(ids(dir.path(), "a.ts"), vec!["biome", "prettier"]);
    }

    #[test]
    fn python_evidence_comes_from_pyproject() {
        let ruff = project(&[("pyproject.toml", "[tool.ruff]\nline-length = 100\n")]);
        assert_eq!(ids(ruff.path(), "a.py"), vec!["ruff"]);

        let black = project(&[("pyproject.toml", "[tool.black]\n")]);
        assert_eq!(ids(black.path(), "a.py"), vec!["black"]);

        let bare = project(&[("a.py", "")]);
        assert!(ids(bare.path(), "a.py").is_empty());
    }

    #[test]
    fn prefers_project_local_bin() {
        // A project-local `node_modules/.bin/biome` must win over the bare global
        // `biome` on PATH — that local-first preference is the point of
        // `local_bin`, and the string-equality assertions below would break if it
        // regressed to always emitting the bare program name.
        let dir = project(&[("biome.json", "{}")]);
        let bin = dir.path().join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("biome"), "#!/bin/sh\n").unwrap();

        let ts = candidates_for(dir.path().to_str().unwrap(), "a.ts");
        let local = bin.join("biome");
        assert_eq!(ts[0].program.as_str(), local.to_string_lossy().as_ref());
        assert_ne!(ts[0].program, "biome");
    }

    #[test]
    fn arguments_carry_the_file_path() {
        let dir = project(&[("biome.json", "{}")]);
        let ts = candidates_for(dir.path().to_str().unwrap(), "src/a.ts");
        assert_eq!(ts[0].args, vec!["format", "--stdin-file-path=src/a.ts"]);
    }

    #[test]
    fn status_reports_what_the_project_declares() {
        // What the marketplace shows per formatter: declared here, installed on
        // this machine. The two are independent — a project can ask for a
        // formatter nobody has installed.
        let dir = project(&[("biome.json", "{}")]);
        let status = formatter_status(dir.path().to_string_lossy().into_owned());
        let biome = status.iter().find(|s| s.id == "biome").unwrap();
        let prettier = status.iter().find(|s| s.id == "prettier").unwrap();
        assert!(biome.declared);
        assert!(!prettier.declared);
        assert!(biome.exts.contains(&"ts"));
    }

    #[test]
    fn a_pinned_formatter_must_still_serve_the_file_type() {
        // The id comes from the webview. Pinning `rustfmt` for a TypeScript file
        // must be refused, not spawned.
        let dir = project(&[("biome.json", "{}")]);
        let root = dir.path().to_string_lossy().into_owned();
        let err = format_file(root, "a.ts".into(), "x".into(), Some("rustfmt".into())).unwrap_err();
        assert!(err.contains("can't format"), "got: {err}");
    }

    #[test]
    fn a_pinned_formatter_overrides_what_the_project_declares() {
        // Prettier in a Biome project: the override wins over detection, and is
        // reached for even though nothing in the project names it.
        let dir = project(&[("biome.json", "{}")]);
        let bin = dir.path().join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin).unwrap();
        // A stand-in formatter that echoes stdin back unchanged.
        let script = bin.join("prettier");
        std::fs::write(&script, "#!/bin/sh\ncat\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let root = dir.path().to_string_lossy().into_owned();
        let out =
            format_file(root, "a.ts".into(), "hello".into(), Some("prettier".into())).unwrap();
        assert_eq!(out.formatter.as_deref(), Some("prettier"));
        assert!(!out.changed);
    }

    #[test]
    fn a_wedged_formatter_is_killed_rather_than_waited_on_forever() {
        // FORMAT_TIMEOUT is the hang guard for format-on-save; prove it fires by
        // running a command that would otherwise never exit.
        let dir = project(&[]);
        let c = Candidate {
            id: "sleep",
            program: "sleep".into(),
            args: vec!["60".into()],
        };
        let started = Instant::now();
        let err = run(dir.path().to_str().unwrap(), &c, "x").unwrap_err();
        assert!(err.contains("did not finish"), "got: {err}");
        assert!(started.elapsed() < FORMAT_TIMEOUT + Duration::from_secs(5));
    }
}
