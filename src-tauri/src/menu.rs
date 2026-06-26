//! Native application menu (macOS/Windows/Linux).
//!
//! Standard edit/window items are predefined (the webview handles undo, copy,
//! …); Reado's own actions are custom items that emit a `menu` event with their
//! id, which the frontend maps to the matching command. Custom items carry no
//! accelerators, so the existing in-app keyboard shortcuts keep working without
//! being intercepted by the menu.

use std::sync::Mutex;

use tauri::App;

/// The label of the most recently focused window. The app menu is shared across
/// windows, so a menu action must be delivered here — `is_focused()` is often
/// false at click time (the menu bar holds focus), which would otherwise fall
/// back to broadcasting and run the action in the wrong window.
#[derive(Default)]
pub struct LastFocused(pub Mutex<Option<String>>);

/// Install the menu. The native menu is used **only on macOS**, where it is the
/// global menu bar. On Windows/Linux Reado draws its own MenuBar in the custom
/// title bar (dispatching the same commands directly), so attaching a native
/// window menu there would render a second, duplicate bar — skip it.
pub fn init(app: &App) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        init_macos(app)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(())
    }
}

/// Build the macOS global menu and forward custom-item clicks to the frontend.
#[cfg(target_os = "macos")]
fn init_macos(app: &App) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
    use tauri::{Emitter, Manager};

    let app_menu = SubmenuBuilder::new(app, "Reado")
        .about(None)
        .separator()
        .text("checkUpdates", "Check for Updates…")
        .text("settings", "Settings…")
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // New Window carries an accelerator (a window-management action with no
    // in-app handler to shadow), unlike the other custom items.
    let new_window = MenuItemBuilder::new("New Window")
        .id("window:new")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let autosave_menu = SubmenuBuilder::new(app, "Auto Save")
        .text("autosave:off", "Off")
        .text("autosave:afterDelay", "After Delay")
        .text("autosave:onFocusChange", "On Focus Change")
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_window)
        .text("newFile", "New File…")
        .text("openFile", "Open File…")
        .text("openFolder", "Open Folder…")
        .text("openRecent", "Open Recent…")
        .separator()
        .text("save", "Save")
        .text("saveAs", "Save As…")
        .item(&autosave_menu)
        .text("revert", "Revert File")
        .text("format", "Format Document")
        .separator()
        .text("reopenClosed", "Reopen Closed Editor")
        .text("closeEditor", "Close Editor")
        .text("closeProject", "Close Project")
        .close_window()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .text("find", "Find…")
        .text("edit:replace", "Replace…")
        .separator()
        .text("edit:findInFiles", "Find in Files…")
        .text("edit:replaceInFiles", "Replace in Files…")
        .separator()
        .text("edit:toggleComment", "Toggle Line Comment")
        .text("edit:toggleBlockComment", "Toggle Block Comment")
        .build()?;

    let selection_menu = SubmenuBuilder::new(app, "Selection")
        .text("sel:expand", "Expand Selection")
        .text("sel:shrink", "Shrink Selection")
        .separator()
        .text("sel:addNext", "Add Selection to Next Match")
        .text("sel:allOccurrences", "Select All Occurrences")
        .text("sel:cursorAbove", "Add Cursor Above")
        .text("sel:cursorBelow", "Add Cursor Below")
        .text("sel:lineEnds", "Add Cursors to Line Ends")
        .text("sel:duplicate", "Duplicate Selection")
        .separator()
        .text("sel:explain", "Explain Selection with AI")
        .text("sel:ask", "Ask AI about Selection…")
        .separator()
        .text("sel:copyUp", "Copy Line Up")
        .text("sel:copyDown", "Copy Line Down")
        .text("sel:moveUp", "Move Line Up")
        .text("sel:moveDown", "Move Line Down")
        .build()?;

    let go_menu = SubmenuBuilder::new(app, "Go")
        .text("go:back", "Back")
        .text("go:forward", "Forward")
        .separator()
        .text("palette:files", "Go to File…")
        .text("palette:symbols", "Go to Symbol in File…")
        .text("palette:wsymbols", "Go to Symbol in Project…")
        .text("palette:commands", "Command Palette…")
        .text("palette:search", "Search in Project…")
        .separator()
        .text("gotodef", "Go to Definition")
        .text("go:peek", "Peek Definition")
        .text("go:typedef", "Go to Type Definition")
        .text("go:impl", "Go to Implementation")
        .text("go:references", "Find References")
        .text("go:callHierarchy", "Show Call Hierarchy")
        .text("go:typeHierarchy", "Show Type Hierarchy")
        .text("gotoLine", "Go to Line…")
        .text("go:bracket", "Go to Bracket")
        .text("go:lastEdit", "Go to Last Edit Location")
        .separator()
        .text("go:nextProblem", "Next Problem")
        .text("go:prevProblem", "Previous Problem")
        .separator()
        .text("go:nextTab", "Next Editor")
        .text("go:prevTab", "Previous Editor")
        .build()?;

    let appearance_menu = SubmenuBuilder::new(app, "Appearance")
        .text("theme:reado-dark", "Dark")
        .text("theme:reado-light", "Light")
        .text("theme:reado-high-contrast", "High Contrast")
        .text("theme:reado-sepia", "Sepia")
        .build()?;

    let open_view_menu = SubmenuBuilder::new(app, "Open View")
        .text("view:open:files", "Files")
        .text("view:open:search", "Search")
        .text("view:open:comments", "Comments")
        .text("view:open:outline", "Outline")
        .text("view:open:git", "Source Control")
        .text("view:open:extensions", "Extensions")
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .text("palette:commands", "Command Palette…")
        .item(&open_view_menu)
        .separator()
        .text("view:sidebar", "Toggle Sidebar")
        .text("view:activityBar", "Toggle Activity Bar")
        .text("view:statusBar", "Toggle Status Bar")
        .text("view:breadcrumbs", "Toggle Breadcrumbs")
        .text("terminal", "Toggle Terminal")
        .text("view:split", "Split Editor")
        .separator()
        .text("view:wrap", "Toggle Word Wrap")
        .text("view:whitespace", "Render Whitespace")
        .text("view:ribbon", "Structure Ribbon")
        .text("view:focus", "Focus Mode")
        .text("view:readingWidth", "Centered/Reading Layout")
        .separator()
        .text("graph", "Knowledge Graph")
        .text("docs", "Documentation")
        .item(&appearance_menu)
        .separator()
        .text("zoom:in", "Zoom In")
        .text("zoom:out", "Zoom Out")
        .text("zoom:reset", "Reset Zoom")
        .build()?;

    let terminal_menu = SubmenuBuilder::new(app, "Terminal")
        .text("terminal:new", "New Terminal")
        .text("terminal:split", "Split Terminal")
        .text("terminal:clear", "Clear Terminal")
        .text("terminal:restart", "Restart Terminal")
        .separator()
        .text("terminal:launch:claude", "Launch Claude")
        .text("terminal:launch:codex", "Launch Codex")
        .text("terminal:launch:copilot", "Launch Copilot")
        .text("terminal:sendReview", "Send Review")
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .separator()
        .fullscreen()
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .text("help:shortcuts", "Keyboard Shortcuts")
        .text("docs", "Documentation")
        .text("help:website", "Reado Website")
        .text("help:report", "Report an Issue")
        .separator()
        .text("help:releases", "Release Notes")
        .text("checkUpdates", "Check for Updates…")
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &selection_menu,
            &go_menu,
            &view_menu,
            &terminal_menu,
            &window_menu,
            &help_menu,
        ])
        .build()?;

    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        // Predefined items are handled natively; forward our custom ids so the
        // frontend can run the matching command. Send to the *focused* window
        // only — otherwise, with multiple windows open, one menu action would
        // fire in every window.
        let id = event.id().0.clone();
        // Prefer the last-focused window (tracked on focus); fall back to whichever
        // currently reports focus, then to a broadcast.
        let last_label = app
            .state::<LastFocused>()
            .0
            .lock()
            .ok()
            .and_then(|g| g.clone());
        let target = last_label
            .and_then(|l| app.get_webview_window(&l))
            .or_else(|| {
                app.webview_windows()
                    .into_values()
                    .find(|w| w.is_focused().unwrap_or(false))
            });
        match target {
            Some(win) => {
                let _ = win.emit("menu", id);
            }
            None => {
                let _ = app.emit("menu", id);
            }
        }
    });

    Ok(())
}
