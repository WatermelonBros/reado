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
  B.drain = function(){ var l=B.logs, ip=B.inspectPath, ca=B.commentAt, oc=B.openComment, vp=B.vaultPick; B.logs=[]; B.inspectPath=null; B.commentAt=null; B.openComment=null; B.vaultPick=null; return {logs:l, net:B.net.slice(-300), inspect:ip, commentAt:ca||null, openComment:oc||null, vaultPick:vp||null, hasMarks:!!document.getElementById('__readoMarks'), hasVault:!!document.getElementById('__readoVault'), href:location.href, canBack:history.length>1}; };
  B.clear = function(){ B.logs=[]; B.net=[]; };
  // Elements highlight: draw an overlay over the element at the given child-index
  // path (from documentElement), like Chrome's hover highlight.
  B.hi = function(idxs){ var el=document.documentElement; for(var i=0;i<idxs.length;i++){ el=el&&el.children[idxs[i]]; } var o=document.getElementById('__readoHi'); if(!el){ if(o)o.style.display='none'; return; } var r=el.getBoundingClientRect(); if(!o){ o=document.createElement('div'); o.id='__readoHi'; o.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;background:rgba(90,150,255,0.22);outline:1px solid rgba(90,150,255,0.9);transition:all .05s;'; (document.body||document.documentElement).appendChild(o); } o.style.display='block'; o.style.left=r.left+'px'; o.style.top=r.top+'px'; o.style.width=r.width+'px'; o.style.height=r.height+'px'; };
  B.unhi = function(){ var o=document.getElementById('__readoHi'); if(o) o.style.display='none'; };
  // Design-comment marker: a pin + bubble at a document point (x,y), scrolled into view.
  B.pin = function(x, y, text){ var p=document.getElementById('__readoPin'); if(!p){ p=document.createElement('div'); p.id='__readoPin'; p.style.cssText='position:absolute;z-index:2147483646;pointer-events:none;transform:translate(-6px,-100%);font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;'; (document.body||document.documentElement).appendChild(p); } p.style.left=x+'px'; p.style.top=y+'px'; var esc=String(text).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); p.innerHTML='<div style="max-width:260px;background:#ff2d55;color:#fff;padding:6px 10px;border-radius:9px 9px 9px 0;box-shadow:0 8px 22px rgba(0,0,0,.35);white-space:pre-wrap;word-break:break-word;line-height:1.35">'+esc+'</div>'; window.scrollTo({left:Math.max(0,x-innerWidth/2), top:Math.max(0,y-innerHeight/2), behavior:'smooth'}); };
  B.unpin = function(){ var p=document.getElementById('__readoPin'); if(p) p.remove(); };
  B.esc = function(s){ return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); };
  // Persistent design-comment dots for the current page. list=[{id,x,y}]; on toggles
  // visibility. Clicking a dot buffers its id; Reado opens the real comment thread
  // as a DOM layer over the pane (the dot is the only piece that must live in-page).
  // What an agent needs to know which element a design comment is about — the
  // code comment's file:line, for a page: a readable CSS selector, the element's
  // visible text, the start of its HTML, and (on a dev build of a React, Vue or
  // Svelte app) the component that rendered it, with its source file when the
  // framework keeps one.
  B.describe = function(el){
    function sel(e){ var parts=[]; while(e&&e.nodeType===1&&e!==document.documentElement&&parts.length<5){ if(e.id){ parts.unshift('#'+CSS.escape(e.id)); break; } var s=e.tagName.toLowerCase(); var cls=[].filter.call(e.classList,function(c){ return !/[:\[\]\/()]/.test(c); }).slice(0,2); if(cls.length) s+='.'+cls.map(function(c){ return CSS.escape(c); }).join('.'); var p=e.parentElement; if(p){ var same=[].filter.call(p.children,function(x){ return x.tagName===e.tagName; }); if(same.length>1) s+=':nth-of-type('+(same.indexOf(e)+1)+')'; } parts.unshift(s); e=p; } return parts.join(' > '); }
    function component(e){ var names=[], src='';
      for(var n=e; n&&!names.length; n=n.parentElement){
        var fk=Object.keys(n).find(function(k){ return k.indexOf('__reactFiber$')===0; });
        if(fk){ for(var f=n[fk]; f&&names.length<4; f=f.return){ var t=f.type; var nm=t&&(typeof t==='function'?(t.displayName||t.name):(t.displayName||(t.render&&(t.render.displayName||t.render.name))||(t.type&&(t.type.displayName||t.type.name)))); if(nm&&nm.length>1&&names.indexOf(nm)<0){ names.push(nm); if(!src&&f._debugSource) src=f._debugSource.fileName+':'+f._debugSource.lineNumber; } } }
        var v=n.__vueParentComponent; if(v&&!names.length){ for(var c=v; c&&names.length<4; c=c.parent){ var vt=c.type||{}; var vn=vt.name||vt.__name||(vt.__file&&vt.__file.split('/').pop().replace(/\.vue$/,'')); if(vn){ names.push(vn); if(!src&&vt.__file) src=vt.__file; } } }
        if(n.__svelte_meta&&!src){ var l=n.__svelte_meta.loc; if(l) src=l.file+':'+(l.line+1); }
      }
      var out=names.reverse().join(' › '); return (out+(src?(out?' ':'')+'('+src+')':''))||null; }
    var html=el.outerHTML||''; var text=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
    return {selector:sel(el), text:text.length>160?text.slice(0,160)+'…':text, html:html.length>400?html.slice(0,400)+'…':html, component:component(el)};
  };
  // A design comment's pin follows the element it was left on: placed from the
  // element's live box on every scroll (the page's own or any inner scroller's),
  // resize and reflow, not from the document point of the click — which stayed
  // put while an app that scrolls in an inner pane, or reflows on resize, moved
  // its content out from under it. The document point is the fallback for a
  // comment with no element, or whose element is gone.
  B.at = function(path){ var el=document.documentElement; for(var i=0;el&&i<path.length;i++){ el=el.children[path[i]]; } return el||null; };
  B.where = function(m){ var t=m.target; if(t&&t.path){ var el=B.at(t.path); if(el&&el.isConnected){ var r=el.getBoundingClientRect(); if(r.width||r.height) return {x:r.left+t.dx, y:r.top+t.dy}; } } return {x:(m.x||0)-(window.scrollX||0), y:(m.y||0)-(window.scrollY||0)}; };
  // The layer an element lives in when the page floats one over itself — a
  // dialog, a popover, a menu. Reado's panels for that element open *inside* it:
  // appended to <body> they were outside it as far as the page could tell, so the
  // popover closed on the first click, its focus trap took the caret back from
  // the textarea, and a menu's typeahead ate what was typed there.
  B.host = function(el){
    var h = el && el.closest && el.closest('dialog[open],[popover],[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[aria-modal=true]');
    return h || document.body || document.documentElement;
  };
  B.onBody = function(host){ return host === document.body || host === document.documentElement; };
  // Where (0,0) of a `position:fixed` box lands inside `host`: the viewport's
  // corner, except under a transformed ancestor — every positioned popover is
  // one — which re-bases it.
  B.origin = function(host){
    if (B.onBody(host)) return {x:0, y:0};
    var p = document.createElement('div'); p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0';
    host.appendChild(p); var r = p.getBoundingClientRect(); p.remove();
    return {x:r.left, y:r.top};
  };
  // The page's own handlers never hear what happens in a panel: a dialog's
  // Escape, a menu's arrow keys, a "click outside" listener on the document.
  B.seal = function(el){
    ['keydown','keyup','keypress','pointerdown','mousedown','mouseup','click','focusin','focusout'].forEach(function(t){
      el.addEventListener(t, function(e){ e.stopPropagation(); });
    });
  };
  // A dot sits in the host of the element it is about. It outlives the popover
  // it sits in: it goes back to the page's layer, and into the popover again when
  // that reopens.
  B.dots = [];
  function rehome(p){
    var t = p.m.target, el = t && t.path && B.at(t.path), h = B.host(el);
    var parent = B.onBody(h) ? B.layer() : h;
    if (p.el.parentNode !== parent) parent.appendChild(p.el);
    p.host = h;
  }
  B.place = function(){
    B.dots.forEach(function(p){
      rehome(p);
      var w = B.where(p.m), o = B.origin(p.host);
      var off = w.x<0 || w.y<0 || w.x>innerWidth || w.y>innerHeight;
      p.el.style.display = (off || !B.marksOn) ? 'none' : '';
      p.el.style.left = (w.x - o.x)+'px'; p.el.style.top = (w.y - o.y)+'px';
    });
  };
  var placing=0; function schedulePlace(){ if(placing||!B.dots.length) return; placing=requestAnimationFrame(function(){ placing=0; B.place(); }); }
  window.addEventListener('scroll', schedulePlace, true); window.addEventListener('resize', schedulePlace);
  // Reflows nobody scrolls or resizes for: images arriving, an app re-rendering.
  setInterval(schedulePlace, 500);
  B.layer = function(){ var layer=document.getElementById('__readoMarks'); if(!layer){ layer=document.createElement('div'); layer.id='__readoMarks'; layer.style.display=B.marksOn?'block':'none'; (document.body||document.documentElement).appendChild(layer); } return layer; };
  // `ui` is Reado's look — the theme's colours and the labels in the user's
  // language — handed over with the marks, so it is on the page before any panel.
  B.marks = function(list, on, ui){
    if (ui) B.ui = ui;
    B.marksOn = !!on;
    var layer = B.layer(); layer.innerHTML = ''; layer.style.display = on ? 'block' : 'none';
    B.dots.forEach(function(p){ p.el.remove(); });
    B.dots = (list||[]).map(function(m){
      var d=document.createElement('div');
      d.style.cssText='position:fixed;z-index:2147483640;transform:translate(-50%,-50%);width:16px;height:16px;border-radius:50%;background:#ff2d55;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer';
      d.onmousedown=function(ev){ ev.stopPropagation(); ev.preventDefault(); B.openComment=m.id; };
      B.seal(d);
      return {el:d, m:m};
    });
    B.place();
  };
  // Keep a panel we float over the page inside the visible part of it. Panels open
  // where the user clicked, and a click near the right or bottom edge used to
  // leave the composer hanging past it, half out of reach. Shifts by the
  // overflow, so it works for `fixed` (viewport) and `absolute` (document) boxes alike.
  B.fit = function(el){ var m=8, r=el.getBoundingClientRect(), dx=0, dy=0; if(r.right>innerWidth-m) dx=innerWidth-m-r.right; if(r.left+dx<m) dx=m-r.left; if(r.bottom>innerHeight-m) dy=innerHeight-m-r.bottom; if(r.top+dy<m) dy=m-r.top; if(dx) el.style.left=(parseFloat(el.style.left)||0)+dx+'px'; if(dy) el.style.top=(parseFloat(el.style.top)||0)+dy+'px'; };
  // The comment composer, drawn to read as the editor's own: the same header of
  // types, the same Task checkbox and buttons, in the theme's colours. (A comment
  // then opens in Reado's own thread, docked beside the page.)
  // Until Reado has sent its look (`B.marks`), the dark theme's.
  B.ui = {
    c: { canvas:'oklch(0.2 0.018 250)', surface:'oklch(0.24 0.02 250)', overlay:'oklch(0.27 0.022 250)', line:'oklch(0.32 0.02 250)', strong:'oklch(0.42 0.02 250)', ink:'oklch(0.87 0.012 250)', muted:'oklch(0.73 0.012 250)', faint:'oklch(0.62 0.012 250)', accent:'oklch(0.74 0.11 260)', onAccent:'oklch(0.2 0.02 260)', selection:'oklch(0.74 0.11 260 / 0.28)', font:'-apple-system,BlinkMacSystemFont,sans-serif',
      types: { bug:'oklch(0.72 0.16 35)', refactor:'oklch(0.79 0.1 260)', performance:'oklch(0.71 0.15 55)', question:'oklch(0.72 0.15 330)', note:'oklch(0.73 0.012 250)' } },
    t: { placeholder:'Leave a comment… Markdown supported.', save:'Comment', cancel:'Cancel', task:'Task',
      types: { bug:'Bug', refactor:'Refactor', performance:'Performance', question:'Question', note:'Note' } }
  };
  var TYPES = ['bug','refactor','performance','question','note'];
  function el(tag, css, text){ var e=document.createElement(tag); if(css) e.style.cssText=css; if(text!=null) e.textContent=text; return e; }
  function panel(width){ var C=B.ui.c; return 'box-sizing:border-box;width:min('+width+'px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow-y:auto;background:'+C.overlay+';color:'+C.ink+';border:1px solid '+C.strong+';border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.45);font:13px/1.45 '+C.font+';text-align:left;letter-spacing:normal;text-transform:none'; }
  function hover(e, on, off){ e.onmouseenter=function(){ e.style.cssText+=';'+on; }; e.onmouseleave=function(){ e.style.cssText+=';'+off; }; }
  // A button as the `Button` atom draws it, size sm.
  function button(label, primary, act){
    var C=B.ui.c, b=el('button', 'all:unset;box-sizing:border-box;display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:4px;font:12px '+C.font+';cursor:pointer;'+(primary?'background:'+C.accent+';color:'+C.onAccent:'background:transparent;color:'+C.muted), label);
    b.type='button';
    if (!primary) hover(b, 'background:'+C.selection+';color:'+C.ink, 'background:transparent;color:'+C.muted);
    b.onmousedown=function(e){ e.preventDefault(); if(!b.disabled) act(); };
    b.able=function(on){ b.disabled=!on; b.style.opacity=on?'1':'.5'; b.style.cursor=on?'pointer':'default'; };
    return b;
  }
  // The type chips of the composer's header: a coloured dot and the label.
  function chips(current, pick){
    var C=B.ui.c, T=B.ui.t, row=el('div','display:flex;flex:none;justify-content:flex-end;gap:4px');
    TYPES.forEach(function(tp){
      var on=tp===current, b=el('button','all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;font:12px '+C.font+';cursor:pointer;'+(on?'background:'+C.selection+';color:'+C.ink:'color:'+C.muted));
      b.type='button'; b.setAttribute('data-type', tp);
      b.appendChild(el('span','display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;background:'+C.types[tp]));
      b.appendChild(document.createTextNode(T.types[tp]));
      if (!on) hover(b, 'color:'+C.ink, 'color:'+C.muted);
      b.onmousedown=function(e){ e.preventDefault(); pick(tp); };
      row.appendChild(b);
    });
    return row;
  }
  // The Task checkbox, as the `Checkbox` atom draws it.
  function checkbox(on, toggle){
    var C=B.ui.c, l=el('span','display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:12px;color:'+C.muted);
    var box=el('span','display:grid;place-items:center;width:14px;height:14px;box-sizing:border-box;border-radius:3px;font-size:10px;line-height:1;color:'+C.onAccent);
    function paint(){ box.style.border='1px solid '+(on?C.accent:C.strong); box.style.background=on?C.accent:C.canvas; box.textContent=on?'✓':''; }
    paint(); l.appendChild(box); l.appendChild(document.createTextNode(B.ui.t.task));
    l.onmousedown=function(e){ e.preventDefault(); on=!on; paint(); toggle(on); };
    return l;
  }
  function textarea(filled, minH){
    var C=B.ui.c;
    return el('textarea','all:unset;box-sizing:border-box;display:block;width:100%;min-height:'+minH+'px;max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:13px/1.45 '+C.font+';color:'+C.ink+';'+(filled?'background:'+C.surface+';border-radius:4px;padding:6px 8px':'background:transparent;padding:8px 12px'));
  }
  // Open on the host of `target`, at a viewport point: `fixed` there (re-based by
  // the host's transform), then kept inside the visible page.
  function mount(box, host, x, y){
    var o=B.origin(host);
    box.style.position='fixed'; box.style.zIndex='2147483645';
    box.style.left=(x-o.x)+'px'; box.style.top=(y-o.y)+'px';
    B.seal(box); host.appendChild(box); B.fit(box);
  }
  // In-page comment composer at a document point; Save buffers {x,y,url,text,type,kind} for Reado to drain.
  B.compose = function(x, y, target){
    B.composeClose();
    var C=B.ui.c, T=B.ui.t, type=B.lastType||'note', task=type!=='note';
    var host=B.host(target && target.path && B.at(target.path));
    var box=el('div', panel(460)); box.id='__readoCompose';
    var head=el('div','display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid '+C.line);
    var what=target && (target.component || target.selector);
    head.appendChild(el('span','flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:'+C.faint, what||''));
    var types, check;
    function pick(tp){ type=tp; B.lastType=tp; task=tp!=='note'; var n=chips(type, pick); head.replaceChild(n, types); types=n; var k=checkbox(task, function(v){ task=v; }); foot.replaceChild(k, check); check=k; }
    types=chips(type, pick); head.appendChild(types);
    var ta=textarea(false, 80); ta.placeholder=T.placeholder;
    var foot=el('div','display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-top:1px solid '+C.line);
    check=checkbox(task, function(v){ task=v; }); foot.appendChild(check);
    var acts=el('div','display:flex;gap:8px');
    function doSave(){ var v=ta.value.trim(); if(!v) return; B.commentAt={x:x, y:y, url:location.href, text:v, target:target||null, type:type, kind:task?'task':'note'}; B.composeClose(); }
    var save=button(T.save, true, doSave); save.able(false);
    ta.addEventListener('input', function(){ save.able(!!ta.value.trim()); });
    acts.appendChild(button(T.cancel, false, B.composeClose)); acts.appendChild(save); foot.appendChild(acts);
    ta.addEventListener('keydown',function(e){ if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){ e.preventDefault(); doSave(); } if(e.key==='Escape'){ e.preventDefault(); B.composeClose(); } });
    box.appendChild(head); box.appendChild(ta); box.appendChild(foot);
    mount(box, host, x-(window.scrollX||0), y-(window.scrollY||0));
    setTimeout(function(){ ta.focus(); },0);
  };
  B.composeClose = function(){ var b=document.getElementById('__readoCompose'); if(b) b.remove(); };
  // The credential chip, drawn *in* the page — the pane is a native child window,
  // so Reado's own DOM can never be on top of it. This is the same place a browser
  // extension puts its prompt, and the only place one can be. It carries titles and
  // usernames, never a secret: a pick is buffered here, and Reado does the fetch
  // and the fill. Clicks must be `isTrusted` — the page can synthesise a click on
  // its own DOM, and that must not be able to make Reado type a password into it.
  B.vault = function(items, label){
    B.vaultClose();
    var box=document.createElement('div'); box.id='__readoVault';
    box.style.cssText='position:fixed;z-index:2147483645;top:14px;right:14px;width:320px;box-sizing:border-box;background:#1b1f27;color:#e6e9ef;border:1px solid #3a4150;border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.55);font:14px -apple-system,BlinkMacSystemFont,sans-serif;overflow:hidden';
    var head=document.createElement('div');
    head.style.cssText='display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #2b313c;font-size:12px;color:#9aa3b2';
    head.innerHTML='<span style="width:8px;height:8px;border-radius:50%;background:#4ade80"></span><span style="flex:1">'+B.esc(label||'Reado')+'</span>';
    var x=document.createElement('button'); x.textContent='×';
    x.style.cssText='border:0;background:transparent;color:#9aa3b2;font-size:20px;line-height:1;cursor:pointer;padding:0 2px';
    x.onclick=function(ev){ if(!ev.isTrusted) return; ev.preventDefault(); B.vaultPick={kind:'close'}; B.vaultClose(); };
    head.appendChild(x); box.appendChild(head);
    var list=document.createElement('div'); list.style.cssText='padding:8px';
    (items||[]).forEach(function(it){
      var row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:6px';
      var pick=document.createElement('button');
      pick.style.cssText='flex:1;min-width:0;text-align:left;border:0;border-radius:12px;padding:10px 12px;background:#2a63d8;color:#fff;cursor:pointer;font:600 14px -apple-system,BlinkMacSystemFont,sans-serif';
      pick.innerHTML='<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+B.esc(it.title)+'</div>'+(it.username?'<div style="font-weight:400;font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+B.esc(it.username)+'</div>':'');
      pick.onclick=function(ev){ if(!ev.isTrusted) return; ev.preventDefault(); B.vaultPick={kind:'login', id:it.id}; };
      row.appendChild(pick);
      if(it.hasOtp){
        var otp=document.createElement('button'); otp.textContent=(it.otpLabel||'Code');
        otp.style.cssText='flex:none;border:1px solid #3a4150;border-radius:12px;padding:10px 12px;background:#232833;color:#e6e9ef;cursor:pointer;font:600 13px -apple-system,BlinkMacSystemFont,sans-serif';
        otp.onclick=function(ev){ if(!ev.isTrusted) return; ev.preventDefault(); B.vaultPick={kind:'otp', id:it.id}; };
        row.appendChild(otp);
      }
      list.appendChild(row);
    });
    box.appendChild(list);
    var note=document.createElement('div'); note.id='__readoVaultNote';
    note.style.cssText='display:none;padding:0 14px 12px;font-size:12px;color:#9aa3b2';
    box.appendChild(note);
    (document.body||document.documentElement).appendChild(box);
  };
  // What Reado did with the pick, said where the user is looking.
  B.vaultNote = function(text){ var n=document.getElementById('__readoVaultNote'); if(!n) return; n.textContent=text||''; n.style.display=text?'block':'none'; };
  B.vaultClose = function(){ var b=document.getElementById('__readoVault'); if(b) b.remove(); };
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
  function showMenu(x, y, path, px, py, target){
    closeMenu();
    menuEl=document.createElement('div');
    menuEl.style.cssText='position:fixed;z-index:2147483647;left:'+x+'px;top:'+y+'px;min-width:150px;background:#20242e;color:#cbd0d9;border:1px solid #333a47;border-radius:7px;padding:4px;font:13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)';
    var items=[
      ['Reload', function(){ location.reload(); }],
      ['Copy', function(){ try{ document.execCommand('copy'); }catch(e){} }],
      ['Paste', function(){ try{ navigator.clipboard.readText().then(function(t){ var el=document.activeElement; if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA')){ var s=el.selectionStart||0, en=el.selectionEnd||0; el.value=el.value.slice(0,s)+t+el.value.slice(en); el.setSelectionRange(s+t.length,s+t.length); el.dispatchEvent(new Event('input',{bubbles:true})); } else { document.execCommand('insertText', false, t); } }); }catch(e){} }],
      ['Inspect', function(){ B.inspectPath=path; }],
      ['Comment here', function(){ B.compose(px, py, target); }]
    ];
    items.forEach(function(it){ var d=document.createElement('div'); d.textContent=it[0]; d.style.cssText='padding:5px 10px;border-radius:4px;cursor:default'; d.onmouseenter=function(){ d.style.background='#2c3340'; }; d.onmouseleave=function(){ d.style.background=''; }; d.onmousedown=function(ev){ ev.preventDefault(); closeMenu(); it[1](); }; menuEl.appendChild(d); });
    // On the clicked element's layer, like the panels: a menu on <body> over a
    // popover closes the popover when an item is picked.
    var host=B.host(target && B.at(target.path)), o=B.origin(host);
    menuEl.style.left=(x-o.x)+'px'; menuEl.style.top=(y-o.y)+'px';
    B.seal(menuEl); host.appendChild(menuEl);
    var r=menuEl.getBoundingClientRect(); if(r.right>innerWidth) menuEl.style.left=(x-r.width-o.x)+'px'; if(r.bottom>innerHeight) menuEl.style.top=(y-r.height-o.y)+'px'; B.fit(menuEl);
    setTimeout(function(){ document.addEventListener('mousedown', onDoc, true); }, 0);
  }
  document.addEventListener('contextmenu', function(e){ try{ e.preventDefault(); var r=e.target.getBoundingClientRect(); showMenu(e.clientX, e.clientY, pathOf(e.target), e.pageX, e.pageY, Object.assign({path:pathOf(e.target), dx:e.clientX-r.left, dy:e.clientY-r.top}, B.describe(e.target))); }catch(err){} }, true);
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

/// The preview child window's OS title, made unique per host window so a
/// multi-window session can capture the *caller's* own preview by title rather
/// than grabbing whichever window the OS enumerates first.
fn preview_window_title<R: Runtime>(window: &Window<R>) -> String {
    format!("reado-preview::{}", window.label())
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
    .title(preview_window_title(&window))
    .decorations(false)
    // Reado owns this window's frame: it is parked over the pane's placeholder
    // and re-parked on every layout change. Left resizable, its undecorated
    // edges are still draggable, so a drag meant for the dock's resize handle
    // stretched the browser out past the panel it lives in.
    .resizable(false)
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

/// Write `content` to `path` atomically (temp file + rename): the `reado` CLI
/// polls these files, and a plain truncate-then-write would let it read a torn
/// document.
fn atomic_write(path: &std::path::Path, content: &str) -> std::io::Result<()> {
    reado_core::atomic_write(path, content.as_bytes())
}

/// Persist the drained console + network snapshots under the project's `.reado/`
/// so the `reado mcp` server can expose them to the agent as read-only resources.
/// One writer (BrowserPanel) owns the drain; this just mirrors it to disk.
#[tauri::command]
pub fn preview_persist_state(root: String, console: String, network: String) -> Result<(), String> {
    let dir = reado_core::reado_dir(&root);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    atomic_write(&dir.join(reado_core::PREVIEW_CONSOLE_FILE), &console)
        .map_err(|e| e.to_string())?;
    atomic_write(&dir.join(reado_core::PREVIEW_NETWORK_FILE), &network)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove the mirror + control files when the preview closes or access is cut off,
/// so the agent's tools correctly report "no preview pane running" afterwards.
#[tauri::command]
pub fn preview_clear_state(root: String) -> Result<(), String> {
    let dir = reado_core::reado_dir(&root);
    for f in [
        reado_core::PREVIEW_CONSOLE_FILE,
        reado_core::PREVIEW_NETWORK_FILE,
        reado_core::PREVIEW_CMD_FILE,
        reado_core::PREVIEW_RESULT_FILE,
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
#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub fn preview_capture_frame<R: Runtime>(
    window: Window<R>,
    _x: f64,
    _y: f64,
    _w: f64,
    _h: f64,
) -> Result<String, String> {
    // The preview is its own window, titled uniquely per host window — capture the
    // caller's own preview (not another project window's) whole, no cropping needed.
    let want = preview_window_title(&window);
    let xw = xcap::Window::all()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|xw| xw.title().map(|tt| tt == want).unwrap_or(false))
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

/// Linux: window capture (xcap) would drag in PipeWire, so the frame tool is not
/// built there. The rest of the browser tools (DOM/console/network/eval) work.
#[cfg(target_os = "linux")]
#[tauri::command]
pub fn preview_capture_frame<R: Runtime>(
    _window: Window<R>,
    _x: f64,
    _y: f64,
    _w: f64,
    _h: f64,
) -> Result<String, String> {
    Err("frame capture is not available on Linux".into())
}

/// Control-channel queue (desktop↔`reado mcp`), file-based to reuse the pane's
/// existing poll loop: the CLI writes `.reado/preview-cmd.json` `{id, op, arg}`,
/// the pane executes it and writes `.reado/preview-result.json` `{id, ok, result}`.
#[tauri::command]
pub fn preview_take_cmd(root: String) -> Option<String> {
    std::fs::read_to_string(reado_core::reado_dir(&root).join(reado_core::PREVIEW_CMD_FILE)).ok()
}

#[tauri::command]
pub fn preview_put_result(root: String, result: String) -> Result<(), String> {
    let dir = reado_core::reado_dir(&root);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    atomic_write(&dir.join(reado_core::PREVIEW_RESULT_FILE), &result).map_err(|e| e.to_string())
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
        let _ = wv.destroy();
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

/// Close the preview pane (remove its webview). `destroy`, not `close`: a close
/// request on a preview window is refused (see `on_window_event`), so only the
/// pane itself can take it down.
#[tauri::command]
pub fn preview_close<R: Runtime>(window: Window<R>) -> Result<(), String> {
    if let Some(wv) = find_preview(&window) {
        wv.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Does this bare name resolve on this machine?
///
/// The address bar has to decide between a host and a search term, and a
/// single-label name (`myapp`, with no dot and no port) is ambiguous: it is both
/// a plausible search and exactly what an `/etc/hosts` alias looks like. Nothing
/// in the frontend can tell them apart — the system resolver can, because it is
/// the thing that reads `/etc/hosts` (and the search domains).
///
/// Bounded, because a name that is *not* a host goes out to DNS and can take
/// seconds with search domains appended: past the budget the answer is "no", and
/// the user gets the search they probably meant.
#[tauri::command]
pub async fn host_resolves(name: String) -> bool {
    use std::net::ToSocketAddrs;
    // A name is all this answers about; anything with a slash, a scheme or a
    // space is not one, and resolving it would be a waste of the budget.
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return false;
    }
    let lookup = tokio::task::spawn_blocking(move || {
        (name.as_str(), 80u16)
            .to_socket_addrs()
            .is_ok_and(|mut a| a.next().is_some())
    });
    matches!(
        tokio::time::timeout(std::time::Duration::from_millis(400), lookup).await,
        Ok(Ok(true))
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[tokio::test]
    async fn a_name_that_resolves_is_a_host_and_one_that_does_not_is_a_search() {
        // `localhost` is a host on every machine; the random one is not, and the
        // address bar must not send the user to a page that cannot exist.
        assert!(host_resolves("localhost".into()).await);
        assert!(!host_resolves("nx-e3f1c0de-not-a-host".into()).await);
        // Not a bare name at all: never worth a lookup.
        assert!(!host_resolves("has space".into()).await);
        assert!(!host_resolves("http://x".into()).await);
        assert!(!host_resolves(String::new()).await);
    }

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
