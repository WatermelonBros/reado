//! Reado's logging engine.
//!
//! A self-contained, structured, rolling JSONL sink shared by the Rust backend
//! and the TS frontend. Each record is one line of JSON
//! (`{ts, level, target, msg, fields}`) so the file is both greppable and
//! machine-parseable. The backend owns the only writer; the frontend forwards
//! its records through the [`log_record`] command, so everything interleaves in
//! one file and redaction is enforced in a single place.
//!
//! Design notes (see `openspec/changes/add-logging-engine/design.md`):
//! - We roll on *size* and keep a bounded number of archives, which the
//!   `tracing-appender` time-based roller does not do natively, so the sink is
//!   hand-rolled for full control.
//! - Configuration is owned by the frontend (persisted in `localStorage`); the
//!   backend starts at a default level and the frontend pushes the user's
//!   choice via [`log_set_config`] on boot and on change.
//! - Every public entry point swallows its own errors: logging must never crash
//!   the app or surface across the command boundary.
//!
//! TODO(dev-phase): the instrumentation is deliberately verbose right now —
//! during active development we want a rich trail to debug from, so most
//! subsystems log at `info`/`debug` and the frontend traces every IPC call.
//! This is more than a shipped product should write by default. Before a stable
//! release, revisit: lower the default level (e.g. `warn`), demote chatty
//! events (IPC tracing, watcher file-changed, search) to `trace`, and consider
//! sampling/rate-limiting high-frequency targets. Kept loud on purpose for now.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};

use serde_json::{json, Map, Value};

/// Per-file size cap before the active log rolls to an archive.
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
/// How many rolled archives to retain (oldest beyond this are deleted).
const MAX_ARCHIVES: usize = 5;
/// Stable name of the active log file inside the app log directory.
const ACTIVE_FILE: &str = "reado.log";

// Severity as a single byte so the threshold can live in an `AtomicU8`.
// Lower value = more severe; `OFF` disables everything.
const LEVEL_OFF: u8 = 0;
const LEVEL_ERROR: u8 = 1;
const LEVEL_WARN: u8 = 2;
const LEVEL_INFO: u8 = 3;
const LEVEL_DEBUG: u8 = 4;
const LEVEL_TRACE: u8 = 5;

/// Field names whose values must never be written verbatim. Matched
/// case-insensitively against record field keys. Content-bearing keys are
/// replaced by a length summary; secret-bearing keys by a fixed placeholder.
const SECRET_KEYS: &[&str] = &[
    "token",
    "secret",
    "password",
    "passwd",
    "key",
    "private_key",
    "cert",
    "certificate",
    "tls",
    "bearer",
    "authorization",
    "fingerprint",
];
/// Field names that carry bulk content we summarise (by length) instead of log.
const CONTENT_KEYS: &[&str] = &["content", "text", "data", "body", "source"];

const REDACTED: &str = "<redacted>";

/// The single, process-wide sink. `None` until [`init`] runs.
static LOGGER: OnceLock<Logger> = OnceLock::new();

struct Logger {
    /// Active severity threshold (records at or above this are written).
    threshold: AtomicU8,
    /// Master on/off switch, independent of the threshold.
    enabled: AtomicBool,
    /// Guards the file handle and rotation state.
    sink: Mutex<Sink>,
    /// User home directory, used to shorten absolute paths to `~/…`.
    home: Option<PathBuf>,
}

struct Sink {
    dir: PathBuf,
    path: PathBuf,
    /// Lazily (re)opened on write; `None` after a rotation or open failure.
    file: Option<File>,
}

/// Initialise the engine: create the log directory, open the active file, and
/// install the global logger. Returns the resolved active-file path (for the
/// startup banner and the `log_path` command). Idempotent — a second call is a
/// no-op and returns the already-resolved path.
pub fn init(log_dir: PathBuf, home: Option<PathBuf>) -> PathBuf {
    if let Some(existing) = LOGGER.get() {
        if let Ok(sink) = existing.sink.lock() {
            return sink.path.clone();
        }
    }
    let _ = fs::create_dir_all(&log_dir);
    restrict_dir(&log_dir);
    let path = log_dir.join(ACTIVE_FILE);
    let file = open_append(&path).ok();
    // Read the persisted preference up front so a user who turned logging off
    // (or down) in a previous session is honoured *before* the first startup
    // write — the frontend re-pushes the same value later via `log_set_config`.
    let (enabled, threshold) = read_persisted_config(&log_dir);
    let logger = Logger {
        threshold: AtomicU8::new(threshold),
        enabled: AtomicBool::new(enabled),
        sink: Mutex::new(Sink {
            dir: log_dir,
            path: path.clone(),
            file,
        }),
        home,
    };
    // If another thread won the race, fall back to its path.
    let _ = LOGGER.set(logger);
    LOGGER
        .get()
        .and_then(|l| l.sink.lock().ok().map(|s| s.path.clone()))
        .unwrap_or(path)
}

/// Name of the tiny backend-readable config mirror (sits next to the logs).
const CONFIG_FILE: &str = "log-config.json";

/// On Unix, make the log directory private (0700) so a fallback location can't
/// expose one user's diagnostics to other local users. No-op elsewhere.
fn restrict_dir(dir: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o700));
    }
    #[cfg(not(unix))]
    {
        let _ = dir;
    }
}

/// Read `{enabled, level}` persisted beside the logs. Defaults to enabled/`info`
/// when the file is missing or unreadable.
fn read_persisted_config(dir: &Path) -> (bool, u8) {
    let default = (true, LEVEL_INFO);
    let Ok(text) = fs::read_to_string(dir.join(CONFIG_FILE)) else {
        return default;
    };
    let Ok(v) = serde_json::from_str::<Value>(&text) else {
        return default;
    };
    let enabled = v.get("enabled").and_then(Value::as_bool).unwrap_or(true);
    let level = v
        .get("level")
        .and_then(Value::as_str)
        .map(level_from_str)
        .unwrap_or(LEVEL_INFO);
    (enabled, level)
}

/// Persist `{enabled, level}` beside the logs so the next launch can honour it
/// before the frontend has a chance to push the setting.
fn write_persisted_config(enabled: bool, level: u8) {
    if let Some(dir) = LOGGER
        .get()
        .and_then(|l| l.sink.lock().ok().map(|s| s.dir.clone()))
    {
        write_persisted_config_to(&dir, enabled, level);
    }
}

/// Persist the config into a specific directory. Split out from
/// `write_persisted_config` so tests can round-trip through a private tempdir
/// instead of the global logger's shared file (which parallel tests race on).
fn write_persisted_config_to(dir: &Path, enabled: bool, level: u8) {
    let body = json!({ "enabled": enabled, "level": level_name(level) });
    if let Ok(text) = serde_json::to_string(&body) {
        let _ = fs::write(dir.join(CONFIG_FILE), text);
    }
}

/// Resolved absolute path of the active log file, if the engine is initialised.
pub fn current_path() -> Option<String> {
    LOGGER
        .get()
        .and_then(|l| l.sink.lock().ok())
        .map(|s| s.path.to_string_lossy().into_owned())
}

/// Update the severity threshold at runtime.
pub fn set_level(level: u8) {
    if let Some(l) = LOGGER.get() {
        l.threshold.store(level, Ordering::Relaxed);
    }
}

/// Enable or disable all writing at runtime.
pub fn set_enabled(enabled: bool) {
    if let Some(l) = LOGGER.get() {
        l.enabled.store(enabled, Ordering::Relaxed);
    }
}

/// Map a level name to its byte. Unknown names clamp to `info`.
fn level_from_str(name: &str) -> u8 {
    match name.to_ascii_lowercase().as_str() {
        "off" => LEVEL_OFF,
        "error" => LEVEL_ERROR,
        "warn" | "warning" => LEVEL_WARN,
        "info" => LEVEL_INFO,
        "debug" => LEVEL_DEBUG,
        "trace" => LEVEL_TRACE,
        _ => LEVEL_INFO,
    }
}

fn level_name(level: u8) -> &'static str {
    match level {
        LEVEL_OFF => "off",
        LEVEL_ERROR => "error",
        LEVEL_WARN => "warn",
        LEVEL_INFO => "info",
        LEVEL_DEBUG => "debug",
        _ => "trace",
    }
}

/// Core entry point. Builds, redacts, serialises and writes one record. Never
/// panics or returns an error: logging failures are swallowed so callers are
/// unaffected.
fn write(level: u8, target: &str, msg: &str, fields: Value) {
    let Some(logger) = LOGGER.get() else { return };
    if !logger.enabled.load(Ordering::Relaxed) {
        return;
    }
    if level > logger.threshold.load(Ordering::Relaxed) || level == LEVEL_OFF {
        return;
    }

    let mut record = Map::new();
    record.insert(
        "ts".into(),
        json!(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
    );
    record.insert("level".into(), json!(level_name(level)));
    record.insert("target".into(), json!(target));
    // `msg` is free-form and routinely embeds absolute paths (e.g. an OS or git
    // error string), so scrub it too — not just the structured fields.
    record.insert("msg".into(), json!(scrub(msg, logger.home.as_deref())));
    let redacted = redact(fields, logger.home.as_deref());
    if !redacted.is_null() {
        record.insert("fields".into(), redacted);
    }

    // Serialise to a single line; escape any stray newlines defensively so one
    // record can never span lines and break framing.
    let Ok(mut line) = serde_json::to_string(&Value::Object(record)) else {
        return;
    };
    line = line.replace('\n', "\\n");
    line.push('\n');

    if let Ok(mut sink) = logger.sink.lock() {
        sink.append(line.as_bytes());
    }
}

impl Sink {
    /// Append bytes to the active file, rolling first if it would exceed the
    /// size cap. All IO errors are swallowed.
    fn append(&mut self, bytes: &[u8]) {
        if self.file.is_none() {
            self.file = open_append(&self.path).ok();
        }
        let over_cap = self
            .file
            .as_ref()
            .and_then(|f| f.metadata().ok())
            .map(|m| m.len() + bytes.len() as u64 > MAX_FILE_BYTES)
            .unwrap_or(false);
        if over_cap {
            self.roll();
        }
        if let Some(file) = self.file.as_mut() {
            // Best-effort: a failed write drops the record but never the app.
            let _ = file.write_all(bytes);
            let _ = file.flush();
        }
    }

    /// Rotate `reado.log` → `reado.log.1`, shifting older archives up and
    /// dropping anything beyond [`MAX_ARCHIVES`], then reopen a fresh active
    /// file.
    fn roll(&mut self) {
        self.file = None; // release the handle before renaming
                          // Delete the oldest, then shift each archive up by one.
        let oldest = self.archive_path(MAX_ARCHIVES);
        let _ = fs::remove_file(&oldest);
        for i in (1..MAX_ARCHIVES).rev() {
            let from = self.archive_path(i);
            let to = self.archive_path(i + 1);
            if from.exists() {
                let _ = fs::rename(&from, &to);
            }
        }
        let _ = fs::rename(&self.path, self.archive_path(1));
        self.file = open_append(&self.path).ok();
    }

    fn archive_path(&self, n: usize) -> PathBuf {
        self.dir.join(format!("{ACTIVE_FILE}.{n}"))
    }
}

fn open_append(path: &Path) -> std::io::Result<File> {
    OpenOptions::new().create(true).append(true).open(path)
}

/// Recursively redact a fields value before it is written:
/// - secret-named keys → `<redacted>`
/// - content-named keys → a `{ "_len": N }` summary (string len / array len)
/// - the home dir anywhere inside a string value → `~`
fn redact(value: Value, home: Option<&Path>) -> Value {
    match value {
        Value::Object(map) => {
            let mut out = Map::with_capacity(map.len());
            for (k, v) in map {
                let lower = k.to_ascii_lowercase();
                if SECRET_KEYS.iter().any(|s| lower.contains(s)) {
                    out.insert(k, json!(REDACTED));
                } else if CONTENT_KEYS.iter().any(|c| lower == *c) {
                    out.insert(k, summarise_len(&v));
                } else {
                    out.insert(k, redact(v, home));
                }
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.into_iter().map(|v| redact(v, home)).collect()),
        Value::String(s) => Value::String(scrub(&s, home)),
        other => other,
    }
}

/// Replace a content value with a compact length summary.
fn summarise_len(value: &Value) -> Value {
    match value {
        Value::String(s) => json!({ "_len": s.len() }),
        Value::Array(a) => json!({ "_len": a.len() }),
        _ => json!(REDACTED),
    }
}

/// Rewrite every occurrence of the user's home directory in `s` as `~`,
/// wherever it appears — not just at the start. A match only counts when the
/// home prefix ends on a path-separator boundary (or the end of the match), so
/// a sibling like `/home/alice2/...` is left intact and the home dir itself
/// maps to `~`. Scrubbing mid-string catches absolute paths embedded inside a
/// larger value (e.g. `"fatal: /home/alice/x not found"`), which a prefix-only
/// check would leak into a file users are meant to share with us.
fn scrub(s: &str, home: Option<&Path>) -> String {
    let Some(home) = home else {
        return s.to_string();
    };
    let home = home.to_string_lossy();
    if home.is_empty() || !s.contains(home.as_ref()) {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(idx) = rest.find(home.as_ref()) {
        let after = &rest[idx + home.len()..];
        out.push_str(&rest[..idx]);
        // Only collapse to `~` when the home prefix ends on a separator (or the
        // string ends): a textual sibling like `/home/alice2` must stay intact.
        if after.is_empty() || after.starts_with(['/', '\\']) {
            out.push('~');
        } else {
            out.push_str(&home);
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

// --- Public logging helpers ------------------------------------------------
//
// Backend modules call these with a `target` naming the subsystem (e.g.
// `"git"`, `"pty"`) and an optional `fields` object built with `json!`.

pub fn error(target: &str, msg: &str, fields: Value) {
    write(LEVEL_ERROR, target, msg, fields);
}
pub fn warn(target: &str, msg: &str, fields: Value) {
    write(LEVEL_WARN, target, msg, fields);
}
pub fn info(target: &str, msg: &str, fields: Value) {
    write(LEVEL_INFO, target, msg, fields);
}
pub fn debug(target: &str, msg: &str, fields: Value) {
    write(LEVEL_DEBUG, target, msg, fields);
}
#[allow(dead_code)]
pub fn trace(target: &str, msg: &str, fields: Value) {
    write(LEVEL_TRACE, target, msg, fields);
}

// --- Tauri commands --------------------------------------------------------

/// Persist a log record originating in the frontend. The level is clamped to a
/// valid value, the target is namespaced with `ui:`, and the fields go through
/// the same redaction as backend records.
#[tauri::command]
pub fn log_record(level: String, target: String, msg: String, fields: Option<Value>) {
    let lvl = level_from_str(&level);
    let target = format!("ui:{target}");
    write(lvl, &target, &msg, fields.unwrap_or(Value::Null));
}

/// Absolute path of the active log file, for "copy path" / settings display.
#[tauri::command]
pub fn log_path() -> Option<String> {
    current_path()
}

/// Apply the user's persisted logging preferences (called by the frontend on
/// boot and whenever the setting changes).
#[tauri::command]
pub fn log_set_config(enabled: bool, level: String) {
    let lvl = level_from_str(&level);
    set_enabled(enabled);
    set_level(lvl);
    // Mirror to disk so the next launch honours this choice before the frontend
    // re-pushes it (see `read_persisted_config`).
    write_persisted_config(enabled, lvl);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_keys_are_redacted() {
        let out = redact(
            json!({ "token": "abc", "nested": { "api_key": "xyz" } }),
            None,
        );
        assert_eq!(out["token"], json!(REDACTED));
        assert_eq!(out["nested"]["api_key"], json!(REDACTED));
    }

    #[test]
    fn content_is_summarised_not_logged() {
        let out = redact(json!({ "content": "hello world" }), None);
        assert_eq!(out["content"], json!({ "_len": 11 }));
    }

    #[test]
    fn home_prefix_is_shortened() {
        let home = PathBuf::from("/home/alice");
        let out = redact(json!({ "path": "/home/alice/project/x.rs" }), Some(&home));
        assert_eq!(out["path"], json!("~/project/x.rs"));
    }

    #[test]
    fn sibling_of_home_is_not_shortened() {
        let home = PathBuf::from("/home/alice");
        // A textual-prefix sibling must be left intact (boundary check).
        let out = redact(json!({ "path": "/home/alice2/x.rs" }), Some(&home));
        assert_eq!(out["path"], json!("/home/alice2/x.rs"));
        // The home dir itself maps to "~".
        let out = redact(json!({ "path": "/home/alice" }), Some(&home));
        assert_eq!(out["path"], json!("~"));
    }

    #[test]
    fn home_is_scrubbed_mid_string() {
        let home = PathBuf::from("/home/alice");
        // An absolute path embedded inside a larger error string is rewritten,
        // and a sibling sharing the textual prefix is left intact.
        let out = redact(
            json!({ "error": "fatal: /home/alice/x not found; tried /home/alice2/y" }),
            Some(&home),
        );
        assert_eq!(
            out["error"],
            json!("fatal: ~/x not found; tried /home/alice2/y")
        );
    }

    #[test]
    fn scrub_handles_prefix_mid_string_and_repeats() {
        let home = PathBuf::from("/home/alice");
        // Prefix, bare home dir, repeated occurrence, and a textual sibling.
        assert_eq!(scrub("/home/alice/x", Some(&home)), "~/x");
        assert_eq!(scrub("/home/alice", Some(&home)), "~");
        assert_eq!(
            scrub("a /home/alice/x b /home/alice/y", Some(&home)),
            "a ~/x b ~/y"
        );
        assert_eq!(scrub("/home/alice2/x", Some(&home)), "/home/alice2/x");
        // No home configured → returned unchanged.
        assert_eq!(scrub("/home/alice/x", None), "/home/alice/x");
    }

    #[test]
    fn unknown_level_clamps_to_info() {
        assert_eq!(level_from_str("verbose"), LEVEL_INFO);
        assert_eq!(level_from_str("ERROR"), LEVEL_ERROR);
        assert_eq!(level_from_str("warning"), LEVEL_WARN);
    }

    #[test]
    fn record_is_single_line_json() {
        // CONSTRAINT: `init` installs a *process-global* logger through a
        // `OnceLock`, so the first test in the run to call it wins and every
        // later call is a no-op that returns the original path. That makes the
        // active file's location order-dependent across tests: do NOT assume the
        // write lands in *our* tempdir. Instead read back from the path `init`
        // actually resolved to (its return value), which keeps this test correct
        // regardless of which test initialised the global logger first.
        //
        // The default level/enabled loaded at first init are `info`/enabled (no
        // persisted config yet), so a LEVEL_INFO record is always written; the
        // config round-trip test only writes the config *file* and never mutates
        // the runtime level/enabled, so it can't suppress this write either.
        let dir = tempfile::tempdir().unwrap();
        let path = init(dir.path().to_path_buf(), None);
        write(LEVEL_INFO, "test", "line one\nline two", json!({ "n": 1 }));
        let contents = fs::read_to_string(&path).unwrap();
        // The record must be exactly one line even though the msg had a newline.
        let last = contents.lines().next_back().unwrap();
        let parsed: Value = serde_json::from_str(last).unwrap();
        assert_eq!(parsed["level"], json!("info"));
        assert_eq!(parsed["target"], json!("test"));
        assert_eq!(parsed["fields"]["n"], json!(1));
        // The msg's embedded newline is preserved *inside* the JSON string (real
        // '\n' after parsing) yet the record still occupies a single physical
        // line — that is the framing guarantee this test exists to protect.
        assert!(parsed["msg"].as_str().unwrap().contains('\n'));
    }

    #[test]
    fn roll_shifts_archives_and_caps_at_max() {
        // Exercises `Sink::roll` directly (the reason the sink is hand-rolled and
        // otherwise untested). A fresh `Sink` over a tempdir is rolled more times
        // than we keep archives, tagging each active file so both the shift order
        // (newest → .1) and the cap (nothing past MAX_ARCHIVES) can be asserted.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(ACTIVE_FILE);
        let mut sink = Sink {
            dir: dir.path().to_path_buf(),
            path: path.clone(),
            file: open_append(&path).ok(),
        };

        let rolls = MAX_ARCHIVES + 2;
        for gen in 0..rolls {
            sink.append(format!("gen {gen}\n").as_bytes());
            sink.roll();
        }

        // Exactly MAX_ARCHIVES archives survive; older ones were deleted.
        for n in 1..=MAX_ARCHIVES {
            assert!(sink.archive_path(n).exists(), "archive .{n} should exist");
        }
        assert!(
            !sink.archive_path(MAX_ARCHIVES + 1).exists(),
            "nothing past MAX_ARCHIVES may be kept"
        );

        // Shift order: .1 holds the most recent generation, .2 the one before it.
        let last = rolls - 1;
        let a1 = fs::read_to_string(sink.archive_path(1)).unwrap();
        let a2 = fs::read_to_string(sink.archive_path(2)).unwrap();
        assert!(a1.contains(&format!("gen {last}")), ".1 must be newest");
        assert!(
            a2.contains(&format!("gen {}", last - 1)),
            ".2 must be second-newest"
        );

        // The active file was reopened fresh (empty) after the final roll.
        assert_eq!(fs::read_to_string(&path).unwrap(), "");
    }

    #[test]
    fn persisted_config_round_trips() {
        // Round-trip through the real serialize/parse pair against a *private*
        // tempdir. The public `write_persisted_config` targets the global logger's
        // shared config file, which parallel tests race on (the flake that failed
        // CI); using the dir-taking core keeps this test isolated and independent
        // of the OnceLock logger.
        let dir = tempfile::tempdir().unwrap();

        write_persisted_config_to(dir.path(), false, LEVEL_DEBUG);
        let (enabled, level) = read_persisted_config(dir.path());
        assert!(!enabled);
        assert_eq!(level, LEVEL_DEBUG);

        // A different pairing proves the mapping isn't hard-coded.
        write_persisted_config_to(dir.path(), true, LEVEL_WARN);
        let (enabled, level) = read_persisted_config(dir.path());
        assert!(enabled);
        assert_eq!(level, LEVEL_WARN);
    }
}
