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

/// The directory we install the CLI into — chosen because it's already on PATH,
/// so the agent can run `reado` with no extra setup. On Windows that's
/// `%LOCALAPPDATA%\Microsoft\WindowsApps` (a user-writable dir on the default
/// PATH since Win10); elsewhere it's `~/.local/bin`. The old Windows target,
/// `~/.local/bin`, is NOT on PATH there — hence "installed but not found".
fn install_dir() -> Result<PathBuf> {
    #[cfg(windows)]
    let dir = {
        let local = std::env::var_os("LOCALAPPDATA")
            .ok_or_else(|| Error::Other("no LOCALAPPDATA directory".into()))?;
        PathBuf::from(local).join("Microsoft").join("WindowsApps")
    };
    #[cfg(not(windows))]
    let dir = {
        let home = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .ok_or_else(|| Error::Other("no HOME directory".into()))?;
        PathBuf::from(home).join(".local").join("bin")
    };
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
    install_dir()
        .map(|b| b.join(CLI_NAME).exists())
        .unwrap_or(false)
}
