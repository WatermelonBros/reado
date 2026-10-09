//! Crash reports, off unless the person turns them on (Settings › System › Crash
//! reports), and possible only in an official build, which carries the error
//! tracker's address at compile time (`READO_ERRORS_DSN`, like `READO_API_URL`).
//! A build from source reports nothing, whatever the setting.
//!
//! Rust panics are caught by Sentry's panic hook; the webview's errors arrive through
//! `report_error`, because its content security policy keeps it from the network.
//! The switch is a flag file in the app's config dir, so it is read before anything
//! else at the next start, and applied to the running app at once.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, Runtime};

/// Where reports go: our own GlitchTip, speaking Sentry's protocol.
const DSN: Option<&str> = option_env!("READO_ERRORS_DSN");
const FLAG: &str = "crash-reports-enabled";

static CLIENT: Mutex<Option<sentry::ClientInitGuard>> = Mutex::new(None);

fn flag_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(FLAG))
}

/// Replaces the home directory in a report's text: a path under it names the person.
fn scrub(text: &str, home: &str) -> String {
    if home.len() > 1 {
        text.replace(home, "~")
    } else {
        text.to_string()
    }
}

fn start(version: String) {
    let Some(dsn) = DSN else { return };
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let mut options = sentry::ClientOptions::default();
    options.release = Some(version.into());
    options.send_default_pii = false;
    // Nothing that identifies the machine or the person.
    options.before_send = Some(Arc::new(move |mut event| {
        event.server_name = None;
        event.user = None;
        if let Some(message) = event.message.take() {
            event.message = Some(scrub(&message, &home));
        }
        for exception in event.exception.values.iter_mut() {
            if let Some(value) = exception.value.take() {
                exception.value = Some(scrub(&value, &home));
            }
        }
        Some(event)
    }));
    let guard = sentry::init((dsn, options));
    if let Ok(mut client) = CLIENT.lock() {
        *client = Some(guard);
    }
}

fn stop() {
    if let Ok(mut client) = CLIENT.lock() {
        // Dropping the guard flushes what is queued and closes the client.
        client.take();
    }
}

/// At startup: report only if the person said yes last time.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    if flag_path(app).is_some_and(|p| p.exists()) {
        start(app.package_info().version.to_string());
    }
}

/// Whether this build can report at all (an official build).
#[tauri::command]
pub fn crash_reports_available() -> bool {
    DSN.is_some()
}

/// Turns reports on or off, now and for the next starts.
#[tauri::command]
pub fn set_crash_reports<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<(), String> {
    let path = flag_path(&app).ok_or("no config directory")?;
    if enabled {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, b"").map_err(|e| e.to_string())?;
        let running = CLIENT.lock().map(|c| c.is_some()).unwrap_or(false);
        if !running {
            start(app.package_info().version.to_string());
        }
    } else {
        let _ = std::fs::remove_file(&path);
        stop();
    }
    Ok(())
}

/// An error the webview caught. Ignored when reports are off.
#[tauri::command]
pub fn report_error(message: String, stack: Option<String>, source: Option<String>) {
    let running = CLIENT.lock().map(|c| c.is_some()).unwrap_or(false);
    if !running {
        return;
    }
    sentry::with_scope(
        |scope| {
            scope.set_tag("side", "webview");
            if let Some(source) = &source {
                scope.set_tag("source", source);
            }
            if let Some(stack) = &stack {
                scope.set_extra("stack", stack.clone().into());
            }
        },
        || sentry::capture_message(&message, sentry::Level::Error),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_home_directory_is_taken_out_of_reports() {
        assert_eq!(
            scrub("cannot read /Users/ada/code/x.rs", "/Users/ada"),
            "cannot read ~/code/x.rs"
        );
        assert_eq!(scrub("no paths here", "/Users/ada"), "no paths here");
        assert_eq!(scrub("/", ""), "/");
    }
}
