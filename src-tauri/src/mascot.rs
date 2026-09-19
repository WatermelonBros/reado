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
//! - **Nothing tells us the displays changed.** A laptop plugged into an
//!   external screen resizes the work area under a window already placed against
//!   the old one, stranding the companion mid-screen. The same poll that watches
//!   the cursor compares the target work area against the one it last parked
//!   against, once a second, and puts it back.

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

/// What the companion was last told to be. Kept because the window has to be
/// put back on its own: a laptop plugged into a screen changes the work area
/// under a window that has already been placed, and nothing asks it to move.
#[derive(Default)]
pub struct Park(pub Mutex<ParkState>);

#[derive(Default)]
pub struct ParkState {
    corner: String,
    /// The character's height; the window is this plus the bubble's room.
    size: f64,
    /// The display the user picked, by name. Empty means "wherever the main
    /// window is" — which is what someone who never opened the setting means.
    monitor: String,
    /// The work area it is currently parked against. A display arriving,
    /// leaving or changing resolution *is* this value changing, so comparing it
    /// is the whole observer.
    area: Option<(f64, f64, f64, f64)>,
}

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

/// The work area the companion belongs in: the display the user named, or the
/// one the main window is on. The WORK AREA, not the monitor — the menu bar and
/// the Dock are not screen a companion may sit under, and using the full size
/// put the top corners behind the menu bar, where they are not corners at all.
fn target_area(app: &AppHandle, monitor: &str) -> Option<(f64, f64, f64, f64)> {
    let mon = app
        .available_monitors()
        .ok()
        .and_then(|all| {
            all.into_iter()
                .find(|m| m.name().is_some_and(|n| n == monitor))
        })
        .or_else(|| {
            app.get_webview_window("main")
                .and_then(|m| m.current_monitor().ok().flatten())
        })
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let scale = mon.scale_factor();
    let area = mon.work_area();
    let pos = area.position.to_logical::<f64>(scale);
    let size = area.size.to_logical::<f64>(scale);
    Some((pos.x, pos.y, size.width, size.height))
}

/// Size the window and put it in its corner of its display.
fn park(app: &AppHandle) {
    let Some(win) = app.get_webview_window(LABEL) else {
        return;
    };
    let park = app.state::<Park>();
    let mut st = park.0.lock().unwrap();
    let Some(area) = target_area(app, &st.monitor) else {
        return;
    };
    let size = (st.size + BUBBLE_W, st.size + BUBBLE_H);
    let _ = win.set_size(LogicalSize::new(size.0, size.1));
    let (x, y) = place(&st.corner, area, size);
    crate::log::info(
        "mascot",
        "parked",
        serde_json::json!({
            "corner": st.corner, "monitor": st.monitor, "x": x, "y": y,
            "work": [area.0, area.1, area.2, area.3],
            "window": [size.0, size.1],
        }),
    );
    let _ = win.set_position(LogicalPosition::new(x, y));
    st.area = Some(area);
}

/// The displays the companion can be sent to, by name.
#[tauri::command]
pub fn mascot_monitors(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(app
        .available_monitors()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter_map(|m| m.name().cloned())
        .collect())
}

/// Show the companion (creating it the first time) or hide it.
#[tauri::command]
pub fn mascot_show(
    app: AppHandle,
    show: bool,
    corner: String,
    size: f64,
    monitor: String,
) -> Result<(), String> {
    {
        let park = app.state::<Park>();
        let mut st = park.0.lock().unwrap();
        st.corner = corner;
        st.size = size;
        st.monitor = monitor;
        st.area = None;
    }
    if !show {
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.hide();
        }
        return Ok(());
    }

    if app.get_webview_window(LABEL).is_none() {
        WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html#mascot".into()))
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
            .map_err(|e| e.to_string())?;
    }
    park(&app);
    let win = app.get_webview_window(LABEL).ok_or("no mascot window")?;
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
        let mut ticks: u64 = 0;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
            let Some(win) = app.get_webview_window(LABEL) else {
                continue;
            };
            if !win.is_visible().unwrap_or(false) {
                continue;
            }
            // Once a second: has the display it is parked on changed shape? A
            // laptop plugged into an external screen resizes the work area under
            // a window that was placed against the old one, which is how the
            // companion ends up stranded mid-screen. Nothing tells us — so we
            // look.
            ticks += 1;
            if ticks.is_multiple_of(1000 / POLL_MS) {
                let (monitor, area) = {
                    let park = app.state::<Park>();
                    let st = park.0.lock().unwrap();
                    (st.monitor.clone(), st.area)
                };
                if target_area(&app, &monitor) != area {
                    park(&app);
                }
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
