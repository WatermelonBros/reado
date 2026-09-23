//! `reado kb` — the knowledge base: docs, specs and notes.

use std::path::Path;

use clap::Subcommand;
use reado_core as core;

use crate::Cli;

#[derive(Subcommand)]
pub(crate) enum KbCmd {
    /// List the knowledge sources: docs, specs, and the notes (comments) count.
    List,
    /// Print a knowledge document (a doc or spec markdown file) by path.
    Show { path: String },
    /// Full-text search the docs and specs by content.
    Search { query: String },
}

/// The knowledge base: docs, specs and notes, so an agent can consult the plan
/// and documentation before resolving tasks.
pub(crate) fn run(cli: &Cli, root: &str, action: &KbCmd) -> Result<(), Box<dyn std::error::Error>> {
    let root_path = Path::new(root);
    match action {
        KbCmd::List => {
            let mut md = Vec::new();
            collect_markdown(root_path, root_path, &mut md);
            md.sort();
            // Specs live under openspec/ or .specify/; everything else is a doc.
            let (specs, docs): (Vec<String>, Vec<String>) = md
                .into_iter()
                .partition(|p| p.contains("openspec/") || p.contains(".specify/"));
            let active = core::list_comments(root).len();
            let resolved = core::list_archived(root).len();
            if cli.json {
                let v = serde_json::json!({
                    "docs": docs,
                    "specs": specs,
                    "notes": { "active": active, "resolved": resolved },
                });
                println!("{}", serde_json::to_string_pretty(&v)?);
            } else {
                println!("# Docs");
                for d in &docs {
                    println!("  {d}");
                }
                println!("# Specs");
                for s in &specs {
                    println!("  {s}");
                }
                println!("# Notes");
                println!(
                    "  {active} active, {resolved} resolved comments \
                     — `reado kb show <path>` to read a doc/spec, `reado comment search <q>` for notes."
                );
            }
        }
        KbCmd::Show { path } => {
            // Resolve and confirm the target is inside the project. A bare
            // `..` check misses absolute paths — `root.join("/etc/passwd")`
            // discards the base — so canonicalize both and compare prefixes.
            let base =
                std::fs::canonicalize(root_path).map_err(|_| "cannot resolve the project root")?;
            let target = std::fs::canonicalize(root_path.join(path))
                .map_err(|_| "no such file in the project")?;
            if !target.starts_with(&base) {
                return Err("path must be inside the project".into());
            }
            let text = std::fs::read_to_string(&target)?;
            print!("{text}");
        }
        KbCmd::Search { query } => {
            let needle = query.to_lowercase();
            let mut md = Vec::new();
            collect_markdown(root_path, root_path, &mut md);
            md.sort();
            let mut hits: Vec<(String, usize, String)> = Vec::new();
            for rel in &md {
                if hits.len() >= 200 {
                    break;
                }
                let Ok(content) = std::fs::read_to_string(root_path.join(rel)) else {
                    continue;
                };
                for (i, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(&needle) {
                        hits.push((rel.clone(), i + 1, line.trim().to_string()));
                        if hits.len() >= 200 {
                            break;
                        }
                    }
                }
            }
            if cli.json {
                let rows: Vec<_> = hits
                    .iter()
                    .map(|(p, l, t)| serde_json::json!({ "path": p, "line": l, "text": t }))
                    .collect();
                println!("{}", serde_json::to_string_pretty(&rows)?);
            } else if hits.is_empty() {
                println!("No matches.");
            } else {
                for (p, l, t) in &hits {
                    println!("{p}:{l}: {t}");
                }
            }
        }
    }
    Ok(())
}

/// Recursively collect project-relative markdown paths, skipping VCS/build/vendor
/// directories and Reado's own comment store.
fn collect_markdown(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if matches!(
                name.as_str(),
                ".git"
                    | "node_modules"
                    | "target"
                    | "dist"
                    | "build"
                    | ".next"
                    | "vendor"
                    | ".reado"
                    | ".claude"
                    | ".codex"
                    | ".github"
                    | ".vscode"
            ) {
                continue;
            }
            collect_markdown(root, &path, out);
        } else {
            let lower = name.to_lowercase();
            if lower.ends_with(".md") || lower.ends_with(".markdown") {
                if let Ok(rel) = path.strip_prefix(root) {
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
}
