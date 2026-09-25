//! Serialization to/from the `.md` format (see the crate docs for the thread
//! encoding).

use crate::{CommentMeta, Error, Message, Result};

const REPLY_PREFIX: &str = "<!-- reado:reply ";

/// Parse the text of a comment file into its metadata and thread.
///
/// Public so tools that work on comment files — the official build's sync engine,
/// which merges two versions of one comment — use this crate's format instead of a
/// copy of it.
pub fn parse_comment(text: &str) -> Result<(CommentMeta, Vec<Message>)> {
    from_markdown(text)
}

/// Render metadata and thread back into the comment file format.
pub fn render_comment(meta: &CommentMeta, messages: &[Message]) -> Result<String> {
    to_markdown(meta, messages)
}

pub(crate) fn to_markdown(meta: &CommentMeta, messages: &[Message]) -> Result<String> {
    let front = serde_yaml::to_string(meta).map_err(|e| Error::Yaml(e.to_string()))?;
    let mut out = format!("---\n{front}---\n\n");
    for (i, msg) in messages.iter().enumerate() {
        if i > 0 {
            let agent = msg
                .agent
                .as_deref()
                .map(|a| format!(" agent={a}"))
                .unwrap_or_default();
            out.push_str(&format!(
                "\n\n{REPLY_PREFIX}author={}{agent} at={} -->\n\n",
                msg.author, msg.created_at
            ));
        }
        out.push_str(msg.body.trim_end());
    }
    out.push('\n');
    Ok(out)
}

pub(crate) fn from_markdown(text: &str) -> Result<(CommentMeta, Vec<Message>)> {
    let rest = text
        .strip_prefix("---\n")
        .ok_or_else(|| Error::Yaml("missing front-matter".into()))?;
    let end = rest
        .find("\n---")
        .ok_or_else(|| Error::Yaml("unterminated front-matter".into()))?;
    let front = &rest[..end];
    let body = rest[end + 4..].trim_start_matches(['\n', '\r']);

    let meta: CommentMeta = serde_yaml::from_str(front).map_err(|e| Error::Yaml(e.to_string()))?;

    let mut messages = Vec::new();
    let mut current_author = meta.author.clone();
    let mut current_agent = meta.agent.clone();
    let mut current_time = meta.created_at;
    let mut buffer = String::new();

    let flush = |messages: &mut Vec<Message>,
                 author: &str,
                 agent: &Option<String>,
                 time: u64,
                 buf: &str| {
        let body = buf.trim().to_string();
        if !body.is_empty() || messages.is_empty() {
            messages.push(Message {
                author: author.to_string(),
                agent: agent.clone(),
                created_at: time,
                body,
            });
        }
    };

    for line in body.lines() {
        if let Some(attrs) = line.trim().strip_prefix(REPLY_PREFIX) {
            flush(
                &mut messages,
                &current_author,
                &current_agent,
                current_time,
                &buffer,
            );
            buffer.clear();
            let (author, agent, at) = parse_reply_attrs(attrs);
            current_author = author;
            current_agent = agent;
            current_time = at;
        } else {
            buffer.push_str(line);
            buffer.push('\n');
        }
    }
    flush(
        &mut messages,
        &current_author,
        &current_agent,
        current_time,
        &buffer,
    );

    Ok((meta, messages))
}

fn parse_reply_attrs(attrs: &str) -> (String, Option<String>, u64) {
    let mut author = "user".to_string();
    let mut agent = None;
    let mut at = 0;
    for token in attrs.trim_end_matches("-->").split_whitespace() {
        if let Some(v) = token.strip_prefix("author=") {
            author = v.to_string();
        } else if let Some(v) = token.strip_prefix("agent=") {
            agent = Some(v.to_string());
        } else if let Some(v) = token.strip_prefix("at=") {
            at = v.parse().unwrap_or(0);
        }
    }
    (author, agent, at)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::*;

    fn sample_meta() -> CommentMeta {
        CommentMeta {
            id: "c_test".into(),
            comment_type: CommentType::Bug,
            state: CommentState::Open,
            kind: CommentKind::Task,
            anchor: Anchor {
                file: "src/main.rs".into(),
                scope: Scope::Range,
                start_line: 10,
                end_line: 12,
                url: None,
                x: None,
                y: None,
                target: None,
            },
            context: Context::default(),
            links: vec![],
            author: "user".into(),
            agent: None,
            origin: None,
            external_id: None,
            external_ref: None,
            orphan: false,
            blocked_reason: None,
            attempts: 0,
            resolution: None,
            created_at: 1000,
            updated_at: 1000,
        }
    }

    #[test]
    fn round_trips_a_thread() {
        let meta = sample_meta();
        let messages = vec![
            Message {
                author: "user".into(),
                agent: None,
                created_at: 1000,
                body: "Please simplify this loop.".into(),
            },
            Message {
                author: "agent".into(),
                agent: Some("claude-code".into()),
                created_at: 2000,
                body: "Done.".into(),
            },
        ];
        let md = to_markdown(&meta, &messages).unwrap();
        let (m, msgs) = from_markdown(&md).unwrap();
        assert_eq!(m.id, "c_test");
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[1].agent.as_deref(), Some("claude-code"));
    }

    #[test]
    fn a_web_comment_keeps_its_element_through_the_round_trip() {
        let mut meta = sample_meta();
        meta.anchor.scope = Scope::Web;
        meta.anchor.url = Some("http://localhost:5173/".into());
        meta.anchor.x = Some(120.0);
        meta.anchor.y = Some(340.0);
        let target = WebTarget {
            path: vec![1, 0, 3],
            dx: 10.5,
            dy: 4.0,
            selector: Some("#checkout > button.primary".into()),
            text: Some("Pay now".into()),
            html: Some("<button class=\"primary\">Pay now</button>".into()),
            component: Some("Checkout › PayButton (src/PayButton.tsx:12)".into()),
        };
        meta.anchor.target = Some(target.clone());
        let (m, _) = from_markdown(&to_markdown(&meta, &[]).unwrap()).unwrap();
        assert_eq!(m.anchor.target, Some(target));
        // A comment written before targets existed still reads, without one.
        let (old, _) = from_markdown(&to_markdown(&sample_meta(), &[]).unwrap()).unwrap();
        assert_eq!(old.anchor.target, None);
    }
}

#[cfg(test)]
mod public_api_tests {
    use super::*;
    use crate::{create_comment, reado_dir, CommentKind, CommentType, NewComment, Scope};

    #[test]
    fn parse_render_parse_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let c = create_comment(
            &root,
            NewComment {
                file: "src/a.ts".into(),
                scope: Scope::Range,
                start_line: 3,
                end_line: 4,
                comment_type: CommentType::Bug,
                kind: CommentKind::Task,
                body: "First line\n\nSecond paragraph".into(),
                context: Default::default(),
                url: None,
                x: None,
                y: None,
                target: None,
            },
            "me",
            None,
        )
        .unwrap()
        .comment;
        crate::add_reply(
            &root,
            &c.meta.id,
            "agent",
            Some("claude-code".into()),
            "Done.".into(),
        )
        .unwrap();
        let path = reado_dir(&root)
            .join("comments")
            .join(format!("{}.md", c.meta.id));
        let text = std::fs::read_to_string(path).unwrap();

        let (meta, messages) = parse_comment(&text).unwrap();
        let again = render_comment(&meta, &messages).unwrap();
        let (meta2, messages2) = parse_comment(&again).unwrap();

        assert_eq!(
            serde_json::to_value(&meta).unwrap(),
            serde_json::to_value(&meta2).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&messages).unwrap(),
            serde_json::to_value(&messages2).unwrap()
        );
        assert_eq!(messages2.len(), 2);
    }
}
