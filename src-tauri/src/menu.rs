//! Native application menu (macOS/Windows/Linux).
//!
//! Clipboard and window items are predefined; Reado's own actions are custom
//! items that emit a `menu` event with their id, which the frontend maps to the
//! matching command.
//!
//! Items built with `acc!` carry a keyboard accelerator, which on macOS both
//! *displays* the shortcut in the menu and *claims* the keystroke before the
//! webview sees it. That is only safe where the menu command does the same thing
//! as the in-app binding it shadows, so the list is deliberately partial and
//! lives in `src/lib/appMenu.ts` (`ACCELERATORS`); `appMenu.test.ts` fails the
//! build if this file and that table disagree. Every other item stays a plain
//! `.text(…)` and leaves its keystroke to the frontend.
//!
//! Undo/redo are **not** predefined, and that is the point. A predefined item
//! carries ⌘Z, so macOS claims the keystroke before the webview ever sees it and
//! sends the native `undo:` down the responder chain — which asks WebKit's own
//! undo manager, not CodeMirror's history. The editor keeps its own history and
//! rewrites the DOM from its state after every transaction, so WebKit's stack is
//! empty and the keystroke did nothing: ⌘Z in a file was dead. As custom items
//! without accelerators they still work from the menu, and ⌘Z reaches the editor.
//! Cut/copy/paste stay predefined because those *are* dispatched as DOM events
//! the editor already handles.

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

/// A custom menu item that carries a keyboard accelerator.
///
/// Keep every use of this macro in sync with `ACCELERATORS` in
/// `src/lib/appMenu.ts` — the drift guard parses this file looking for exactly
/// this call shape.
#[cfg(target_os = "macos")]
macro_rules! acc {
    ($app:expr, $id:expr, $label:expr, $accel:expr) => {
        tauri::menu::MenuItemBuilder::new($label)
            .id($id)
            .accelerator($accel)
            .build($app)?
    };
}

/// Build the macOS global menu and forward custom-item clicks to the frontend.
#[cfg(target_os = "macos")]
fn init_macos(app: &App) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, SubmenuBuilder};
    use tauri::{Emitter, Manager};

    let app_menu = SubmenuBuilder::new(app, "Reado")
        .about(None)
        .separator()
        .text("checkUpdates", "Check for Updates…")
        .item(&acc!(app, "settings", "Settings…", "CmdOrCtrl+,"))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let new_window = acc!(app, "window:new", "New Window", "CmdOrCtrl+Shift+N");
    let autosave_menu = SubmenuBuilder::new(app, "Auto Save")
        .text("autosave:off", "Off")
        .text("autosave:afterDelay", "After Delay")
        .text("autosave:onFocusChange", "On Focus Change")
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_window)
        .item(&acc!(
            app,
            "newUntitled",
            "New Untitled File",
            "CmdOrCtrl+N"
        ))
        .text("newFile", "New File…")
        .item(&acc!(app, "openFile", "Open File…", "CmdOrCtrl+O"))
        .text("openFolder", "Open Folder…")
        .text("openRecent", "Open Recent…")
        .text("workspace:addFolder", "Add Folder to Workspace…")
        .text("workspace:open", "Open Workspace…")
        .text("workspace:saveAs", "Save Workspace As…")
        .separator()
        .item(&acc!(app, "save", "Save", "CmdOrCtrl+S"))
        .item(&acc!(app, "saveAll", "Save All", "CmdOrCtrl+Alt+S"))
        .item(&acc!(app, "saveAs", "Save As…", "CmdOrCtrl+Shift+S"))
        .item(&autosave_menu)
        .text("revert", "Revert File")
        .text("compareSaved", "Compare with Saved")
        .item(&acc!(app, "format", "Format Document", "Alt+Shift+F"))
        .text("formatSelection", "Format Selection")
        .separator()
        .item(&acc!(
            app,
            "reopenClosed",
            "Reopen Closed Editor",
            "CmdOrCtrl+Shift+T"
        ))
        .item(&acc!(app, "closeEditor", "Close Editor", "CmdOrCtrl+W"))
        .text("closeProject", "Close Project")
        .close_window()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .text("edit:undo", "Undo")
        .text("edit:redo", "Redo")
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&acc!(app, "find", "Find…", "CmdOrCtrl+F"))
        .item(&acc!(app, "edit:replace", "Replace…", "CmdOrCtrl+Alt+F"))
        .separator()
        .text("edit:findInFiles", "Find in Files…")
        .text("edit:replaceInFiles", "Replace in Files…")
        .separator()
        .item(&acc!(
            app,
            "edit:toggleComment",
            "Toggle Line Comment",
            "CmdOrCtrl+/"
        ))
        .text("edit:toggleBlockComment", "Toggle Block Comment")
        .item(&acc!(app, "gotoLine", "Go to Line…", "Ctrl+G"))
        .separator()
        .item(&acc!(app, "edit:quickFix", "Quick Fix…", "CmdOrCtrl+."))
        .text("edit:organizeImports", "Organize Imports")
        .separator()
        .text("edit:cursorUndo", "Cursor Undo")
        .text("edit:cursorRedo", "Cursor Redo")
        .separator()
        .text("edit:upperCase", "Transform to Uppercase")
        .text("edit:lowerCase", "Transform to Lowercase")
        .text("edit:titleCase", "Transform to Title Case")
        .text("edit:sortAsc", "Sort Lines Ascending")
        .text("edit:sortDesc", "Sort Lines Descending")
        .text("edit:dedupe", "Delete Duplicate Lines")
        .text("edit:joinLines", "Join Lines")
        .separator()
        .text("edit:trimWhitespace", "Trim Trailing Whitespace")
        .text("edit:reindent", "Reindent Lines")
        .text("edit:convertSpaces", "Convert Indentation to Spaces")
        .text("edit:convertTabs", "Convert Indentation to Tabs")
        .build()?;

    let selection_menu = SubmenuBuilder::new(app, "Selection")
        .text("sel:expand", "Expand Selection")
        .text("sel:shrink", "Shrink Selection")
        .separator()
        .text("sel:addNext", "Add Selection to Next Match")
        .text("sel:allOccurrences", "Select All Occurrences")
        .text("sel:cursorAbove", "Add Cursor Above")
        .text("sel:cursorBelow", "Add Cursor Below")
        .item(&acc!(
            app,
            "sel:lineEnds",
            "Add Cursors to Line Ends",
            "Shift+Alt+I"
        ))
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
        .item(&acc!(app, "palette:files", "Go to File…", "CmdOrCtrl+P"))
        .item(&acc!(
            app,
            "palette:symbols",
            "Go to Symbol in File…",
            "CmdOrCtrl+Shift+O"
        ))
        .item(&acc!(
            app,
            "palette:wsymbols",
            "Go to Symbol in Project…",
            "CmdOrCtrl+T"
        ))
        .item(&acc!(
            app,
            "palette:commands",
            "Command Palette…",
            "CmdOrCtrl+Shift+P"
        ))
        .item(&acc!(
            app,
            "palette:search",
            "Search in Project…",
            "CmdOrCtrl+Shift+F"
        ))
        .separator()
        .item(&acc!(app, "gotodef", "Go to Definition", "F12"))
        .item(&acc!(app, "go:peek", "Peek Definition", "Alt+F12"))
        .text("go:typedef", "Go to Type Definition")
        .text("go:impl", "Go to Implementation")
        .item(&acc!(app, "go:references", "Find References", "Shift+F12"))
        .text("go:callHierarchy", "Show Call Hierarchy")
        .text("go:typeHierarchy", "Show Type Hierarchy")
        .text("go:bracket", "Go to Bracket")
        .text("go:lastEdit", "Go to Last Edit Location")
        .separator()
        .item(&acc!(app, "go:nextProblem", "Next Problem", "F8"))
        .item(&acc!(app, "go:prevProblem", "Previous Problem", "Shift+F8"))
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
        .item(&acc!(app, "view:sidebar", "Toggle Sidebar", "CmdOrCtrl+B"))
        .text("view:activityBar", "Toggle Activity Bar")
        .text("view:statusBar", "Toggle Status Bar")
        .text("view:breadcrumbs", "Toggle Breadcrumbs")
        .item(&acc!(app, "terminal", "Toggle Terminal", "CmdOrCtrl+J"))
        .item(&acc!(
            app,
            "view:splitToggle",
            "Split Editor",
            "CmdOrCtrl+\\"
        ))
        .item(&acc!(
            app,
            "group:split",
            "Split Editor into a New Group",
            "CmdOrCtrl+Alt+\\"
        ))
        .separator()
        .text("view:foldAll", "Fold All")
        .text("view:unfoldAll", "Unfold All")
        .separator()
        .item(&acc!(app, "view:wrap", "Toggle Word Wrap", "Alt+Z"))
        .item(&acc!(
            app,
            "view:columnSelection",
            "Column Selection Mode",
            "CmdOrCtrl+Alt+Shift+C"
        ))
        .text("view:whitespace", "Render Whitespace")
        .text("view:ribbon", "Structure Ribbon")
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
        .text("tasks:run", "Run Task…")
        .item(&acc!(
            app,
            "tasks:build",
            "Run Build Task",
            "CmdOrCtrl+Shift+B"
        ))
        .separator()
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
        .text("help:discord", "Discord Community")
        .text("help:report", "Report an Issue")
        .separator()
        .text("help:revealLog", "Reveal Log File")
        .text("help:copyLogPath", "Copy Log Path")
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
    // Hand the Window submenu to AppKit as *the* windows menu, after the bar is
    // installed — before it, there is no NSMenu yet to attach. Without this macOS
    // keeps no window list at all: the Window menu never lists what is open and
    // the Dock icon's context menu has nothing to show, so with two projects open
    // (one of them hidden) there was no way to tell them apart or get the hidden
    // one back. AppKit fills the list from each window's title, which is why the
    // title now names the project.
    window_menu.set_as_windows_menu_for_nsapp()?;

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

/// Keep the window's title *string* while hiding the text macOS would draw.
///
/// The title bar is an overlay (`titleBarStyle: "overlay"`), which makes it
/// transparent but does not stop AppKit painting the title across the content —
/// which is why Reado used to leave the title empty on macOS. But that string is
/// exactly what the Dock's window list and the Window menu read: with two
/// projects open and one of them minimised, an empty title leaves it unreachable
/// — nothing in the Dock's context menu names it. So the string stays, and only
/// its drawing goes.
#[tauri::command]
pub fn window_hide_title_text(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // AppKit only from the main thread — and a Tauri command does not run
        // there, which is why the first version of this silently did nothing.
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                use objc2::MainThreadMarker;
                use objc2_app_kit::{NSApplication, NSWindow, NSWindowTitleVisibility};

                let Ok(ptr) = target.ns_window() else { return };
                let Some(mtm) = MainThreadMarker::new() else {
                    return;
                };
                // Safety: `ns_window()` hands back this window's live NSWindow,
                // and this closure runs on the main thread.
                unsafe {
                    let Some(ns) = (ptr as *mut NSWindow).as_ref() else {
                        return;
                    };
                    ns.setTitleVisibility(NSWindowTitleVisibility::Hidden);
                    // Put the window in the Windows menu under its title — which
                    // is what the Dock icon's context menu lists too. AppKit
                    // registers a window itself only if it is ordered front
                    // *after* the windows menu exists, and the first window is
                    // built from the config before this app's menu is, so it
                    // would never appear.
                    ns.setExcludedFromWindowsMenu(false);
                    let app = NSApplication::sharedApplication(mtm);
                    app.addWindowsItem_title_filename(ns, &ns.title(), false);
                    app.changeWindowsItem_title_filename(ns, &ns.title(), false);
                }
            })
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Everywhere else the title bar is Reado's own and draws no title text,
        // and the taskbar already reads the title.
        let _ = window;
    }
    Ok(())
}
