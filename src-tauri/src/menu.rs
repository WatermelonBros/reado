//! Native application menu (macOS/Windows/Linux).
//!
//! Standard edit/window items are predefined (the webview handles undo, copy,
//! …); Reado's own actions are custom items that emit a `menu` event with their
//! id, which the frontend maps to the matching command. Custom items carry no
//! accelerators, so the existing in-app keyboard shortcuts keep working without
//! being intercepted by the menu.

use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::{App, Emitter};

/// Build the menu, install it, and forward custom-item clicks to the frontend.
pub fn init(app: &App) -> tauri::Result<()> {
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

    let file_menu = SubmenuBuilder::new(app, "File")
        .text("openFolder", "Open Folder…")
        .separator()
        .text("save", "Save")
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
        .build()?;

    let selection_menu = SubmenuBuilder::new(app, "Selection")
        .text("sel:addNext", "Add Selection to Next Match")
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
        .text("go:references", "Find References")
        .text("gotoLine", "Go to Line…")
        .build()?;

    let appearance_menu = SubmenuBuilder::new(app, "Appearance")
        .text("theme:reado-dark", "Dark")
        .text("theme:reado-light", "Light")
        .text("theme:reado-high-contrast", "High Contrast")
        .text("theme:reado-sepia", "Sepia")
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .text("view:sidebar", "Toggle Sidebar")
        .text("terminal", "Toggle Terminal")
        .text("view:split", "Split Editor")
        .separator()
        .text("view:wrap", "Toggle Word Wrap")
        .text("view:focus", "Focus Mode")
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
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .separator()
        .fullscreen()
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
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
        // frontend can run the matching command.
        let _ = app.emit("menu", event.id().0.clone());
    });

    Ok(())
}
