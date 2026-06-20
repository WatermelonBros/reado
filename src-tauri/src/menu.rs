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
        .text("save", "Save")
        .text("format", "Format Document")
        .separator()
        .text("closeEditor", "Close Editor")
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
        .build()?;

    let go_menu = SubmenuBuilder::new(app, "Go")
        .text("palette:files", "Go to File…")
        .text("palette:commands", "Command Palette…")
        .text("palette:search", "Search in Project…")
        .separator()
        .text("gotodef", "Go to Definition")
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .text("terminal", "Toggle Terminal")
        .text("graph", "Knowledge Graph")
        .text("docs", "Documentation")
        .separator()
        .text("zoom:in", "Zoom In")
        .text("zoom:out", "Zoom Out")
        .text("zoom:reset", "Reset Zoom")
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .separator()
        .fullscreen()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &go_menu,
            &view_menu,
            &window_menu,
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
