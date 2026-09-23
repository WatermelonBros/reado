//! Browser-preview tools. Perception reads the console/network the desktop pane
//! mirrors to `.reado/`; live perception and drive go to the running pane over
//! the file control queue. Drive actions ship JS the pane runs via the CSP-immune
//! eval channel; navigation is allowlist-checked on the pane's side.

use reado_core as core;

use super::{internal, read_json_file, RpcError};

/// What a perception tool says when no preview is live.
const NO_PANE: &str = "No preview pane running — open the browser preview in Reado.";

/// A mirrored `.reado/` buffer. The mirror file's *presence* means a preview is
/// live (it's written every tick while agent access is on). An absent file → no
/// preview; a present `[]` → preview live but nothing captured yet.
pub(super) fn mirror(root: &str, file: &str) -> String {
    if !core::reado_dir(root).join(file).exists() {
        NO_PANE.to_string()
    } else {
        read_json_file(root, file)
    }
}

/// Only the console's error-level entries — what broke.
pub(super) fn errors(root: &str) -> Result<String, RpcError> {
    if !core::reado_dir(root)
        .join(core::PREVIEW_CONSOLE_FILE)
        .exists()
    {
        return Ok(NO_PANE.to_string());
    }
    let raw = read_json_file(root, core::PREVIEW_CONSOLE_FILE);
    let entries: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap_or_default();
    let errors: Vec<_> = entries
        .into_iter()
        .filter(|e| e.get("level").and_then(|l| l.as_str()) == Some("error"))
        .collect();
    if errors.is_empty() {
        Ok("No errors captured.".to_string())
    } else {
        serde_json::to_string_pretty(&errors).map_err(internal)
    }
}

/// Send a command to the running preview pane over the file queue and wait for its
/// result (the pane polls ~0.7s; we poll up to ~6s). No pane → timeout.
pub(super) fn send_command(root: &str, op: &str, arg: &str) -> Result<String, RpcError> {
    let dir = core::reado_dir(root);
    std::fs::create_dir_all(&dir).map_err(internal)?;
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
        .to_string();
    let cmd = serde_json::json!({ "id": id, "op": op, "arg": arg });
    core::atomic_write(
        &dir.join(core::PREVIEW_CMD_FILE),
        cmd.to_string().as_bytes(),
    )
    .map_err(internal)?;
    let result_path = dir.join(core::PREVIEW_RESULT_FILE);
    for _ in 0..60 {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let Ok(s) = std::fs::read_to_string(&result_path) else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) else {
            continue;
        };
        if v.get("id").and_then(|i| i.as_str()) != Some(id.as_str()) {
            continue;
        }
        let ok = v.get("ok").and_then(|o| o.as_bool()).unwrap_or(false);
        let res = v
            .get("result")
            .and_then(|r| r.as_str())
            .unwrap_or("")
            .to_string();
        return if ok { Ok(res) } else { Err(internal(res)) };
    }
    Err(internal(
        "no preview pane running (open the browser preview and enable agent access)",
    ))
}

/// JS-quote a string for safe embedding in an eval expression.
pub(super) fn jsq(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

// ---- The JS each drive/inspect tool evaluates in the page ----------------

pub(super) fn dom_js(selector: &str) -> String {
    format!(
        "(()=>{{const el=document.querySelector({s});if(!el)return null;const r=el.getBoundingClientRect();const c=getComputedStyle(el);return{{tag:el.tagName,html:el.outerHTML.slice(0,2000),rect:{{x:r.x,y:r.y,w:r.width,h:r.height}},display:c.display,color:c.color,background:c.backgroundColor,font:c.font}};}})()",
        s = jsq(selector)
    )
}

pub(super) fn animation_js(selector: &str) -> String {
    format!(
        "(()=>{{const el=document.querySelector({s});if(!el)return null;return el.getAnimations().map(a=>({{name:a.animationName,timing:a.effect.getComputedTiming(),keyframes:a.effect.getKeyframes()}}));}})()",
        s = jsq(selector)
    )
}

pub(super) fn click_js(selector: &str) -> String {
    format!(
        "(()=>{{const el=document.querySelector({s});if(!el)return'not found';el.scrollIntoView({{block:'center'}});el.click();return'clicked';}})()",
        s = jsq(selector)
    )
}

pub(super) fn hover_js(selector: &str) -> String {
    format!(
        "(()=>{{const el=document.querySelector({s});if(!el)return'not found';el.dispatchEvent(new MouseEvent('mouseover',{{bubbles:true}}));el.dispatchEvent(new MouseEvent('mouseenter',{{bubbles:true}}));return'hovered';}})()",
        s = jsq(selector)
    )
}

pub(super) fn type_js(selector: &str, text: &str) -> String {
    format!(
        "(()=>{{const el=document.querySelector({s});if(!el)return'not found';el.focus();el.value={t};el.dispatchEvent(new Event('input',{{bubbles:true}}));el.dispatchEvent(new Event('change',{{bubbles:true}}));return'typed';}})()",
        s = jsq(selector),
        t = jsq(text)
    )
}

pub(super) fn scroll_js(x: f64, y: f64) -> String {
    format!("(()=>{{window.scrollTo({x},{y});return'scrolled';}})()")
}
