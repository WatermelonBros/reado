//! Reado desktop backend.
//!
//! The Rust side is intentionally thin: it exposes filesystem, git and search
//! primitives as Tauri commands and lets the React frontend own the experience.
//! Persistence of recent projects, settings and per-project session state lives
//! in the frontend (localStorage + `.reado/*.json`).

mod annotations;
mod anywhere;
mod bookmarks;
mod cli;
mod defaults;
mod error;
mod fileopen;
mod forge;
mod format;
mod fs;
mod git;
mod index;
mod log;
mod lsp;
mod menu;
mod proc;
mod progress;
mod pty;
mod search;
mod sessions;
mod symbols;
mod watcher;

/// Build and run the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance MUST be the first plugin: a second launch (e.g. the OS
        // opening a file with Reado while it's running) forwards its argv here
        // instead of spawning a rival process, and we open the file(s) in-place.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for arg in argv.iter().skip(1) {
                let p = std::path::Path::new(arg);
                if p.is_file() {
                    fileopen::open_path(app, p);
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Native clipboard read/write so the terminal's paste doesn't go through
        // the webview Clipboard API — on Windows that pops a WebView2 permission
        // prompt naming the origin ("tauri.localhost"), not the app.
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Bring up the logging engine before anything else so the rest of
            // setup is captured. Resolve a *per-user private* log dir: the OS
            // app-log dir, or a home-relative fallback. We deliberately avoid a
            // shared temp dir (multi-user exposure); if neither resolves we skip
            // logging rather than write somewhere world-readable. Logging never
            // blocks startup.
            use tauri::Manager;
            let home = app.path().home_dir().ok();
            let log_dir = app
                .path()
                .app_log_dir()
                .ok()
                .or_else(|| home.as_ref().map(|h| h.join(".reado").join("logs")));
            if let Some(log_dir) = log_dir {
                let log_path = log::init(log_dir, home);
                log::info(
                    "app",
                    "startup",
                    serde_json::json!({
                        "version": app.package_info().version.to_string(),
                        "logPath": log_path.to_string_lossy(),
                    }),
                );
            }
            menu::init(app)?;
            anywhere::dev_autostart(app.handle());
            // Files passed on the command line (Windows/Linux cold launch). macOS
            // delivers them via RunEvent::Opened instead.
            fileopen::open_from_args(app.handle());
            Ok(())
        })
        .manage(pty::PtyState::default())
        .manage(fileopen::OpenQueue::default())
        .manage(anywhere::AnywhereState::default())
        .manage(lsp::LspState::default())
        .manage(git::BlameCache::default())
        .manage(symbols::SymbolCache::default())
        .manage(menu::LastFocused::default())
        .on_window_event(|window, event| {
            use tauri::Manager;
            // Remember the focused window so menu actions target it (the menu is
            // shared across windows).
            if let tauri::WindowEvent::Focused(true) = event {
                log::debug(
                    "app",
                    "window focused",
                    serde_json::json!({ "window": window.label() }),
                );
                if let Ok(mut last) = window.app_handle().state::<menu::LastFocused>().0.lock() {
                    *last = Some(window.label().to_string());
                }
            }
            // Reap a closing window's PTYs so its shells/dev servers don't linger
            // as orphans while other windows keep the app alive.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                log::info(
                    "app",
                    "window close requested",
                    serde_json::json!({ "window": window.label() }),
                );
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
            fs::trash_path,
            fs::import_paths,
            fs::resolve_import,
            fs::resolve_path,
            git::git_info,
            git::git_branches,
            git::git_checkout,
            git::git_status,
            git::git_refs,
            git::git_show_ref,
            git::git_diff_lines,
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
            git::git_sync,
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
            sessions::session_create,
            sessions::session_list,
            sessions::session_get,
            sessions::session_set_file_state,
            sessions::session_set_position,
            sessions::session_accept_proposal,
            sessions::session_set_proposal_state,
            sessions::session_add_decision,
            sessions::session_set_file_summary,
            sessions::session_set_summary,
            sessions::session_close,
            sessions::session_delete,
            git::git_changed_files,
            forge::detect_forge,
            forge::forge_cli_present,
            forge::forge_list_prs,
            forge::forge_checkout_pr,
            forge::forge_fetch_pr,
            forge::forge_submit_review,
            forge::forge_pull_threads,
            forge::forge_resolve_thread,
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
            anywhere::anywhere_enable,
            anywhere::anywhere_disable,
            anywhere::anywhere_status,
            anywhere::anywhere_set_project,
            anywhere::anywhere_clear_project,
            anywhere::anywhere_set_recents,
            anywhere::anywhere_publish_loop,
            log::log_record,
            log::log_path,
            log::log_set_config,
            proc::agent_installed,
            fileopen::drain_open_targets,
            defaults::set_default_handler,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Reado")
        .run(|app, event| {
            // macOS delivers "open these files with Reado" as an Apple event.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        fileopen::open_path(app, &path);
                    }
                }
            }
            // On exit, terminate every PTY (and its dev servers) so nothing
            // outlives the app.
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                log::info(
                    "app",
                    "exit: tearing down subsystems",
                    serde_json::Value::Null,
                );
                pty::kill_all(&app.state::<pty::PtyState>());
                lsp::kill_all(&app.state::<lsp::LspState>());
                anywhere::shutdown(&app.state::<anywhere::AnywhereState>());
            }
        });
}
