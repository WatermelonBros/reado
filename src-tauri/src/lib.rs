//! Reado desktop backend.
//!
//! The Rust side is intentionally thin: it exposes filesystem, git and search
//! primitives as Tauri commands and lets the React frontend own the experience.
//! Persistence of recent projects, settings and per-project session state lives
//! in the frontend via `tauri-plugin-store`.

mod annotations;
mod error;
mod fs;
mod git;
mod pty;
mod search;
mod watcher;

/// Build and run the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            fs::list_dir,
            fs::list_files,
            fs::read_file,
            fs::write_file,
            git::git_info,
            git::git_status,
            git::git_show_head,
            search::search_text,
            annotations::create_comment,
            annotations::list_comments,
            annotations::list_archived,
            annotations::update_comment,
            annotations::add_reply,
            annotations::set_comment_state,
            annotations::delete_comment,
            annotations::add_reado_gitignore,
            annotations::reanchor_file,
            annotations::set_anchor,
            watcher::start_watching,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Reado");
}
