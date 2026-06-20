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
const SIDECAR_NAME: &str = if cfg!(windows) { "reado-cli.exe" } else { "reado-cli" };

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

/// The user's `~/.local/bin` (created if missing).
fn local_bin() -> Result<PathBuf> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or_else(|| Error::Other("no HOME directory".into()))?;
    let bin = PathBuf::from(home).join(".local").join("bin");
    std::fs::create_dir_all(&bin)?;
    Ok(bin)
}

/// Install (symlink on Unix, copy on Windows) the CLI and return its path.
#[tauri::command]
pub fn install_cli() -> Result<String> {
    let src = bundled_cli()?;
    let dst = local_bin()?.join(CLI_NAME);

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

    Ok(dst.to_string_lossy().into_owned())
}

/// Whether the CLI is already installed on the user's `~/.local/bin`.
#[tauri::command]
pub fn cli_installed() -> bool {
    local_bin().map(|b| b.join(CLI_NAME).exists()).unwrap_or(false)
}
