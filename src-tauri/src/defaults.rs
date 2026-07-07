//! "Make Reado the default app for text files."
//!
//! Setting the OS default handler is platform-specific and only meaningful for a
//! bundled/installed app:
//! - **macOS**: Launch Services, per file-type UTI — a real one-click.
//! - **Windows**: the OS forbids silent default changes, so we open the
//!   "Default apps" settings page and let the user pick Reado.
//! - **Linux**: `xdg-mime default` per MIME type (best-effort).

use tauri::AppHandle;

/// Result of a "make default" request, so the UI can tell the user what happened.
#[derive(serde::Serialize)]
pub struct SetOutcome {
    /// "set" (applied directly), "settings" (opened the OS chooser), or "manual".
    pub kind: String,
    /// How many file types were actually set (macOS/Linux).
    pub count: u32,
}

#[tauri::command]
pub fn set_default_handler(app: AppHandle, exts: Vec<String>) -> Result<SetOutcome, String> {
    let _ = (&app, &exts);

    #[cfg(target_os = "macos")]
    {
        let bundle_id = app.config().identifier.clone();
        let count = macos::set_default(&exts, &bundle_id);
        return Ok(SetOutcome {
            kind: "set".into(),
            count,
        });
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:defaultapps"])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(SetOutcome {
            kind: "settings".into(),
            count: 0,
        });
    }

    #[cfg(target_os = "linux")]
    {
        let count = linux::set_default(&exts);
        return Ok(SetOutcome {
            kind: if count > 0 { "set" } else { "manual" }.into(),
            count,
        });
    }

    #[allow(unreachable_code)]
    Ok(SetOutcome {
        kind: "manual".into(),
        count: 0,
    })
}

#[cfg(target_os = "macos")]
mod macos {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
            bundle_id: CFStringRef,
        ) -> i32;
        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: CFStringRef,
            tag: CFStringRef,
            conforming_to: CFStringRef,
        ) -> CFStringRef;
    }

    /// kLSRolesAll — set Reado as handler for every role (viewer + editor).
    const K_LS_ROLES_ALL: u32 = 0xFFFF_FFFF;

    /// Set Reado (`bundle_id`) as the default handler for each extension's file
    /// type. Returns how many succeeded (types with no real UTI are skipped).
    pub fn set_default(exts: &[String], bundle_id: &str) -> u32 {
        let tag_class = CFString::new("public.filename-extension");
        let bundle = CFString::new(bundle_id);
        let mut count = 0;
        for ext in exts {
            let tag = CFString::new(ext);
            let uti_ref = unsafe {
                UTTypeCreatePreferredIdentifierForTag(
                    tag_class.as_concrete_TypeRef(),
                    tag.as_concrete_TypeRef(),
                    std::ptr::null(),
                )
            };
            if uti_ref.is_null() {
                continue;
            }
            // The Create* function returns a +1 reference we now own.
            let uti = unsafe { CFString::wrap_under_create_rule(uti_ref) };
            let status = unsafe {
                LSSetDefaultRoleHandlerForContentType(
                    uti.as_concrete_TypeRef(),
                    K_LS_ROLES_ALL,
                    bundle.as_concrete_TypeRef(),
                )
            };
            if status == 0 {
                count += 1;
            }
        }
        count
    }
}

#[cfg(target_os = "linux")]
mod linux {
    /// Best-effort: point a handful of common text MIME types at Reado's desktop
    /// entry via `xdg-mime`. Unknown/failed types are simply skipped.
    pub fn set_default(_exts: &[String]) -> u32 {
        const MIMES: &[&str] = &[
            "text/plain",
            "text/markdown",
            "text/x-markdown",
            "application/json",
            "application/x-yaml",
            "text/x-python",
            "text/x-shellscript",
            "text/csv",
            "text/html",
            "text/css",
            "application/javascript",
            "application/xml",
        ];
        let mut count = 0;
        for mime in MIMES {
            let ok = std::process::Command::new("xdg-mime")
                .args(["default", "Reado.desktop", mime])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if ok {
                count += 1;
            }
        }
        count
    }
}
