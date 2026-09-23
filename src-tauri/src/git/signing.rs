use super::{run_git, run_git_checked};
use std::path::Path;

/// Whether this repository signs what it commits (`commit.gpgsign`).
#[tauri::command]
pub fn git_signing(root: String) -> bool {
    run_git(Path::new(&root), &["config", "--get", "commit.gpgsign"])
        .map(|v| v.trim() == "true")
        .unwrap_or(false)
}

/// Whether this repository can actually sign, and what is missing when it
/// cannot.
///
/// Turning signing on writes two config keys and nothing else happens — until
/// the next commit, which git refuses with gpg's own error. That is the wrong
/// moment to find out, so the switch asks first. Returns an empty string when
/// signing is ready; otherwise a reason the UI translates.
///
/// The checks are the ones that are certain, never a guess: SSH signing cannot
/// work without an explicit key, GPG signing cannot work without gpg, and gpg
/// with neither a configured key nor a secret key for the committer's address
/// has nothing to sign with. Anything else is left alone — a false warning on a
/// working setup would teach the user to ignore the real one.
#[tauri::command]
pub fn git_signing_check(root: String) -> String {
    let path = Path::new(&root);
    let cfg = |key: &str| {
        run_git(path, &["config", "--get", key])
            .map(|v| v.trim().to_string())
            .unwrap_or_default()
    };
    let key = cfg("user.signingkey");
    if cfg("gpg.format") == "ssh" {
        return if key.is_empty() {
            "no-ssh-key".into()
        } else {
            String::new()
        };
    }
    if crate::proc::command("gpg")
        .arg("--version")
        .output()
        .map(|o| !o.status.success())
        .unwrap_or(true)
    {
        return "no-gpg".into();
    }
    if !key.is_empty() {
        return String::new();
    }
    // No key named: gpg may still hold one for the committer's address, which is
    // how an unconfigured-but-working setup signs.
    let email = cfg("user.email");
    if email.is_empty() {
        return "no-key".into();
    }
    let found = crate::proc::command("gpg")
        .args(["--list-secret-keys", "--batch", &email])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if found {
        String::new()
    } else {
        "no-key".into()
    }
}

/// Turn commit and tag signing on or off for this repository.
///
/// Written to git's own config rather than kept as a Reado setting: the key
/// already exists, every other git tool reads it, and a second source of truth
/// would be one that disagrees. Signing needs a configured key and an agent that
/// can unlock it — without them git refuses the commit and says so.
#[tauri::command]
pub fn git_set_signing(root: String, on: bool) -> Result<(), String> {
    let value = if on { "true" } else { "false" };
    run_git_checked(&root, &["config", "commit.gpgsign", value])?;
    run_git_checked(&root, &["config", "tag.gpgsign", value])
}
