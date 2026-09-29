// Injected into the Reado webview by run.mjs (as an `eval` body). Defines
// window.__demo: a visible fake cursor and human-paced gestures, because the UI
// driver acts through DOM events and a screen recording would otherwise show
// things happening with no hand behind them. Idempotent: run.mjs prefixes it to
// every command, so a webview reload mid-take (Vite does that) costs nothing.
//
// Everything here is position:fixed on document.body: the app root carries the
// interface-zoom transform, which would re-base anything fixed inside it.
if (!window.__demo) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const ease = "cubic-bezier(.22,.61,.36,1)"

  const cursor = document.createElement("div")
  cursor.id = "reado-demo-cursor"
  cursor.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2.5 L4 19.5 L8.6 15.2 L11.6 21.8 L14.6 20.4 L11.7 13.9 L18 13.9 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  Object.assign(cursor.style, {
    position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none",
    transform: `translate(${innerWidth / 2}px, ${innerHeight / 2}px)`,
    filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))", opacity: "0", transition: "opacity .25s",
  })
  document.body.appendChild(cursor)

  const caption = document.createElement("div")
  Object.assign(caption.style, {
    position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)",
    zIndex: "2147483646", pointerEvents: "none", padding: "8px 14px", borderRadius: "10px",
    background: "rgba(20,22,30,.88)", color: "#fff", font: "600 15px -apple-system, system-ui",
    letterSpacing: ".02em", opacity: "0", transition: "opacity .2s",
  })
  document.body.appendChild(caption)

  let pos = { x: innerWidth / 2, y: innerHeight / 2 }

  const resolve = (target) => {
    if (target instanceof Element) return target
    if (typeof target === "string") {
      const el = document.querySelector(target)
      if (el) return el
      // fall back to visible text match on buttons/links/labels
      const all = [...document.querySelectorAll("button,a,[role=button],[role=menuitem],[role=tab],label,span,div")]
      return all.find((e) => e.offsetParent && e.textContent?.trim() === target) ?? null
    }
    return null
  }
  const centre = (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  async function moveTo(target, ms) {
    const p = target && "x" in target && "y" in target ? target : centre(resolve(target) ?? document.body)
    const d = Math.hypot(p.x - pos.x, p.y - pos.y)
    const dur = ms ?? Math.min(900, 250 + d * 0.7)
    cursor.style.opacity = "1"
    const anim = cursor.animate(
      [{ transform: `translate(${pos.x}px, ${pos.y}px)` }, { transform: `translate(${p.x}px, ${p.y}px)` }],
      { duration: dur, easing: ease, fill: "forwards" },
    )
    // An occluded webview pauses animations and `finished` would never settle —
    // which hangs the driver's bridge for good. Never wait on rendering alone.
    await Promise.race([anim.finished, sleep(dur + 150)])
    cursor.style.transform = `translate(${p.x}px, ${p.y}px)`
    pos = p
  }

  function ripple() {
    const r = document.createElement("div")
    Object.assign(r.style, {
      position: "fixed", left: `${pos.x - 14}px`, top: `${pos.y - 14}px`, width: "28px", height: "28px",
      borderRadius: "50%", background: "rgba(92,120,255,.45)", zIndex: "2147483646", pointerEvents: "none",
    })
    document.body.appendChild(r)
    r.animate([{ transform: "scale(.3)", opacity: 1 }, { transform: "scale(1.6)", opacity: 0 }], {
      duration: 420, easing: "ease-out",
    })
    setTimeout(() => r.remove(), 450)
  }

  // Ark UI triggers listen on pointerdown, so a bare el.click() isn't enough.
  async function click(target) {
    const el = resolve(target)
    if (!el) throw new Error(`demo.click: nothing matches ${target}`)
    await moveTo(el)
    await sleep(120)
    ripple()
    const o = { bubbles: true, cancelable: true, clientX: pos.x, clientY: pos.y, button: 0 }
    el.dispatchEvent(new PointerEvent("pointerdown", o))
    el.dispatchEvent(new MouseEvent("mousedown", o))
    el.dispatchEvent(new PointerEvent("pointerup", o))
    el.dispatchEvent(new MouseEvent("mouseup", o))
    el.click()
    await sleep(180)
  }

  // Type into an input/textarea one character at a time, through the native
  // value setter so React sees every keystroke.
  async function type(target, text, cps = 22) {
    const el = resolve(target)
    if (!el) throw new Error(`demo.type: nothing matches ${target}`)
    el.focus()
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const set = Object.getOwnPropertyDescriptor(proto, "value").set
    for (const ch of text) {
      set.call(el, el.value + ch)
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }))
      await sleep(1000 / cps + (Math.random() * 40 - 20))
    }
  }

  // A caption pill at the bottom: shortcuts ("⌘⇧M") or one-line narration.
  async function say(text, ms = 1400) {
    caption.textContent = text
    caption.style.opacity = "1"
    await sleep(ms)
    caption.style.opacity = "0"
  }

  function hide() {
    cursor.style.opacity = "0"
    caption.style.opacity = "0"
  }

  // Await an app promise, but never for longer than `ms`: one promise that never
  // settles stalls the driver's bridge until the app is restarted.
  const within = (promise, ms = 4000) => Promise.race([promise, sleep(ms)])

  window.__demo = { sleep, within, moveTo, click, type, say, hide, resolve, centre }
}
