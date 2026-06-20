//! Format Document via the project's own formatters.
//!
//! Like VS Code, Reado doesn't bundle formatters — it runs whatever the project
//! provides. The active file's content is piped through the first available
//! formatter for its type (preferring the project-local `node_modules/.bin`),
//! and the formatted text is returned for the editor to apply. The file on disk
//! is never touched here; saving stays the user's choice.

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

/// A formatter invocation: a program and its arguments (content arrives on stdin).
struct Candidate {
    program: String,
    args: Vec<String>,
}

/// Resolve a binary inside the project's `node_modules/.bin`, if present.
fn local_bin(root: &str, name: &str) -> Option<String> {
    let p = Path::new(root).join("node_modules").join(".bin").join(name);
    p.exists().then(|| p.to_string_lossy().into_owned())
}

/// Ordered formatter candidates for a file, most-preferred first.
fn candidates_for(root: &str, path: &str) -> Vec<Candidate> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mut out: Vec<Candidate> = Vec::new();
    let mut push = |program: String, args: Vec<String>| out.push(Candidate { program, args });

    // Web languages → Biome, then Prettier (project-local binary preferred).
    let web = matches!(
        ext.as_str(),
        "js" | "jsx"
            | "ts"
            | "tsx"
            | "mjs"
            | "cjs"
            | "json"
            | "jsonc"
            | "css"
            | "scss"
            | "less"
            | "html"
            | "vue"
            | "svelte"
            | "md"
            | "mdx"
            | "yaml"
            | "yml"
            | "graphql"
    );
    if web {
        let biome = local_bin(root, "biome").unwrap_or_else(|| "biome".into());
        push(
            biome,
            vec!["format".into(), format!("--stdin-file-path={path}")],
        );
        let prettier = local_bin(root, "prettier").unwrap_or_else(|| "prettier".into());
        push(prettier, vec!["--stdin-filepath".into(), path.to_string()]);
    }

    match ext.as_str() {
        "rs" => push("rustfmt".into(), vec!["--emit".into(), "stdout".into()]),
        "go" => push("gofmt".into(), vec![]),
        "py" => {
            push("ruff".into(), vec!["format".into(), "-".into()]);
            push("black".into(), vec!["-q".into(), "-".into()]);
        }
        "rb" => push(
            "rubocop".into(),
            vec!["-a".into(), "-s".into(), path.to_string()],
        ),
        "sh" | "bash" => push("shfmt".into(), vec![]),
        _ => {}
    }
    out
}

/// Run a single candidate over `content`. Returns `Ok(None)` if the program is
/// not installed (so the caller can try the next one), `Ok(Some(text))` on a
/// clean format, or `Err(stderr)` when the formatter ran but failed.
fn run(root: &str, c: &Candidate, content: &str) -> Result<Option<String>, String> {
    let mut child = match Command::new(&c.program)
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
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(content.as_bytes())
            .map_err(|e| e.to_string())?;
        // Dropping stdin closes it, signalling EOF to the formatter.
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(Some(String::from_utf8_lossy(&output.stdout).into_owned()))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Format `content` (the active file's text) with the project's formatter and
/// return the result. Errors when no formatter is available or it fails.
#[tauri::command]
pub fn format_file(root: String, path: String, content: String) -> Result<String, String> {
    let candidates = candidates_for(&root, &path);
    if candidates.is_empty() {
        return Err("No formatter configured for this file type.".into());
    }
    for c in &candidates {
        // `None` means that formatter isn't installed — try the next candidate.
        if let Some(formatted) = run(&root, c, &content)? {
            return Ok(formatted);
        }
    }
    Err("No formatter installed for this file type.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_candidates_by_extension() {
        let c = candidates_for("/x", "a.ts");
        assert!(c.iter().any(|c| c.program.ends_with("biome")));
        assert!(c.iter().any(|c| c.program.ends_with("prettier")));

        let rs = candidates_for("/x", "a.rs");
        assert_eq!(rs.len(), 1);
        assert_eq!(rs[0].program, "rustfmt");

        assert!(candidates_for("/x", "a.unknownext").is_empty());
    }
}
