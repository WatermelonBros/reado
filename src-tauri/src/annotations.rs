//! Tauri command wrappers over the shared annotation store (`reado-core`).
//!
//! All comment model and on-disk logic lives in `reado_core`, shared with the
//! `reado` CLI. This module only adapts those functions to the Tauri command
//! boundary (string roots in, JSON out, errors mapped to the app error type).

use std::path::Path;

use reado_core::{
    self as core, Comment, CommentPatch, CommentState, CreateResult, NewComment, Person,
};

use crate::error::Result;

/// Who is writing, for a human message: the person the UI says (the official build
/// passes the signed-in account), else the project's git `user.name`, else nobody.
fn writer(root: &str, by: Option<Person>) -> Option<Person> {
    by.filter(|p| !p.name.trim().is_empty()).or_else(|| {
        crate::git::run_git(Path::new(root), &["config", "user.name"])
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty())
            .map(|name| Person { name, user: None })
    })
}

/// Who a human message written now in `root` would be signed by, when the UI
/// passes nobody: the project's git `user.name` — so the thread can say "you".
#[tauri::command]
pub fn comment_writer(root: String) -> Option<Person> {
    writer(&root, None)
}

#[tauri::command]
pub fn create_comment(root: String, input: NewComment, by: Option<Person>) -> Result<CreateResult> {
    let file = input.file.clone();
    // Comments created from the desktop UI are authored by the user.
    let who = writer(&root, by);
    let result = core::create_comment_by(&root, input, "user", None, who)?;
    crate::log::info(
        "annotations",
        "comment created",
        serde_json::json!({ "file": file }),
    );
    Ok(result)
}

#[tauri::command]
pub fn list_comments(root: String) -> Result<Vec<Comment>> {
    Ok(core::list_comments(&root))
}

#[tauri::command]
pub fn list_archived(root: String) -> Result<Vec<Comment>> {
    Ok(core::list_archived(&root))
}

#[tauri::command]
pub fn update_comment(root: String, id: String, patch: CommentPatch) -> Result<Comment> {
    Ok(core::update_comment(&root, &id, patch)?)
}

#[tauri::command]
pub fn add_reply(
    root: String,
    id: String,
    author: String,
    agent: Option<String>,
    body: String,
    by: Option<Person>,
) -> Result<Comment> {
    // Only a human reply has a person behind it.
    let who = if author == "agent" {
        None
    } else {
        writer(&root, by)
    };
    Ok(core::add_reply_by(&root, &id, &author, agent, who, body)?)
}

/// Block a task with the reason the agent gave, taking it out of the resolvable
/// set until a human answers.
#[tauri::command]
pub fn block_comment(root: String, id: String, reason: String) -> Result<Comment> {
    let result = core::block_comment(&root, &id, &reason)?;
    crate::log::info(
        "annotations",
        "task blocked",
        serde_json::json!({ "id": id }),
    );
    Ok(result)
}

/// Answer a blocked task: the human's note joins the thread and the task returns
/// to open with its attempt count forgiven.
#[tauri::command]
pub fn answer_blocked(
    root: String,
    id: String,
    note: String,
    by: Option<Person>,
) -> Result<Comment> {
    let who = writer(&root, by);
    let result = core::answer_blocked_by(&root, &id, "human", who, &note)?;
    crate::log::info(
        "annotations",
        "blocked task answered",
        serde_json::json!({ "id": id }),
    );
    Ok(result)
}

#[tauri::command]
pub fn set_comment_state(root: String, id: String, state: CommentState) -> Result<Comment> {
    let state_val = serde_json::to_value(state).unwrap_or(serde_json::Value::Null);
    let result = core::set_comment_state(&root, &id, state)?;
    crate::log::info(
        "annotations",
        "comment state changed",
        serde_json::json!({ "id": id, "state": state_val }),
    );
    Ok(result)
}

#[tauri::command]
pub fn delete_comment(root: String, id: String) -> Result<()> {
    core::delete_comment(&root, &id)?;
    crate::log::info(
        "annotations",
        "comment deleted",
        serde_json::json!({ "id": id }),
    );
    Ok(())
}

#[tauri::command]
pub fn add_reado_gitignore(root: String, versioned: bool) -> Result<()> {
    Ok(core::add_reado_gitignore(&root, versioned)?)
}

#[tauri::command]
pub fn read_project_config(root: String) -> Option<String> {
    core::read_config(&root)
}

/// A shared, repository-versioned file under the project's `.reado/` directory
/// (snippets, recommended extensions). Absent is `None`, not an error.
#[tauri::command]
pub fn read_reado_file(root: String, name: String) -> Option<String> {
    core::read_reado_file(&root, &name)
}

/// Write a shared, repository-versioned file under `.reado/`. `name` defaults to
/// the per-project config; the workspace folder list uses the same door.
#[tauri::command]
pub fn write_project_config(root: String, json: String, name: Option<String>) -> Result<()> {
    if let Some(name) = name {
        return Ok(core::write_reado_file(&root, &name, &json)?);
    }
    core::write_config(&root, &json).inspect_err(|e| {
        crate::log::error(
            "annotations",
            "write project config failed",
            serde_json::json!({ "error": e.to_string() }),
        );
    })?;
    Ok(())
}

#[tauri::command]
pub fn reanchor_file(root: String, file: String) -> Result<Vec<Comment>> {
    let comments = core::reanchor_file(&root, &file)?;
    crate::log::debug(
        "annotations",
        "reanchored",
        serde_json::json!({ "file": file, "comments": comments.len() }),
    );
    Ok(comments)
}

#[tauri::command]
pub fn set_anchor(root: String, id: String, file: String, start: u32, end: u32) -> Result<Comment> {
    Ok(core::set_anchor(&root, &id, &file, start, end)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_writer_is_who_the_ui_says_else_gits_user_name_else_nobody() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let git = |args: &[&str]| {
            std::process::Command::new("git")
                .args(args)
                .current_dir(&root)
                .output()
                .unwrap()
        };
        git(&["init", "-q"]);
        git(&["config", "user.name", "Ada Lovelace"]);

        let account = Person {
            name: "Ada".into(),
            user: Some("u1".into()),
        };
        assert_eq!(writer(&root, Some(account.clone())), Some(account));
        let from_git = writer(&root, None).unwrap();
        assert_eq!(from_git.name, "Ada Lovelace");
        assert_eq!(from_git.user, None);
        // A blank name from the UI doesn't hide git's.
        let blank = Person {
            name: " ".into(),
            user: None,
        };
        assert_eq!(writer(&root, Some(blank)).unwrap().name, "Ada Lovelace");
    }
}
