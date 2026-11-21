// Getting a new release without closing the app: check for one when the app comes back, quiet auto-update (no pill), swipe-down to refresh
// (Today, Office, Map: the scroller marked data-ptr="view"; a dialog's own scroller can opt in with data-ptr="dialog" and answers the "ptr:refresh" event).
// Pure decisions are exported (tested). The drawing uses createElement + classes only (CSP: no inline styles or handlers).
export const CHECK_GAP = 60_000, PULL_AT = 130, PULL_MAX = 110, TOP_SLOP = 2; // TOP_SLOP: px of rounding noise still counted as "at the top"

/** Check for a new service worker at most once per `gap` ms (force = pull-to-refresh, always). */
export const shouldCheck = (now, last, force = false, gap = CHECK_GAP) => force || !last || now - last >= gap;
/** Reloading is safe only when there is no unsent text, no sheet/dialog open and no question or permission waiting on screen. */
export const safeToReload = ({ draft = false, sheetOpen = false, questionOpen = false } = {}) => !draft && !sheetOpen && !questionOpen;
/**
 * The ONE decision for a ready update. "reload" now, "dot" (show the cyan dot on the (i) button + the info-sheet row) or "none".
 * hidden = the app just went to the background / is coming back (a quiet moment). Visible and safe: wait for the next hide/return, never reload mid-use.
 */
export const updateDecision = ({ pending = false, hidden = false, draft = false, sheetOpen = false, questionOpen = false } = {}) =>
  !pending ? "none" : !safeToReload({ draft, sheetOpen, questionOpen }) ? "dot" : hidden ? "reload" : "none";
/** Pull distance with resistance, capped; the finger moves 1 px, the indicator moves less. */
/** Is this visibilitychange a quiet moment to apply a waiting update? Hidden now: yes. Visible again: only after being away at least RETURN_AFTER ms. */
export const RETURN_AFTER = 3000;
export const quietMoment = ({ hidden = false, hiddenFor = 0 } = {}) => hidden || hiddenFor >= RETURN_AFTER;
export const pullDistance = (dy) => Math.max(0, Math.min(PULL_MAX, dy * 0.6));
export const pullReady = (dist) => dist >= PULL_AT * 0.5; // the finger has moved ~PULL_AT px
/** Indicator mode: idle (hidden), pull (not far enough yet), ready (release now), busy (refreshing). */
export const pullMode = (dist, busy = false) => (busy ? "busy" : dist <= 0 ? "idle" : pullReady(dist) ? "ready" : "pull");
const PULL_TEXT = { pull: "Pull to refresh", ready: "Release", busy: "Refreshing\u2026", done: "Up to date \u00b7 Live", offline: "Offline", updating: "Updating\u2026" };
/** The pill text. While busy it is honest about the connection: "Reconnecting…" when the live socket is not up. */
export const pullLabel = (mode, live = true) => (mode === "busy" && !live ? "Reconnecting\u2026" : PULL_TEXT[mode] || "");
/** How a refresh ended: a new version waits ("updating"), the connection is live ("done": up to date) or it is not ("offline"). */
export const outcomeOf = ({ update = false, live = false } = {}) => (update ? "updating" : live ? "done" : "offline");
/**
 * What a finished pull does (explicit "update now" gesture). Update waiting + safe: show "Updating…" and reload. Update waiting but NOT safe (draft, question, dialog):
 * no reload, the dot/rows are set, it ends as a normal refresh. Nothing waiting: "Up to date · Live" (or Offline).
 */
export const pullOutcome = ({ pending = false, live = false, safe = true } = {}) => ({
  mode: pending && safe ? "updating" : live ? "done" : "offline", reload: pending && safe, dot: pending && !safe });
/** How long the result stays on screen (ms): short for the good news; "updating" lasts until the reload. */
export const RESULT_MS = { done: 600, offline: 1200, updating: 600 };
export const HOLD = 100; // px the page is held open while it works: buddy 64 + gap 6 + pill 28 fit
/** The gap that opens while the finger drags: the buddy (64) + pill (28) + gaps need ~104 px, so the gap opens faster than the finger-driven distance (never past HOLD): the buddy is whole at "Release", not just its feet. */
export const gapFor = (d) => Math.min(HOLD, Math.max(0, d) * 1.6);
/** Which buddy picture each mode shows (buddy/<folder>/<name>.png; "working" also flips to working-b by CSS). */
export const spriteOf = (mode) => ({ ready: "needsyou", busy: "working", updating: "working", done: "done", offline: "idle" }[mode] || "idle");
/**
 * May a touch that starts here begin a pull? `target` is the kind of scroller under the finger: "view" (the main scroller: Today, Office, Map),
 * "dialog" (a dialog scroller that opted in) or null (anything else: chat, sheets, inner lists). The page must be at the top, nothing else busy,
 * `blocked` is true when an inner scroller / table / input under the finger should keep the gesture.
 */
export const pullBlockReason = ({ busy = false, touches = 1, target = null, scrollTop = 0, pageScroll = 0, dialogOpen = false, blocked = false } = {}) =>
  busy ? "busy" : touches !== 1 ? "multi-touch" : blocked ? "blocked (inner scroller, table or field)" : target === null ? "no ptr scroller"
  : scrollTop > TOP_SLOP ? "scrollTop>" + TOP_SLOP : pageScroll > TOP_SLOP ? "page scrolled" : target === "view" && dialogOpen ? "dialog open" : target !== "dialog" && target !== "view" ? "unknown target" : "";
export const canStartPull = (o = {}) => pullBlockReason(o) === "";
/** What a finger move means once a pull may start: "dead" (a sideways swipe or an upward move: not ours, until the next touch), "wait" (too small yet) or "pull". */
export const pullStep = ({ dx = 0, dy = 0, pulling = false, scrollTop = 0 } = {}) => {
  if (pulling) return "pull";
  if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) return "dead";
  if (dy < 0) return "dead";
  return dy < 10 || scrollTop > TOP_SLOP ? "wait" : "pull"; // same slop as canStartPull: iOS momentum can leave 1-2 px at the top
};

/**
 * deps: { h, draft(), sheetOpen(), questionOpen(), refreshData() (promise), reload(), conn() (optional), onPending(bool) (optional: the dot/row follow it) }
 * Returns { check, pending, reload }.
 */
export function initRefresh(deps) {
  const { h } = deps;
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
  let reg = null, last = 0, pending = false, busy = false;
  const state = (hidden) => ({ pending, hidden, draft: deps.draft(), sheetOpen: deps.sheetOpen(), questionOpen: deps.questionOpen ? deps.questionOpen() : false });

  /** Apply the decision at a quiet moment (hidden = going to the background or just back). */
  function decide(hidden) {
    const d = updateDecision(state(hidden));
    if (d === "reload") return deps.reload();
    if (deps.onPending) deps.onPending(pending && d === "dot");
  }
  function markPending() {
    if (pending) return;
    pending = true;
    // Visible: nothing automatic while he looks or types; the dot only appears when it is unsafe. Without an open thread there is no (i) button: no indicator, the update happens at the next hide/return when safe.
    decide(document.hidden);
  }
  let hiddenAt = 0;
  function onVisible() {
    if (document.hidden) hiddenAt = Date.now();
    // Going to the background: a quiet moment. Coming back: only after a real absence (a tab flicker or a focus blip is not a return; he is looking).
    if (pending && quietMoment({ hidden: document.hidden, hiddenFor: hiddenAt ? Date.now() - hiddenAt : 0 })) decide(true);
    if (!document.hidden) { hiddenAt = 0; check(false); }
  }
  function check(force) {
    if (!reg || !shouldCheck(Date.now(), last, force)) return Promise.resolve();
    last = Date.now();
    return Promise.resolve(reg.update()).catch(() => {}).then(() => settle());
  }
  /** After update(): give a new worker a moment to install, then see whether one is waiting or has taken over. */
  function settle() {
    const w = reg.installing;
    if (w && w.state !== "installed" && w.state !== "activated") {
      return new Promise((done) => { const t = setTimeout(done, 4000); w.addEventListener("statechange", () => { if (w.state === "installed" || w.state === "activated") { clearTimeout(t); done(); } }); });
    }
  }
  function watch(r) {
    reg = r;
    if (r.waiting && sw.controller) markPending();
    r.addEventListener("updatefound", () => {
      const w = r.installing;
      if (w) w.addEventListener("statechange", () => { if (w.state === "installed" && sw.controller) markPending(); });
    });
  }
  if (sw) {
    sw.getRegistration?.().then((r) => r && watch(r)).catch(() => {});
    // A new worker took over a page that an older one loaded: that page is stale.
    if (sw.controller) sw.addEventListener("controllerchange", markPending);
    sw.ready?.then((r) => { if (!reg) watch(r); }).catch(() => {});
  }
  document.addEventListener("visibilitychange", onVisible);
  document.addEventListener("input", () => { if (pending) decide(document.hidden); }); // typing starts while an update waits: the dot appears
  addEventListener("pagehide", () => { if (pending) decide(true); }); // best effort (iOS may skip it)

  // ---- swipe down to refresh (iOS standalone has none) ----
  // Smoothness (R17.1): while the finger drags NOTHING touches layout. The indicator is a fixed-size box; the buddy box and the page slide with translate3d only,
  // one write per frame (rAF-batched, latest finger position), no getBoundingClientRect/getComputedStyle per move (the gap's top is read once at touchstart).
  // The slide back is a CSS transition (compositor only). will-change lives only while a pull is active (class ptr-on).
  const folder = (globalThis.KEMINO_BUDDY_FOLDERS && globalThis.KEMINO_BUDDY_FOLDERS.kemino) || "kemino"; // the demo build maps it to a stand-in
  const SPRITES = ["idle", "needsyou", "working", "working-b", "done"];
  const imgs = SPRITES.map((n) => h("img", { class: "i-" + n, src: "buddy/" + folder + "/" + n + ".png", alt: "", draggable: "false" }));
  for (const im of imgs) im.decode?.().catch(() => {}); // decoded before the first pull: no flicker when a picture is swapped in
  const sparks = [0, 1, 2, 3, 4, 5].map((i) => {
    const sp = h("b", { class: "sp" }), a = (i / 6) * Math.PI * 2 + 0.4;
    sp.style.setProperty("--x", Math.round(Math.cos(a) * 40) + "px"); sp.style.setProperty("--y", Math.round(Math.sin(a) * 40) + "px");
    return sp;
  });
  const bud = h("div", { class: "ptr-b" }, ...imgs, ...sparks), txt = h("span", { class: "ptr-t" });
  const inner = h("div", { class: "ptr-in" }, bud, txt);
  const ind = h("div", { class: "ptr", role: "status", "aria-live": "polite" }, inner);
  document.body.appendChild(ind);
  // Where the browser knows overscroll-behavior (iOS 16+, Chrome) the scroller's own bounce is off, so the pull needs no preventDefault and touchmove can be passive.
  const passiveOK = typeof CSS !== "undefined" && !!CSS.supports && CSS.supports("overscroll-behavior-y", "none");
  if (passiveOK) document.documentElement.classList.add("ptr-noover");
  let isLive = true;
  const live = () => (deps.conn ? deps.conn() === "live" : true);
  let act = null, kids = [], easeT = 0, easing = false, textT = 0; // act: the scroller whose content slides down; kids: its children (one list), moved by transform
  const SETTLE_MS = 340;
  const setEase = (on) => { if (easing === on) return; easing = on; ind.classList.toggle("ptr-ease", on); act?.classList.toggle("ptr-ease", on); };
  const setText = (mode) => {
    const next = pullLabel(mode, isLive); clearTimeout(textT);
    if (txt.textContent === next) { txt.classList.remove("swap"); return; }
    if (!txt.textContent || mode === "pull" || mode === "ready" || mode === "idle") { txt.textContent = next; txt.classList.remove("swap"); return; }
    txt.classList.add("swap"); textT = setTimeout(() => { txt.textContent = next; txt.classList.remove("swap"); }, 110); // the result pill fades, it does not jump
  };
  let lookMode = "";
  const look = (mode) => { if (mode === lookMode) return; lookMode = mode; ind.dataset.img = spriteOf(mode); setText(mode); };
  /** One frame's worth of writes: transforms and (only on a change of mode) a class/text. */
  const show = (gap, mode, p = 0) => {
    const pullish = mode === "pull" || mode === "ready";
    if (mode !== "idle") { ind.classList.add("ptr-on"); act?.classList.add("ptr-on"); }
    setEase(!pullish);
    inner.style.setProperty("transform", "translate3d(0," + (gap - HOLD) + "px,0)");
    for (const k of kids) k.style.setProperty("transform", "translate3d(0," + gap + "px,0)");
    bud.style.setProperty("transform", pullish ? "scale(" + (1 - p * 0.15) + "," + (1 + p * 0.3) + ")" : "");
    ind.dataset.mode = mode;
    if (mode === "idle") { // slide back: keep the last picture and text until it has gone (no flicker), then reset
      const a = act, ks = kids; act = null; kids = []; clearTimeout(easeT);
      easeT = setTimeout(() => {
        if (act) return;
        a?.classList.remove("ptr-on", "ptr-ease"); for (const k of ks) k.style.removeProperty("transform");
        ind.classList.remove("ptr-on", "ptr-ease"); easing = false; inner.style.removeProperty("transform"); bud.style.removeProperty("transform");
        look("idle");
      }, SETTLE_MS + 30);
    } else look(mode);
  };
  const move = (d0, mode) => show(mode === "pull" || mode === "ready" ? gapFor(d0) : d0, mode, Math.min(1, gapFor(d0) / PULL_MAX));
  show(0, "idle");
  /** An inner scroller (sideways or scrolled down), a table, a code block or a field under the finger keeps the gesture. */
  const blockedBy = (t, scroller) => {
    if (t.closest("select, input, textarea, [contenteditable], .tablewrap, pre")) return true;
    for (let n = t; n && n !== scroller && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1 && n.scrollTop > 0) return true;
    }
    return false;
  };
  let sx = 0, sy = 0, el = null, kind = null, pulling = false, dead = false, wantDy = 0, frameQ = 0;
  const viewScroller = () => [...document.querySelectorAll('[data-ptr="view"]')].find((e) => e.offsetParent !== null) || null;
  document.addEventListener("touchstart", (e) => {
    el = null; pulling = false; dead = false; cancelAnimationFrame(frameQ); frameQ = 0;
    const t = e.target && e.target.closest ? e.target : null;
    let sc = t && t.closest("[data-ptr]");
    // The page header, the banners and the filter chip are part of the view too: a pull that starts there pulls the visible view's scroller.
    if (!sc && t && t.closest("#top, #banners, #fchip")) sc = viewScroller();
    const target = sc ? sc.getAttribute("data-ptr") : null;
    const why = pullBlockReason({ busy, touches: e.touches.length, target, scrollTop: sc ? sc.scrollTop : 0, pageScroll: document.scrollingElement?.scrollTop || 0, dialogOpen: deps.sheetOpen(), blocked: sc && t ? blockedBy(t, sc) : false });
    if (why) return;
    el = sc; kind = target; clearTimeout(easeT); act = sc; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    kids = sc.classList.contains("scroll") ? [...sc.children] : []; // a dialog card keeps its place; only the indicator shows
    ind.style.setProperty("--ptr-top", Math.max(0, sc.getBoundingClientRect().top) + "px"); // the ONE layout read of a pull
  }, { passive: true });
  const frame = () => { frameQ = 0; if (!pulling) return; const d = pullDistance(wantDy); move(d, pullMode(d)); };
  document.addEventListener("touchmove", (e) => {
    if (!el || dead) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    const step = pullStep({ dx, dy, pulling, scrollTop: el.scrollTop });
    if (step === "dead") { dead = true; return; }
    if (step === "wait") return;
    pulling = true;
    if (!passiveOK && e.cancelable) e.preventDefault();
    wantDy = dy; if (!frameQ) frameQ = requestAnimationFrame(frame); // latest finger position, one write per frame
  }, { passive: passiveOK });
  const end = async () => {
    if (!pulling) return;
    cancelAnimationFrame(frameQ); frameQ = 0;
    const ready = pullMode(pullDistance(wantDy)) === "ready", sc = el, k = kind;
    pulling = false; el = null;
    if (!ready) { move(0, "idle"); return; }
    busy = true; isLive = live(); move(HOLD, "busy");
    let out = pullOutcome({ live: isLive });
    try {
      const jobs = [new Promise((r) => setTimeout(r, 700))];
      if (k === "dialog") { // a dialog refreshes only what it shows: it answers the event with the promises of its reloads
        const wait = []; sc.dispatchEvent(new CustomEvent("ptr:refresh", { bubbles: true, detail: { wait } }));
        jobs.push(...wait.map((p) => Promise.resolve(p).catch(() => {})));
      } else jobs.push(check(true), Promise.resolve(deps.refreshData()).catch(() => {}));
      await Promise.all(jobs);
      isLive = live();
      out = pullOutcome({ pending: !!(pending || reg?.waiting), live: isLive, safe: safeToReload(state(false)) });
    } finally {
      busy = false;
      move(HOLD, out.mode); await new Promise((r) => setTimeout(r, RESULT_MS[out.mode]));
      move(0, "idle");
    }
    if (out.dot) { pending = true; if (deps.onPending) deps.onPending(true); }
    if (out.reload) deps.reload();
  };
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", () => { if (pulling) { cancelAnimationFrame(frameQ); frameQ = 0; pulling = false; el = null; move(0, "idle"); } });
  return { check, reload: () => deps.reload(), get pending() { return pending; } };
}
