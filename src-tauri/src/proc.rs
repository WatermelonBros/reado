//! Spawning child processes without flashing a console window on Windows.
//!
//! On Windows, `std::process::Command` for a console program (git, ripgrep, a
//! formatter, `taskkill`) pops a short-lived console window that steals focus.
//! `CREATE_NO_WINDOW` suppresses it. On other platforms these are plain spawns.

use std::ffi::OsStr;
use std::process::Command;

/// `CREATE_NO_WINDOW` — run the child with no console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Like `Command::new`, but never flashes a console window on Windows.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    no_window(&mut cmd);
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
