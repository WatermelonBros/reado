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

/// The separator between PATH entries on this platform.
const PATH_SEP: char = if cfg!(windows) { ';' } else { ':' };

/// `CREATE_NO_WINDOW` — run the child with no console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The user's real PATH, from their login+interactive shell — the same env the
/// integrated terminal gets. A GUI app launched from the Finder/Dock inherits a
/// minimal PATH that misses brew/nvm/cargo/go dirs, so a directly-spawned `gh`,
/// `biome`, `rg`, … would not be found even though the terminal runs them fine.
/// Resolved once with a *raw* spawn (not `command()`, which injects this value —
/// that would recurse).
///
/// The CLI's install directory is prepended to whatever the shell reports. It is
/// `~/.local/bin` — on PATH by convention, not by guarantee — and when a profile
/// doesn't add it the bundled `reado` is installed and still unreachable, so the
/// MCP server the agent talks to never starts: the agent is told to call
/// `session_done` and has no such tool.
pub fn login_shell_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let dir = crate::cli::cli_dir().unwrap_or_default();
        with_dir(&shell_path(), &dir.to_string_lossy())
    })
}

/// Put `dir` at the front of `path`, unless it's already somewhere in it.
fn with_dir(path: &str, dir: &str) -> String {
    if dir.is_empty() || path.split(PATH_SEP).any(|p| p == dir) {
        path.to_string()
    } else if path.is_empty() {
        dir.to_string()
    } else {
        format!("{dir}{PATH_SEP}{path}")
    }
}

/// The PATH the user's own shell reports, before we add anything to it.
fn shell_path() -> String {
    {
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
    }
}

/// Whether `bin` resolves to a file in any directory of the login-shell PATH.
///
/// Uses [`login_shell_path`] (so brew/nvm/cargo dirs a Finder-launched GUI misses
/// are included), and on Windows tries each PATHEXT extension — a bare "gh" never
/// matches the real "gh.exe" otherwise. Shared so every "is X installed?" probe
/// agrees with what the integrated terminal can actually run.
pub fn on_path(bin: &str) -> bool {
    which(bin).is_some()
}

/// Where `bin` resolves on the login-shell PATH, if it does.
///
/// Same walk as [`on_path`], but the caller gets the path: choosing a language
/// server sometimes needs to look *at* the binary (a global TypeScript 7 has no
/// `tsserver.js` beside it, and so needs a different server than a TS 5 one).
pub fn which(bin: &str) -> Option<std::path::PathBuf> {
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
    login_shell_path().split(PATH_SEP).find_map(|dir| {
        if dir.is_empty() {
            return None;
        }
        exts.iter()
            .map(|ext| Path::new(dir).join(format!("{bin}{ext}")))
            .find(|p| p.is_file())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cli_dir_goes_in_front_once() {
        let sep = PATH_SEP;
        assert_eq!(
            with_dir(&format!("/usr/bin{sep}/bin"), "/home/u/.local/bin"),
            format!("/home/u/.local/bin{sep}/usr/bin{sep}/bin")
        );
        // Already there (anywhere): left alone, so we never grow a PATH per call.
        let have = format!("/usr/bin{sep}/home/u/.local/bin");
        assert_eq!(with_dir(&have, "/home/u/.local/bin"), have);
        // A near-miss is not a match.
        assert!(
            with_dir("/home/u/.local/bin2", "/home/u/.local/bin").starts_with("/home/u/.local/bin")
        );
        // Nothing to add, or nothing to add to.
        assert_eq!(with_dir("/usr/bin", ""), "/usr/bin");
        assert_eq!(with_dir("", "/home/u/.local/bin"), "/home/u/.local/bin");
    }
}
