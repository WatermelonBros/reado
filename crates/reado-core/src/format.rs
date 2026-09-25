//! Serialization to/from the `.md` format (see the crate docs for the thread
//! encoding).

use crate::{CommentMeta, Error, Message, Person, Result};

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
            let by = msg
                .by
                .as_ref()
                .map(|p| {
                    let user = p
                        .user
                        .as_deref()
                        .map(|u| format!(" user={}", escape_attr(u)))
                        .unwrap_or_default();
                    format!(" name={}{user}", escape_attr(&p.name))
                })
                .unwrap_or_default();
            out.push_str(&format!(
                "\n\n{REPLY_PREFIX}author={}{agent}{by} at={} -->\n\n",
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
    let mut current_by = meta.by.clone();
    let mut current_time = meta.created_at;
    let mut buffer = String::new();

    let flush = |messages: &mut Vec<Message>,
                 author: &str,
                 agent: &Option<String>,
                 by: &Option<Person>,
                 time: u64,
                 buf: &str| {
        let body = buf.trim().to_string();
        if !body.is_empty() || messages.is_empty() {
            messages.push(Message {
                author: author.to_string(),
                agent: agent.clone(),
                by: by.clone(),
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
                &current_by,
                current_time,
                &buffer,
            );
            buffer.clear();
            let (author, agent, by, at) = parse_reply_attrs(attrs);
            current_author = author;
            current_agent = agent;
            current_by = by;
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
        &current_by,
        current_time,
        &buffer,
    );

    Ok((meta, messages))
}

fn parse_reply_attrs(attrs: &str) -> (String, Option<String>, Option<Person>, u64) {
    let mut author = "user".to_string();
    let mut agent = None;
    let mut name = None;
    let mut user = None;
    let mut at = 0;
    for token in attrs.trim_end_matches("-->").split_whitespace() {
        if let Some(v) = token.strip_prefix("author=") {
            author = v.to_string();
        } else if let Some(v) = token.strip_prefix("agent=") {
            agent = Some(v.to_string());
        } else if let Some(v) = token.strip_prefix("name=") {
            name = Some(unescape_attr(v));
        } else if let Some(v) = token.strip_prefix("user=") {
            user = Some(unescape_attr(v));
        } else if let Some(v) = token.strip_prefix("at=") {
            at = v.parse().unwrap_or(0);
        }
    }
    let by = name.map(|name| Person { name, user });
    (author, agent, by, at)
}

/// A reply marker's attributes are space-separated and end at `-->`, so a value
/// escapes `%`, whitespace, `-` and `>` as `%XX` — "Jean-Luc Picard" is written
/// `Jean%2DLuc%20Picard`. Everything else, accents included, stays as typed.
fn escape_attr(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    for c in v.chars() {
        if c == '%' || c == '-' || c == '>' || c.is_whitespace() {
            let mut buf = [0u8; 4];
            for b in c.encode_utf8(&mut buf).bytes() {
                out.push_str(&format!("%{b:02X}"));
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn unescape_attr(v: &str) -> String {
    let bytes = v.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        // `get` rather than indexing: a stray `%` before a multi-byte character
        // must not split it.
        if bytes[i] == b'%' {
            if let Some(b) = v
                .get(i + 1..i + 3)
                .and_then(|h| u8::from_str_radix(h, 16).ok())
            {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
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
            by: None,
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
                by: None,
                created_at: 1000,
                body: "Please simplify this loop.".into(),
            },
            Message {
                author: "agent".into(),
                agent: Some("claude-code".into()),
                by: None,
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
    fn who_wrote_each_message_survives_the_round_trip() {
        let hard = Person {
            name: "Jean-Luc 100% Picard -->".into(),
            user: Some("u_42".into()),
        };
        let accented = Person {
            name: "Niccolò Rossi".into(),
            user: None,
        };
        let mut meta = sample_meta();
        meta.by = Some(accented.clone());
        let msg = |author: &str, by: Option<Person>, at| Message {
            author: author.into(),
            agent: None,
            by,
            created_at: at,
            body: format!("message {at}"),
        };
        let messages = vec![
            msg("user", Some(accented.clone()), 1000),
            msg("user", Some(hard.clone()), 2000),
            msg("agent", None, 3000),
        ];
        let md = to_markdown(&meta, &messages).unwrap();
        // The marker stays one line that ends where it should.
        assert!(md.contains("name=Jean%2DLuc%20100%25%20Picard%20%2D%2D%3E user=u_42 at=2000 -->"));
        let (m, msgs) = from_markdown(&md).unwrap();
        assert_eq!(m.by, Some(accented.clone()));
        assert_eq!(msgs[0].by, Some(accented));
        assert_eq!(msgs[1].by, Some(hard));
        assert_eq!(msgs[1].body, "message 2000");
        assert_eq!(msgs[2].by, None);
    }

    #[test]
    fn a_thread_written_before_names_existed_reads_without_them() {
        let old = "---\nid: c1\ntype: bug\nstate: open\nkind: task\nanchor:\n  file: a.rs\n  scope: range\n  startLine: 1\n  endLine: 1\nauthor: user\ncreatedAt: 1\nupdatedAt: 1\n---\n\nHi\n\n<!-- reado:reply author=user at=2 -->\n\nAgain\n";
        let (m, msgs) = from_markdown(old).unwrap();
        assert_eq!(m.by, None);
        assert!(msgs.iter().all(|x| x.by.is_none()));
        assert_eq!(msgs[1].body, "Again");
    }

    #[test]
    fn a_stray_percent_before_an_accent_is_kept_as_typed() {
        assert_eq!(unescape_attr("50%è"), "50%è");
        assert_eq!(unescape_attr(&escape_attr("a%b c-d>è")), "a%b c-d>è");
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
