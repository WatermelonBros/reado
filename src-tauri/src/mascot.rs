//! The companion window: a frameless, transparent sheet parked in a corner of
//! the display, always above everything, never taking focus.
//!
//! Two things here are not obvious and are the whole of the work:
//!
//! - **Click-through has to be steered from outside the window.** A webview with
//!   `ignore_cursor_events` set never receives a pointer event at all, so it
//!   cannot notice that the pointer is over the owl and ask for them back. The
//!   frontend therefore reports which rectangle of itself is solid
//!   (`mascot_hit_rect`), and a poll here compares the OS cursor against it,
//!   turning the pass-through off only while the cursor is inside.
//! - **The window is sized once**, big enough for the character plus the longest
//!   bubble. Resizing it per bubble makes it flicker above other applications,
//!   and the corner it is parked in is what decides which way the bubble opens.

use std::sync::Mutex;

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, WebviewUrl,
    WebviewWindowBuilder,
};

/// The companion's label, and the hash route its page lives at.
const LABEL: &str = "mascot";

/// How much room the character needs around it for a bubble. The window is this
/// much bigger than the owl in both directions; the owl sits in the parked
/// corner of it and the bubble uses the rest.
const BUBBLE_W: f64 = 300.0;
/// Enough for the longest thing an agent may say (`MASCOT_MAX` characters) with
/// the bubble at its widest. The window is transparent and lets the pointer
/// through, so reserving room costs nothing — and reserving too little clips the
/// top of the bubble, which is the one part that must be readable.
const BUBBLE_H: f64 = 240.0;
/// Distance kept from the work area's edges. Zero: the work area already stops
/// at the menu bar and the Dock, so its edge is exactly where a companion
/// standing *on* the Dock belongs. Any margin here reads as "floating near the
/// corner" rather than "in it" — the page keeps a few pixels of its own so the
/// character is not literally flush.
const MARGIN: f64 = 0.0;
/// How often the cursor is checked against the solid rectangle. Fast enough that
/// a click on the owl is never swallowed, slow enough to be free.
const POLL_MS: u64 = 60;

/// The part of the window that is solid, in logical pixels from its top-left.
/// `None` until the page has drawn and measured itself.
#[derive(Default)]
pub struct HitRect(pub Mutex<Option<(f64, f64, f64, f64)>>);

/// Where the window sits for a corner, given the work area it must stay inside.
fn place(corner: &str, area: (f64, f64, f64, f64), size: (f64, f64)) -> (f64, f64) {
    let (ax, ay, aw, ah) = area;
    let (w, h) = size;
    let x = if corner.ends_with("left") {
        ax + MARGIN
    } else {
        ax + aw - w - MARGIN
    };
    let y = if corner.starts_with("top") {
        ay + MARGIN
    } else {
        ay + ah - h - MARGIN
    };
    (x, y)
}

/// Show the companion (creating it the first time) or hide it.
#[tauri::command]
pub fn mascot_show(app: AppHandle, show: bool, corner: String, size: f64) -> Result<(), String> {
    if !show {
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.hide();
        }
        return Ok(());
    }

    let win = match app.get_webview_window(LABEL) {
        Some(w) => w,
        None => WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html#mascot".into()))
            .title("Reado")
            .inner_size(size + BUBBLE_W, size + BUBBLE_H)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .resizable(false)
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?,
    };

    let _ = win.set_size(LogicalSize::new(size + BUBBLE_W, size + BUBBLE_H));
    // Park it on the screen the user is working on — the main window's — not on
    // whichever one this window happens to have been created on.
    let monitor = app
        .get_webview_window("main")
        .and_then(|m| m.current_monitor().ok().flatten())
        .or_else(|| win.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    if let Some(mon) = monitor {
        let scale = mon.scale_factor();
        // The WORK AREA, not the monitor: the menu bar and the Dock are not
        // screen the companion may sit under. Using the full size put the top
        // corners behind the menu bar, where they are not corners at all.
        let area = mon.work_area();
        let pos = area.position.to_logical::<f64>(scale);
        let asize = area.size.to_logical::<f64>(scale);
        let (x, y) = place(
            &corner,
            (pos.x, pos.y, asize.width, asize.height),
            (size + BUBBLE_W, size + BUBBLE_H),
        );
        crate::log::info(
            "mascot",
            "parked",
            serde_json::json!({
                "corner": corner, "x": x, "y": y,
                "work": [pos.x, pos.y, asize.width, asize.height],
                "window": [size + BUBBLE_W, size + BUBBLE_H],
            }),
        );
        let _ = win.set_position(LogicalPosition::new(x, y));
    }
    // It never steals focus: showing it must not take the caret out of whatever
    // the user is typing in.
    let _ = win.set_ignore_cursor_events(true);
    let _ = win.show();
    Ok(())
}

/// The page reporting which rectangle of itself is solid.
#[tauri::command]
pub fn mascot_hit_rect(app: AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    *app.state::<HitRect>().0.lock().unwrap() = Some((x, y, w, h));
    Ok(())
}

/// The companion was clicked: bring the main window forward.
#[tauri::command]
pub fn mascot_raise(app: AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
    Ok(())
}

/// Watch the cursor and let it through the window everywhere except the solid
/// part. Started once, at setup; it costs one comparison every `POLL_MS`.
pub fn watch_cursor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut passing_through = true;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
            let Some(win) = app.get_webview_window(LABEL) else {
                continue;
            };
            if !win.is_visible().unwrap_or(false) {
                continue;
            }
            let inside = cursor_inside(&app, &win).unwrap_or(false);
            // Only speak to the window when the answer changes: setting this on
            // every tick is a system call 8 times a second for nothing.
            if inside == passing_through {
                passing_through = !inside;
                let _ = win.set_ignore_cursor_events(!inside);
                // And tell the page. It cannot work this out for itself: while
                // the window is passing the pointer through it receives no
                // events at all, so the crossing that matters — the one that
                // turns the pointer back on — never reaches it as `pointerenter`
                // unless the user happens to keep moving.
                let _ = win.emit("mascot-hover", inside);
            }
        }
    });
}

/// Is the OS cursor inside the window's solid rectangle?
fn cursor_inside(app: &AppHandle, win: &tauri::WebviewWindow) -> Option<bool> {
    let rect = (*app.state::<HitRect>().0.lock().unwrap())?;
    let cursor: PhysicalPosition<f64> = app.cursor_position().ok()?;
    let scale = win.scale_factor().ok()?;
    let origin = win.outer_position().ok()?.to_logical::<f64>(scale);
    let cursor = cursor.to_logical::<f64>(scale);
    let (rx, ry, rw, rh) = rect;
    let x = cursor.x - origin.x;
    let y = cursor.y - origin.y;
    Some(x >= rx && x <= rx + rw && y >= ry && y <= ry + rh)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_corner_stays_inside_its_display() {
        // A 1440x900 display whose top-left is not the origin — a second monitor
        // placed to the left is the case that catches a hard-coded 0,0.
        let area = (-1440.0, 0.0, 1440.0, 900.0);
        let size = (460.0, 330.0);
        for corner in ["bottom-right", "bottom-left", "top-right", "top-left"] {
            let (x, y) = place(corner, area, size);
            assert!(x >= area.0, "{corner}: off the left edge");
            assert!(
                x + size.0 <= area.0 + area.2,
                "{corner}: off the right edge"
            );
            assert!(y >= area.1, "{corner}: above the top edge");
            assert!(
                y + size.1 <= area.1 + area.3,
                "{corner}: below the bottom edge"
            );
        }
    }

    #[test]
    fn a_corner_puts_it_in_that_corner() {
        let area = (0.0, 0.0, 1000.0, 800.0);
        let size = (400.0, 300.0);
        assert_eq!(place("top-left", area, size), (MARGIN, MARGIN));
        assert_eq!(
            place("bottom-right", area, size),
            (1000.0 - 400.0 - MARGIN, 800.0 - 300.0 - MARGIN)
        );
        // Left corners share an x, top corners share a y — the two halves of the
        // name are read independently.
        assert_eq!(
            place("top-left", area, size).0,
            place("bottom-left", area, size).0
        );
        assert_eq!(
            place("top-left", area, size).1,
            place("top-right", area, size).1
        );
    }
}
