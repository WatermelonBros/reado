//! Install the bundled `reado` CLI onto the user's PATH.
//!
//! The desktop app ships the `reado` binary as a Tauri sidecar (see
//! `bundle.externalBin`), placed next to the app executable at runtime. This
//! command links it into `~/.local/bin` (VS Code's "Install 'code' command"
//! pattern) so the agent the app launches can call `reado` from any project.

use std::path::PathBuf;

use crate::error::{Error, Result};

/// The installed CLI's file name (what ends up on the user's PATH).
const CLI_NAME: &str = if cfg!(windows) { "reado.exe" } else { "reado" };
/// The bundled sidecar's file name (can't match the Tauri package name).
const SIDECAR_NAME: &str = if cfg!(windows) {
    "reado-cli.exe"
} else {
    "reado-cli"
};

/// Locate the bundled CLI shipped beside the app executable.
fn bundled_cli() -> Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let dir = exe
        .parent()
        .ok_or_else(|| Error::Other("cannot locate the app directory".into()))?;
    let src = dir.join(SIDECAR_NAME);
    if src.exists() {
        Ok(src)
    } else {
        Err(Error::Other(
            "the bundled reado CLI was not found (is this a packaged build?)".into(),
        ))
    }
}

/// The directory we install the CLI into. On Windows that's
/// `%LOCALAPPDATA%\Microsoft\WindowsApps` (a user-writable dir on the default
/// PATH since Win10); elsewhere it's `~/.local/bin`. The old Windows target,
/// `~/.local/bin`, is NOT on PATH there — hence "installed but not found".
///
/// `~/.local/bin` is *conventionally* on PATH, not reliably: a profile that never
/// adds it leaves `reado` installed and unreachable — and the MCP server the agent
/// talks to never starts. `proc::login_shell_path` puts this directory on the PATH
/// of everything the app spawns so that hope isn't load-bearing.
pub fn cli_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    let dir = {
        let local = std::env::var_os("LOCALAPPDATA")?;
        PathBuf::from(local).join("Microsoft").join("WindowsApps")
    };
    #[cfg(not(windows))]
    let dir = {
        let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
        PathBuf::from(home).join(".local").join("bin")
    };
    Some(dir)
}

/// [`cli_dir`], created on demand — the form installing needs.
fn install_dir() -> Result<PathBuf> {
    let dir = cli_dir().ok_or_else(|| Error::Other("no HOME directory".into()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Install (symlink on Unix, copy on Windows) the CLI and return its path.
#[tauri::command]
pub fn install_cli() -> Result<String> {
    let src = bundled_cli()?;
    let dst = install_dir()?.join(CLI_NAME);

    #[cfg(unix)]
    {
        // Replace any prior link/file so re-running always points at this build.
        let _ = std::fs::remove_file(&dst);
        std::os::unix::fs::symlink(&src, &dst)?;
    }
    #[cfg(windows)]
    {
        std::fs::copy(&src, &dst)?;
    }

    crate::log::info(
        "cli",
        "installed",
        serde_json::json!({ "path": dst.to_string_lossy() }),
    );
    Ok(dst.to_string_lossy().into_owned())
}

/// Whether the CLI is already installed in our PATH-visible install dir.
#[tauri::command]
pub fn cli_installed() -> bool {
    cli_dir().is_some_and(|b| b.join(CLI_NAME).exists())
}
