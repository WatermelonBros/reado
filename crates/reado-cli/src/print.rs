//! Output helpers: `--json` or the human line, for comments and sessions.

use reado_core as core;
use reado_core::{Comment, CommentState, Scope};

use crate::commands::session::progress;
use crate::Cli;

/// Print the session as JSON (when `--json`), else run the human fallback.
pub(crate) fn emit(
    cli: &Cli,
    s: &core::Session,
    human: impl FnOnce(),
) -> Result<(), Box<dyn std::error::Error>> {
    if cli.json {
        println!("{}", serde_json::to_string_pretty(s)?);
    } else {
        human();
    }
    Ok(())
}

pub(crate) fn emit_proposal(
    cli: &Cli,
    p: &core::Proposal,
) -> Result<(), Box<dyn std::error::Error>> {
    if cli.json {
        println!("{}", serde_json::to_string_pretty(p)?);
    } else {
        println!("proposed {} ({:?})", p.id, p.artifact_type);
    }
    Ok(())
}

pub(crate) fn print_session(s: &core::Session) {
    let (reviewed, total) = progress(s);
    println!("{}  [{:?}]  {}", s.id, s.status, s.title);
    if let Some(obj) = s.objective {
        println!("  objective: {obj:?}");
    }
    println!("  progress: {reviewed}/{total} files reviewed");
    if !s.route.is_empty() {
        println!("  route:");
        for (i, e) in s.route.iter().enumerate() {
            let here = if i == s.position { "→" } else { " " };
            let st = s
                .files
                .iter()
                .find(|f| f.file == e.file)
                .map(|f| format!("{:?}", f.state))
                .unwrap_or_else(|| "?".into());
            println!("   {here} {} [{st}]  {}", e.file, e.reason);
        }
    }
    let open: Vec<_> = s
        .proposals
        .iter()
        .filter(|p| p.state == core::ArtifactState::Proposed)
        .collect();
    if !open.is_empty() {
        println!("  open proposals: {}", open.len());
    }
    if let Some(sum) = &s.summary {
        println!("  summary: {sum}");
    }
}

pub(crate) fn report(cli: &Cli, c: &Comment, verb: &str) {
    if cli.json {
        if let Ok(s) = serde_json::to_string_pretty(c) {
            println!("{s}");
        }
    } else {
        println!("{} {}: {verb}", glyph(c), c.meta.id);
    }
}

fn glyph(c: &Comment) -> &'static str {
    match c.meta.state {
        CommentState::Done => "✓",
        CommentState::Discarded => "—",
        _ if c.meta.orphan => "⚠",
        _ => "●",
    }
}

fn anchor_label(c: &Comment) -> String {
    match c.meta.anchor.scope {
        Scope::Range => format!("{}:{}", c.meta.anchor.file, c.meta.anchor.start_line),
        Scope::File => c.meta.anchor.file.clone(),
        Scope::Project => "(project)".to_string(),
        Scope::Web => {
            let url = c.meta.anchor.url.as_deref().unwrap_or("(web)");
            match c
                .meta
                .anchor
                .target
                .as_ref()
                .and_then(|t| t.selector.as_deref())
            {
                Some(selector) => format!("{url} {selector}"),
                None => url.to_string(),
            }
        }
    }
}

/// What a design comment was left on, for the agent resolving it — the page's
/// counterpart of reading the code at `file:line`.
fn print_web_target(c: &Comment) {
    let Some(t) = c.meta.anchor.target.as_ref() else {
        return;
    };
    for (label, value) in [
        ("element", &t.selector),
        ("component", &t.component),
        ("text", &t.text),
        ("html", &t.html),
    ] {
        if let Some(v) = value.as_deref().filter(|v| !v.is_empty()) {
            println!("    {label}: {v}");
        }
    }
}

fn first_line(c: &Comment) -> &str {
    c.messages
        .first()
        .map(|m| m.body.lines().next().unwrap_or(""))
        .unwrap_or("")
}

pub(crate) fn print_task_line(c: &Comment) {
    println!(
        "{} {}  [{:?}]  {}  ({:?})",
        glyph(c),
        c.meta.id,
        c.meta.comment_type,
        anchor_label(c),
        c.meta.state
    );
    let body = first_line(c);
    if !body.is_empty() {
        println!("    {body}");
    }
}

pub(crate) fn print_task_full(c: &Comment) {
    print_task_line(c);
    print_web_target(c);
    println!();
    for m in &c.messages {
        let who = match (m.author.as_str(), m.agent.as_deref()) {
            ("agent", Some(a)) => a.to_string(),
            ("agent", None) => "agent".to_string(),
            // Name the person when the message says who, so an agent working a
            // shared task knows whose words it is reading.
            _ => {
                m.by.as_ref()
                    .map(|p| p.name.clone())
                    .unwrap_or_else(|| "you".to_string())
            }
        };
        println!("— {who}:");
        for line in m.body.lines() {
            println!("  {line}");
        }
        println!();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reado_core::{CommentKind, NewComment};

    #[test]
    fn a_design_comment_is_labelled_with_its_page_and_element() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let input = NewComment {
            file: String::new(),
            scope: Scope::Web,
            start_line: 0,
            end_line: 0,
            comment_type: core::CommentType::Note,
            kind: CommentKind::Task,
            body: "Make it bigger".into(),
            context: Default::default(),
            url: Some("http://localhost:5173/cart".into()),
            x: Some(10.0),
            y: Some(20.0),
            target: Some(core::WebTarget {
                path: vec![1, 2],
                dx: 4.0,
                dy: 3.0,
                selector: Some("#checkout > button".into()),
                text: Some("Pay now".into()),
                html: None,
                component: Some("Checkout › PayButton".into()),
            }),
        };
        let c = core::create_comment(root, input, "user", None)
            .unwrap()
            .comment;
        // Read back from disk, the way the agent's `reado task list` sees it.
        let c = core::list_comments(root)
            .into_iter()
            .find(|x| x.meta.id == c.meta.id)
            .unwrap();
        assert_eq!(
            anchor_label(&c),
            "http://localhost:5173/cart #checkout > button"
        );
    }
}
