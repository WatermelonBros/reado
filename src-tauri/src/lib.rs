//! Reado desktop backend.
//!
//! The Rust side is intentionally thin: it exposes filesystem, git and search
//! primitives as Tauri commands and lets the React frontend own the experience.
//! Persistence of recent projects, settings and per-project session state lives
//! in the frontend via `tauri-plugin-store`.

mod annotations;
mod bookmarks;
mod cli;
mod error;
mod format;
mod fs;
mod git;
mod index;
mod lsp;
mod menu;
mod progress;
mod pty;
mod search;
mod symbols;
mod watcher;

/// Build and run the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            menu::init(app)?;
            Ok(())
        })
        .manage(pty::PtyState::default())
        .manage(lsp::LspState::default())
        .manage(git::BlameCache::default())
        .manage(menu::LastFocused::default())
        .on_window_event(|window, event| {
            use tauri::Manager;
            // Remember the focused window so menu actions target it (the menu is
            // shared across windows).
            if let tauri::WindowEvent::Focused(true) = event {
                if let Ok(mut last) = window.app_handle().state::<menu::LastFocused>().0.lock() {
                    *last = Some(window.label().to_string());
                }
            }
            // Reap a closing window's PTYs so its shells/dev servers don't linger
            // as orphans while other windows keep the app alive.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                pty::kill_for_window(
                    &window.app_handle().state::<pty::PtyState>(),
                    window.label(),
                );
            }
        })
        .invoke_handler(tauri::generate_handler![
            fs::list_dir,
            fs::list_files,
            fs::read_file,
            fs::write_file,
            fs::create_file,
            fs::move_path,
            fs::import_paths,
            fs::resolve_import,
            fs::resolve_path,
            git::git_info,
            git::git_branches,
            git::git_checkout,
            git::git_status,
            git::git_refs,
            git::git_show_ref,
            git::git_file_history,
            git::git_head,
            git::git_stage,
            git::git_unstage,
            git::git_stage_all,
            git::git_unstage_all,
            git::git_discard,
            git::git_discard_all,
            git::git_commit,
            git::git_blame,
            git::git_create_branch,
            git::git_fetch,
            git::git_pull,
            git::git_push,
            git::git_stash,
            git::git_stash_list,
            git::git_stash_pop,
            git::git_stash_apply,
            git::git_stash_drop,
            search::search_text,
            search::replace_text,
            symbols::find_definition,
            symbols::list_symbols,
            format::format_file,
            cli::install_cli,
            cli::cli_installed,
            annotations::create_comment,
            annotations::list_comments,
            annotations::list_archived,
            annotations::update_comment,
            annotations::add_reply,
            annotations::set_comment_state,
            annotations::delete_comment,
            annotations::add_reado_gitignore,
            annotations::read_project_config,
            annotations::write_project_config,
            annotations::reanchor_file,
            annotations::set_anchor,
            index::rebuild_index,
            progress::list_read,
            progress::set_read,
            progress::get_read_snapshot,
            bookmarks::get_bookmarks,
            bookmarks::set_bookmarks,
            watcher::start_watching,
            pty::pty_spawn,
            pty::pty_default_shell,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            lsp::lsp_start,
            lsp::lsp_send,
            lsp::lsp_stop,
            lsp::lsp_installed,
            lsp::linux_package_manager,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Reado")
        .run(|app, event| {
            // On exit, terminate every PTY (and its dev servers) so nothing
            // outlives the app.
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                pty::kill_all(&app.state::<pty::PtyState>());
                lsp::kill_all(&app.state::<lsp::LspState>());
            }
        });
}
