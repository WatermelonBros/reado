//! In-app browser preview.
//!
//! A second webview hosted **in the main window** (Tauri multiwebview, behind the
//! `unstable` feature) that loads a user-set URL — typically a local dev server.
//! Reado's own UI reserves the right-hand region and reports its pixel bounds; we
//! park the preview webview there and keep it in sync as the layout changes.
//!
//! The previewed page is an **external** URL, so Tauri injects no IPC into it — it
//! is isolated from the app by default. Perception/drive of the page (console,
//! DOM, input) will be layered on later via `eval` + a scoped data-back channel;
//! this module is just the pane's lifecycle and placement.

use tauri::{
    Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Window,
};

/// Capture bridge, injected before every page load (runs in the isolated page).
/// It buffers `console.*`, uncaught errors/rejections, and `fetch`/`XHR` activity
/// into `window.__readoBridge`; Rust drains it with `eval_with_callback`. This is
/// the CSP-immune data path — it never phones home over the network.
const BRIDGE: &str = r#"(function(){
  if (window.__readoBridge) return;
  var B = window.__readoBridge = { logs: [], net: [], _id: 0 };
  // Console is drained (cleared each poll); network is a persistent snapshot so
  // request/response bodies (which resolve async) can fill in and be inspected.
  B.drain = function(){ var l=B.logs, ip=B.inspectPath; B.logs=[]; B.inspectPath=null; return {logs:l, net:B.net.slice(-300), inspect:ip}; };
  B.clear = function(){ B.logs=[]; B.net=[]; };
  // Elements highlight: draw an overlay over the element at the given child-index
  // path (from documentElement), like Chrome's hover highlight.
  B.hi = function(idxs){ var el=document.documentElement; for(var i=0;i<idxs.length;i++){ el=el&&el.children[idxs[i]]; } var o=document.getElementById('__readoHi'); if(!el){ if(o)o.style.display='none'; return; } var r=el.getBoundingClientRect(); if(!o){ o=document.createElement('div'); o.id='__readoHi'; o.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;background:rgba(90,150,255,0.22);outline:1px solid rgba(90,150,255,0.9);transition:all .05s;'; (document.body||document.documentElement).appendChild(o); } o.style.display='block'; o.style.left=r.left+'px'; o.style.top=r.top+'px'; o.style.width=r.width+'px'; o.style.height=r.height+'px'; };
  B.unhi = function(){ var o=document.getElementById('__readoHi'); if(o) o.style.display='none'; };
  function pathOf(el){ var path=[]; while(el && el!==document.documentElement){ var p=el.parentNode; if(!p||!p.children) break; path.unshift([].indexOf.call(p.children, el)); el=p; } return path; }
  // Pick mode: hover the page to highlight, click to select the node in Reado's tree.
  B.setPick = function(on){ B.pick=!!on; if(!on) B.unhi(); };
  document.addEventListener('mousemove', function(e){ if(B.pick) B.hi(pathOf(e.target)); }, true);
  document.addEventListener('click', function(e){ if(!B.pick) return; e.preventDefault(); e.stopPropagation(); B.inspectPath=pathOf(e.target); B.pick=false; B.unhi(); }, true);
  // Right-click → a custom menu (Reload / Copy / Paste / Inspect) instead of the
  // native one, so Inspect opens Reado's own inspector rather than a foreign devtool.
  var menuEl=null;
  function closeMenu(){ if(menuEl){ menuEl.remove(); menuEl=null; document.removeEventListener('mousedown', onDoc, true); } }
  function onDoc(e){ if(menuEl && !menuEl.contains(e.target)) closeMenu(); }
  function showMenu(x, y, path){
    closeMenu();
    menuEl=document.createElement('div');
    menuEl.style.cssText='position:fixed;z-index:2147483647;left:'+x+'px;top:'+y+'px;min-width:150px;background:#20242e;color:#cbd0d9;border:1px solid #333a47;border-radius:7px;padding:4px;font:13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)';
    var items=[
      ['Reload', function(){ location.reload(); }],
      ['Copy', function(){ try{ document.execCommand('copy'); }catch(e){} }],
      ['Paste', function(){ try{ navigator.clipboard.readText().then(function(t){ var el=document.activeElement; if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA')){ var s=el.selectionStart||0, en=el.selectionEnd||0; el.value=el.value.slice(0,s)+t+el.value.slice(en); el.setSelectionRange(s+t.length,s+t.length); el.dispatchEvent(new Event('input',{bubbles:true})); } else { document.execCommand('insertText', false, t); } }); }catch(e){} }],
      ['Inspect', function(){ B.inspectPath=path; }]
    ];
    items.forEach(function(it){ var d=document.createElement('div'); d.textContent=it[0]; d.style.cssText='padding:5px 10px;border-radius:4px;cursor:default'; d.onmouseenter=function(){ d.style.background='#2c3340'; }; d.onmouseleave=function(){ d.style.background=''; }; d.onmousedown=function(ev){ ev.preventDefault(); closeMenu(); it[1](); }; menuEl.appendChild(d); });
    (document.body||document.documentElement).appendChild(menuEl);
    var r=menuEl.getBoundingClientRect(); if(r.right>innerWidth) menuEl.style.left=(x-r.width)+'px'; if(r.bottom>innerHeight) menuEl.style.top=(y-r.height)+'px';
    setTimeout(function(){ document.addEventListener('mousedown', onDoc, true); }, 0);
  }
  document.addEventListener('contextmenu', function(e){ try{ e.preventDefault(); showMenu(e.clientX, e.clientY, pathOf(e.target)); }catch(err){} }, true);
  function ser(args){ try { return args.map(function(x){ return (x&&typeof x==='object')? JSON.parse(JSON.stringify(x)) : x; }); } catch(e){ return args.map(String); } }
  function cap(s, n){ return (typeof s==='string' && s.length>n) ? s.slice(0,n) : s; }
  function hobj(h){ var o={}; try { new Headers(h||{}).forEach(function(v,k){ o[k]=v; }); } catch(e){} return o; }
  function push(rec){ B.net.push(rec); if (B.net.length>400) B.net.shift(); }
  ['log','info','warn','error','debug'].forEach(function(lvl){
    var orig = console[lvl] ? console[lvl].bind(console) : function(){};
    console[lvl] = function(){ try { B.logs.push({level:lvl, args:ser([].slice.call(arguments)), t:Date.now()}); } catch(e){} return orig.apply(null, arguments); };
  });
  window.addEventListener('error', function(e){ B.logs.push({level:'error', args:[String(e.message)], source:(e.filename||'')+':'+(e.lineno||0), stack:(e.error&&e.error.stack)||null, t:Date.now()}); });
  window.addEventListener('unhandledrejection', function(e){ var r=e.reason; B.logs.push({level:'error', args:['Unhandled rejection: '+((r&&r.message)||String(r))], stack:(r&&r.stack)||null, t:Date.now()}); });
  var of = window.fetch;
  if (of) window.fetch = function(){
    var a=arguments, req=a[0], init=a[1]||{}, url=(req&&req.url)||String(req), m=(init.method)||(req&&req.method)||'GET', t0=Date.now();
    var rec={id:++B._id, method:m, url:url, t:t0, reqHeaders:hobj(init.headers||(req&&req.headers)), reqBody:cap(typeof init.body==='string'?init.body:undefined, 5000)};
    push(rec);
    return of.apply(this, a).then(function(res){
      rec.status=res.status; rec.ok=res.ok; rec.ms=Date.now()-t0; rec.resHeaders={};
      try{ res.headers.forEach(function(v,k){ rec.resHeaders[k]=v; }); }catch(e){}
      try{ res.clone().text().then(function(tx){ rec.resBody=cap(tx,20000); }).catch(function(){}); }catch(e){}
      return res;
    }, function(err){ rec.status=0; rec.ok=false; rec.error=String(err); rec.ms=Date.now()-t0; throw err; });
  };
  var OpenX = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
  var SetH = window.XMLHttpRequest && window.XMLHttpRequest.prototype.setRequestHeader;
  if (OpenX) {
    window.XMLHttpRequest.prototype.open = function(m, url){ this.__reado={method:m, url:url, reqHeaders:{}, t:Date.now()}; var self=this; this.addEventListener('loadend', function(){ var r=self.__reado||{}; var resH={}; try{ (self.getAllResponseHeaders()||'').trim().split(/\r?\n/).forEach(function(l){ var i=l.indexOf(':'); if(i>0) resH[l.slice(0,i).trim()]=l.slice(i+1).trim(); }); }catch(e){} push({id:++B._id, method:r.method, url:r.url, status:self.status, ok:self.status>=200&&self.status<400, t:r.t, ms:Date.now()-(r.t||Date.now()), reqHeaders:r.reqHeaders, reqBody:cap(r.reqBody,5000), resHeaders:resH, resBody:cap(typeof self.responseText==='string'?self.responseText:undefined, 20000)}); }); return OpenX.apply(this, arguments); };
    if (SetH) window.XMLHttpRequest.prototype.setRequestHeader = function(k,v){ try{ if(this.__reado) this.__reado.reqHeaders[k]=v; }catch(e){} return SetH.apply(this, arguments); };
    var SendX = window.XMLHttpRequest.prototype.send;
    if (SendX) window.XMLHttpRequest.prototype.send = function(body){ try{ if(this.__reado && typeof body==='string') this.__reado.reqBody=body; }catch(e){} return SendX.apply(this, arguments); };
  }
  var OWS = window.WebSocket;
  if (OWS) { var W = function(url, protocols){ var ws = protocols!==undefined ? new OWS(url, protocols) : new OWS(url); var rec={id:++B._id, method:'WS', url:String(url), status:101, ok:true, t:Date.now(), frames:0}; push(rec); ws.addEventListener('message', function(){ rec.frames++; }); ws.addEventListener('close', function(){ rec.ms=Date.now()-rec.t; }); ws.addEventListener('error', function(){ rec.ok=false; rec.error='ws error'; }); return ws; }; W.prototype=OWS.prototype; W.CONNECTING=0; W.OPEN=1; W.CLOSING=2; W.CLOSED=3; window.WebSocket=W; }
})();"#;

/// The preview webview's label is derived from its host window, so each project
/// window owns exactly one preview and they never collide.
fn preview_label<R: Runtime>(window: &Window<R>) -> String {
    format!("preview::{}", window.label())
}

/// The preview is a **borderless child window** parented to the host window (not a
/// sub-webview), so it manages its own cursor and never fights the main webview's
/// tracking areas — which was the source of the cursor flicker.
fn find_preview<R: Runtime>(window: &Window<R>) -> Option<WebviewWindow<R>> {
    window
        .app_handle()
        .get_webview_window(&preview_label(window))
}

/// Convert a pane rect (logical px, relative to the host window's content area)
/// into an on-screen physical position + size for the child window.
fn screen_rect<R: Runtime>(
    window: &Window<R>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(PhysicalPosition<i32>, PhysicalSize<u32>), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let inner = window.inner_position().map_err(|e| e.to_string())?;
    let pos = PhysicalPosition::new(inner.x + (x * scale) as i32, inner.y + (y * scale) as i32);
    let size = PhysicalSize::new((w * scale).max(1.0) as u32, (h * scale).max(1.0) as u32);
    Ok((pos, size))
}

/// Open the preview at `url` over the given pane rect, or navigate + reposition an
/// existing one. Called by the frontend when the user opens/moves the pane.
#[tauri::command]
pub fn preview_open<R: Runtime>(
    window: Window<R>,
    url: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    let (pos, size) = screen_rect(&window, x, y, w, h)?;
    if let Some(pv) = find_preview(&window) {
        pv.navigate(parsed).map_err(|e| e.to_string())?;
        pv.set_position(pos).map_err(|e| e.to_string())?;
        pv.set_size(size).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let main = window
        .app_handle()
        .get_webview_window(window.label())
        .ok_or("host window not found")?;
    let builder = WebviewWindowBuilder::new(
        window.app_handle(),
        preview_label(&window),
        WebviewUrl::External(parsed),
    )
    .title("reado-preview")
    .decorations(false)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .focused(false)
    .initialization_script(BRIDGE)
    .inner_size(w.max(1.0), h.max(1.0));
    let builder = builder.parent(&main).map_err(|e| e.to_string())?;
    let pv = builder.build().map_err(|e| e.to_string())?;
    pv.set_position(pos).map_err(|e| e.to_string())?;
    pv.set_size(size).map_err(|e| e.to_string())?;
    Ok(())
}

/// Run JS in the preview and return its (JSON-serialized) result — the data-back
/// channel for perception (drain the bridge, query the DOM, scrub animations).
/// CSP-immune: this is native eval, not a network request from the page.
#[tauri::command]
pub async fn preview_eval<R: Runtime>(window: Window<R>, js: String) -> Result<String, String> {
    let wv = find_preview(&window).ok_or("no preview pane running")?;
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = std::sync::Mutex::new(Some(tx));
    wv.eval_with_callback(js, move |result| {
        if let Ok(mut guard) = tx.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(result);
            }
        }
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())
}

/// Probe dev-server ports and return the live ones, ordered by relevance to the
/// open project: an explicit port in `package.json`'s dev/start script wins, then
/// the framework's default ports (Vite 5173+, Next 3000+, …), then common
/// fallbacks. A plain TCP connect (no CORS/CSP) keeps it fast and reliable.
#[tauri::command]
pub fn preview_detect_urls(root: String, current: Option<String>) -> Vec<String> {
    let pkg: Option<serde_json::Value> =
        std::fs::read_to_string(std::path::Path::new(&root).join("package.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok());

    let mut ports: Vec<u16> = Vec::new();
    // Probe the current URL's port first, so a live manual choice is preserved.
    if let Some(p) = current
        .as_deref()
        .and_then(|u| tauri::Url::parse(u).ok())
        .and_then(|u| u.port_or_known_default())
    {
        ports.push(p);
    }
    if let Some(pkg) = &pkg {
        // Explicit `--port`/`-p`/`PORT=` in the dev (or start) script wins.
        for key in ["dev", "start"] {
            if let Some(script) = pkg
                .get("scripts")
                .and_then(|s| s.get(key))
                .and_then(|v| v.as_str())
            {
                if let Some(p) = explicit_port(script) {
                    ports.push(p);
                }
            }
        }
        ports.extend(framework_ports(pkg));
    }
    // Common fallbacks after the project-specific guesses.
    ports.extend([
        5173, 5174, 5175, 5176, 3000, 3001, 4321, 4200, 8080, 8000, 4173, 5500,
    ]);
    // Dedup, preserving order.
    let mut seen = std::collections::HashSet::new();
    ports.retain(|p| seen.insert(*p));

    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;
    let live: Vec<String> = ports
        .into_iter()
        .filter(|&p| {
            TcpStream::connect_timeout(
                &SocketAddr::from(([127, 0, 0, 1], p)),
                Duration::from_millis(80),
            )
            .is_ok()
        })
        .map(|p| format!("http://localhost:{p}"))
        .collect();
    live
}

/// An explicit port in a dev script: `--port 5000`, `--port=5000`, `-p 5000`,
/// `-p5000`, or a leading `PORT=5000`.
fn explicit_port(script: &str) -> Option<u16> {
    let toks: Vec<&str> = script.split_whitespace().collect();
    for (i, t) in toks.iter().enumerate() {
        if let Some(v) = t
            .strip_prefix("--port=")
            .or_else(|| t.strip_prefix("PORT="))
        {
            if let Ok(p) = v.parse() {
                return Some(p);
            }
        }
        if *t == "--port" || *t == "-p" {
            if let Some(p) = toks.get(i + 1).and_then(|n| n.parse().ok()) {
                return Some(p);
            }
        }
        if let Some(v) = t.strip_prefix("-p") {
            if !v.is_empty() {
                if let Ok(p) = v.parse() {
                    return Some(p);
                }
            }
        }
    }
    None
}

/// Framework default ports, inferred from (dev)dependencies.
fn framework_ports(pkg: &serde_json::Value) -> Vec<u16> {
    let names: Vec<String> = ["dependencies", "devDependencies"]
        .iter()
        .filter_map(|k| pkg.get(*k).and_then(|v| v.as_object()))
        .flat_map(|o| o.keys().cloned())
        .collect();
    let has = |name: &str| names.iter().any(|d| d == name || d.starts_with(name));
    if has("next") {
        vec![3000, 3001, 3002]
    } else if has("vite") || has("@vitejs") || has("@sveltejs") {
        vec![5173, 5174, 5175, 5176]
    } else if has("@angular") {
        vec![4200]
    } else if has("astro") {
        vec![4321, 3000]
    } else if has("nuxt") || has("react-scripts") {
        vec![3000]
    } else {
        vec![]
    }
}

/// Persist the drained console + network snapshots under the project's `.reado/`
/// so the `reado mcp` server can expose them to the agent as read-only resources.
/// One writer (BrowserPanel) owns the drain; this just mirrors it to disk.
#[tauri::command]
pub fn preview_persist_state(root: String, console: String, network: String) -> Result<(), String> {
    let dir = std::path::Path::new(&root).join(".reado");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("preview-console.json"), console).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("preview-network.json"), network).map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove the mirror + control files when the preview closes or access is cut off,
/// so the agent's tools correctly report "no preview pane running" afterwards.
#[tauri::command]
pub fn preview_clear_state(root: String) -> Result<(), String> {
    let dir = std::path::Path::new(&root).join(".reado");
    for f in [
        "preview-console.json",
        "preview-network.json",
        "preview-cmd.json",
        "preview-result.json",
    ] {
        let _ = std::fs::remove_file(dir.join(f));
    }
    Ok(())
}

/// Capture the preview region as a PNG data URL (OS-level window capture, cropped
/// to the pane rect). Best-effort: matches the Reado window by app name, since the
/// macOS title is intentionally blank. Physical px = logical × scale factor.
/// ponytail: if the crop is offset on a platform, tune here — it's a coordinate
/// mapping, not a model change.
#[tauri::command]
pub fn preview_capture_frame<R: Runtime>(
    _window: Window<R>,
    _x: f64,
    _y: f64,
    _w: f64,
    _h: f64,
) -> Result<String, String> {
    // The preview is now its own window titled "reado-preview" — capture it whole,
    // no cropping needed.
    let xw = xcap::Window::all()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|xw| xw.title().map(|tt| tt == "reado-preview").unwrap_or(false))
        .ok_or("no preview pane running")?;
    let img = xw.capture_image().map_err(|e| e.to_string())?;
    let mut buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut buf, xcap::image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "data:image/png;base64,{}",
        crate::fs::base64_encode(buf.get_ref())
    ))
}

/// Control-channel queue (desktop↔`reado mcp`), file-based to reuse the pane's
/// existing poll loop: the CLI writes `.reado/preview-cmd.json` `{id, op, arg}`,
/// the pane executes it and writes `.reado/preview-result.json` `{id, ok, result}`.
#[tauri::command]
pub fn preview_take_cmd(root: String) -> Option<String> {
    std::fs::read_to_string(
        std::path::Path::new(&root)
            .join(".reado")
            .join("preview-cmd.json"),
    )
    .ok()
}

#[tauri::command]
pub fn preview_put_result(root: String, result: String) -> Result<(), String> {
    let dir = std::path::Path::new(&root).join(".reado");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("preview-result.json"), result).map_err(|e| e.to_string())
}

/// Detach the preview into its own window (e.g. a second monitor): close the
/// docked child and open a standalone window at the same URL, with the bridge.
/// ponytail: one-way move + reload; agent-control still targets the docked pane —
/// re-dock (close this window, reopen the pane) to resume driving.
#[tauri::command]
pub fn preview_detach<R: Runtime>(
    app: tauri::AppHandle<R>,
    window: Window<R>,
    url: String,
) -> Result<(), String> {
    if let Some(wv) = find_preview(&window) {
        let _ = wv.close();
    }
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    let label = format!("previewwin::{}", window.label());
    tauri::WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title("Preview — Reado")
        .inner_size(960.0, 720.0)
        .initialization_script(BRIDGE)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Set the preview's page zoom (native webview zoom). Combined with sizing the
/// box, this lets a large viewport (e.g. 4K) render scaled to fit a small pane.
#[tauri::command]
pub fn preview_set_zoom<R: Runtime>(window: Window<R>, factor: f64) -> Result<(), String> {
    if let Some(wv) = find_preview(&window) {
        wv.set_zoom(factor).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// History/reload driven in-page (no data-back needed).
#[tauri::command]
pub fn preview_back<R: Runtime>(window: Window<R>) -> Result<(), String> {
    if let Some(wv) = find_preview(&window) {
        wv.eval("history.back()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn preview_forward<R: Runtime>(window: Window<R>) -> Result<(), String> {
    if let Some(wv) = find_preview(&window) {
        wv.eval("history.forward()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn preview_reload<R: Runtime>(window: Window<R>) -> Result<(), String> {
    if let Some(wv) = find_preview(&window) {
        wv.eval("location.reload()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Keep the preview parked over the pane region as the layout resizes.
#[tauri::command]
pub fn preview_set_bounds<R: Runtime>(
    window: Window<R>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    if let Some(pv) = find_preview(&window) {
        let (pos, size) = screen_rect(&window, x, y, w, h)?;
        pv.set_position(pos).map_err(|e| e.to_string())?;
        pv.set_size(size).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Navigate the open preview to a new URL (URL-bar / agent navigation).
#[tauri::command]
pub fn preview_navigate<R: Runtime>(window: Window<R>, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if let Some(wv) = find_preview(&window) {
        wv.navigate(parsed).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Show/hide the preview window. A native child window sits above the DOM, so it
/// would cover Reado's own overlays (command palette, settings, dialogs) — the
/// frontend hides it while any of those is open, then shows it again.
#[tauri::command]
pub fn preview_set_visible<R: Runtime>(window: Window<R>, visible: bool) -> Result<(), String> {
    if let Some(pv) = find_preview(&window) {
        if visible {
            pv.show().map_err(|e| e.to_string())?;
        } else {
            pv.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Close the preview pane (remove its webview).
#[tauri::command]
pub fn preview_close<R: Runtime>(window: Window<R>) -> Result<(), String> {
    if let Some(wv) = find_preview(&window) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn explicit_port_parses_every_flag_shape() {
        assert_eq!(explicit_port("vite --port 5000"), Some(5000));
        assert_eq!(explicit_port("vite --port=6000"), Some(6000));
        assert_eq!(explicit_port("next dev -p 7000"), Some(7000));
        assert_eq!(explicit_port("next dev -p7001"), Some(7001));
        assert_eq!(explicit_port("PORT=8123 react-scripts start"), Some(8123));
        // No explicit port → None (falls back to framework defaults elsewhere).
        assert_eq!(explicit_port("vite"), None);
        assert_eq!(explicit_port("next dev"), None);
        // A bogus value must not be mistaken for a port.
        assert_eq!(explicit_port("vite --port notanumber"), None);
        // Out-of-range for u16 → None, not a truncated/wrapped port.
        assert_eq!(explicit_port("vite --port 99999"), None);
    }

    #[test]
    fn framework_ports_are_inferred_from_deps() {
        let pkg = |dep: &str| serde_json::json!({ "dependencies": { dep: "1.0.0" } });
        assert_eq!(framework_ports(&pkg("next")), vec![3000, 3001, 3002]);
        assert_eq!(framework_ports(&pkg("vite")), vec![5173, 5174, 5175, 5176]);
        assert_eq!(framework_ports(&pkg("@angular/core")), vec![4200]);
        assert_eq!(framework_ports(&pkg("astro")), vec![4321, 3000]);
        assert_eq!(framework_ports(&pkg("nuxt")), vec![3000]);
        assert_eq!(framework_ports(&pkg("react-scripts")), vec![3000]);
        // devDependencies count too.
        let dev = serde_json::json!({ "devDependencies": { "vite": "5" } });
        assert_eq!(framework_ports(&dev), vec![5173, 5174, 5175, 5176]);
        // Unknown stack → no framework guess.
        assert!(framework_ports(&pkg("lodash")).is_empty());
        // Next wins over a co-present vite (checked first).
        let both = serde_json::json!({ "dependencies": { "next": "14", "vite": "5" } });
        assert_eq!(framework_ports(&both), vec![3000, 3001, 3002]);
    }

    #[test]
    fn persist_then_clear_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        preview_persist_state(root.clone(), "[1]".into(), "[2]".into()).unwrap();
        let reado = dir.path().join(".reado");
        assert_eq!(
            std::fs::read_to_string(reado.join("preview-console.json")).unwrap(),
            "[1]"
        );
        assert_eq!(
            std::fs::read_to_string(reado.join("preview-network.json")).unwrap(),
            "[2]"
        );

        // A stale control result must be swept too, so the next agent read is clean.
        std::fs::write(reado.join("preview-result.json"), "{}").unwrap();
        preview_clear_state(root).unwrap();
        assert!(!reado.join("preview-console.json").exists());
        assert!(!reado.join("preview-network.json").exists());
        assert!(!reado.join("preview-result.json").exists());
    }

    #[test]
    fn clear_state_is_ok_when_nothing_to_remove() {
        let dir = tempfile::tempdir().unwrap();
        // No `.reado/` dir at all → clearing must not error.
        preview_clear_state(dir.path().to_str().unwrap().to_string()).unwrap();
    }

    #[test]
    fn detect_urls_finds_a_live_server_on_the_scripts_port() {
        // Bind a real listener on an ephemeral port and advertise it via the dev
        // script — detect must probe it (explicit_port) and report it live.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            serde_json::json!({ "scripts": { "dev": format!("vite --port {port}") } }).to_string(),
        )
        .unwrap();
        let live = preview_detect_urls(dir.path().to_str().unwrap().to_string(), None);
        assert!(
            live.contains(&format!("http://localhost:{port}")),
            "expected the bound port {port} among {live:?}"
        );
    }

    #[test]
    fn detect_urls_omits_a_dead_port() {
        // A port nobody is listening on must not appear as live.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener); // free it → now dead
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            serde_json::json!({ "scripts": { "dev": format!("vite --port {port}") } }).to_string(),
        )
        .unwrap();
        let live = preview_detect_urls(dir.path().to_str().unwrap().to_string(), None);
        assert!(
            !live.contains(&format!("http://localhost:{port}")),
            "dead port {port} must not be reported live: {live:?}"
        );
    }
}
