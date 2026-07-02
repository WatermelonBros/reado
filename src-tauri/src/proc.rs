//! Spawning child processes: no console-window flash on Windows, and — crucially
//! — with the *login-shell* PATH so tools resolve the same way the integrated
//! terminal resolves them.
//!
//! On Windows, `std::process::Command` for a console program (git, ripgrep, a
//! formatter, `taskkill`) pops a short-lived console window that steals focus.
//! `CREATE_NO_WINDOW` suppresses it. On other platforms these are plain spawns.

use std::ffi::OsStr;
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;

/// `CREATE_NO_WINDOW` — run the child with no console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The user's real PATH, from their login+interactive shell — the same env the
/// integrated terminal gets. A GUI app launched from the Finder/Dock inherits a
/// minimal PATH that misses brew/nvm/cargo/go dirs, so a directly-spawned `gh`,
/// `biome`, `rg`, … would not be found even though the terminal runs them fine.
/// Resolved once with a *raw* spawn (not `command()`, which injects this value —
/// that would recurse).
pub fn login_shell_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        #[cfg(not(windows))]
        {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
            let mut cmd = Command::new(&shell);
            no_window(&mut cmd);
            if let Ok(out) = cmd.args(["-ilc", "echo $PATH"]).output() {
                if out.status.success() {
                    let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !p.is_empty() {
                        return p;
                    }
                }
            }
        }
        std::env::var("PATH").unwrap_or_default()
    })
}

/// Whether `bin` resolves to a file in any directory of the login-shell PATH.
///
/// Uses [`login_shell_path`] (so brew/nvm/cargo dirs a Finder-launched GUI misses
/// are included), and on Windows tries each PATHEXT extension — a bare "gh" never
/// matches the real "gh.exe" otherwise. Shared so every "is X installed?" probe
/// agrees with what the integrated terminal can actually run.
pub fn on_path(bin: &str) -> bool {
    let sep = if cfg!(windows) { ';' } else { ':' };
    let exts: Vec<String> = if cfg!(windows) {
        let raw = std::env::var("PATHEXT").unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".into());
        std::iter::once(String::new())
            .chain(
                raw.split(';')
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_ascii_lowercase()),
            )
            .collect()
    } else {
        vec![String::new()]
    };
    login_shell_path().split(sep).any(|dir| {
        !dir.is_empty()
            && exts
                .iter()
                .any(|ext| Path::new(dir).join(format!("{bin}{ext}")).is_file())
    })
}

/// Whether an AI agent binary (e.g. `claude`, `codex`, `copilot`) resolves on the
/// login-shell PATH — so the UI can gate AI actions instead of dispatching a
/// prompt into a bare shell when the agent isn't installed.
#[tauri::command]
pub fn agent_installed(bin: String) -> bool {
    on_path(&bin)
}

/// Like `Command::new`, but never flashes a console window on Windows AND runs
/// with the login-shell PATH (see [`login_shell_path`]) so brew/nvm/winget tools
/// resolve. Every external tool the app spawns should go through this.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    no_window(&mut cmd);
    cmd.env("PATH", login_shell_path());
    cmd
}

/// Apply the no-window flag to an existing command (Windows only; no-op elsewhere).
pub fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}
