//! Arguments a second launch hands to the running instance.
//!
//! The core consumes the ones that are existing files (it opens them). The rest
//! used to be dropped; now they go to handlers a build embedding Reado registered
//! (see `run_with`) — which is how a link the OS opened (`reado://…`) reaches the
//! code that understands it. With no handler registered they are dropped as before.

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use tauri::AppHandle;

type ArgHandler = Box<dyn Fn(&AppHandle, &[String]) + Send + Sync>;

fn handlers() -> &'static Mutex<Vec<ArgHandler>> {
    static HANDLERS: OnceLock<Mutex<Vec<ArgHandler>>> = OnceLock::new();
    HANDLERS.get_or_init(|| Mutex::new(Vec::new()))
}

/// Receive the arguments of a second launch that are not files to open.
/// Call it from the `extend` function given to `run_with`.
pub fn register_arg_handler(handler: impl Fn(&AppHandle, &[String]) + Send + Sync + 'static) {
    handlers()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .push(Box::new(handler));
}

/// Split a second launch's argv (program name already skipped) into files the
/// core opens and everything else.
pub(crate) fn split(args: &[String]) -> (Vec<PathBuf>, Vec<String>) {
    let mut files = Vec::new();
    let mut rest = Vec::new();
    for arg in args {
        let p = PathBuf::from(arg);
        if p.is_file() {
            files.push(p);
        } else {
            rest.push(arg.clone());
        }
    }
    (files, rest)
}

/// Hand the non-file arguments to every registered handler.
pub(crate) fn forward(app: &AppHandle, rest: &[String]) {
    if rest.is_empty() {
        return;
    }
    for handler in handlers().lock().unwrap_or_else(|e| e.into_inner()).iter() {
        handler(app, rest);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_are_kept_and_the_rest_is_forwarded() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "x").unwrap();
        let args = vec![
            file.to_string_lossy().into_owned(),
            "reado://auth/callback?code=1".to_string(),
            dir.path().to_string_lossy().into_owned(),
        ];
        let (files, rest) = split(&args);
        assert_eq!(files, vec![file]);
        // A directory is not a file to open: it is forwarded like any other argument.
        assert_eq!(rest, vec![args[1].clone(), args[2].clone()]);
    }

    #[test]
    fn nothing_to_split() {
        let (files, rest) = split(&[]);
        assert!(files.is_empty() && rest.is_empty());
    }
}
