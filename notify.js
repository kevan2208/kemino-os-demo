// Notifications panel: turn phone notifications on/off, send a test, choose quiet hours and brief times.
// Everything that asks the browser for permission runs from a tap (iOS requires it). No innerHTML, no inline script or style (CSP).
// The server decides WHEN to push; this file only subscribes this device and edits the settings.

const KINDS = [["needs-you", "Needs you"], ["failed", "A thread failed"], ["morning", "Morning brief"], ["evening", "Evening wrap"], ["weekly", "Weekly review (Sunday)"]];

/** VAPID public key (URL-safe base64) -> bytes for pushManager.subscribe. */
export function keyToBytes(s) {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
/** { ok: true } or { ok: false, why, text }. On iPhone a Safari tab cannot receive pushes: the app must be on the Home Screen. */
export function support() {
  if (isIos() && !isStandalone()) return { ok: false, why: "homescreen", text: "Add Kemino OS to your Home Screen first: in Safari tap Share, then Add to Home Screen. Then open it from the new icon and come back here." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return { ok: false, why: "unsupported", text: "This browser cannot show notifications. On iPhone you need iOS 16.4 or newer, with Kemino OS on the Home Screen." };
  return { ok: true };
}

async function registration() {
  return Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error("The app is still starting. Try again in a moment.")), 5000))]);
}

/** Opens the panel. deps: { h, post(path, body, event), toast(msg, isError) }. */
export function openNotifyPanel({ h, post, toast, opener: from }) {
  if (document.querySelector(".np-wrap")) return;
  const opener = from || document.activeElement; // focus returns here on close (the bell, or the Menu button when it was opened from the Menu)
  const body = h("div", { class: "np-body" });
  const close = () => {
    wrap.remove(); removeEventListener("keydown", onKey, true);
    const live = () => (opener?.isConnected && opener !== document.body ? opener : opener?.dataset?.act ? document.querySelector('[data-act="' + opener.dataset.act + '"]') : opener?.dataset?.tab ? document.querySelector('[data-tab="' + opener.dataset.tab + '"]') : null) || document.querySelector('[data-act="more"]') || document.querySelector('[data-tab="more"]');
    const t0 = Date.now(), tryFocus = () => { const a = document.activeElement; if ((!a || a === document.body) && !document.querySelector(".np-wrap")) { try { live()?.focus({ preventScroll: true }); } catch { /* gone */ } } if (Date.now() - t0 < 1500) setTimeout(tryFocus, 150); };
    setTimeout(tryFocus, 30);
  };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Notifications", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card" },
      h("div", { class: "np-head" }, h("strong", {}, "Notifications"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);
  wrap.querySelector(".np-x").focus({ preventScroll: true });

  let busy = false;
  const guard = (fn) => async (e) => {
    if (busy) return;
    busy = true;
    try { await fn(e); } catch (err) { toast(err.message || "Something went wrong.", true); } finally { busy = false; render(); }
  };

  async function load() {
    const sup = support();
    const out = { sup, perm: "default", sub: null, server: null, error: "" };
    if (!sup.ok) return out;
    out.perm = Notification.permission;
    try { out.sub = await (await registration()).pushManager.getSubscription(); } catch (e) { out.error = e.message; }
    try {
      const r = await fetch("/api/push/settings");
      if (r.status === 401) { location.replace("login.html"); return out; }
      if (r.status === 503) out.error = "Notifications are not set up on the Mac (the server was started with KEMINO_PUSH=0).";
      else if (r.ok) out.server = await r.json();
    } catch { out.error = "Cannot reach Kemino right now."; }
    return out;
  }

  const enable = guard(async (e) => {
    const perm = await Notification.requestPermission(); // first thing in the tap: iOS only asks from a gesture
    if (perm !== "granted") throw new Error("Notifications are blocked. Allow them in iPhone Settings > Notifications > Kemino OS.");
    const reg = await registration();
    const k = await fetch("/api/push/key");
    if (!k.ok) throw new Error("The Mac has no notification key yet.");
    const { publicKey } = await k.json();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }); }
      catch (err) { throw new Error("Could not subscribe: " + (err.message || err.name)); }
    }
    await post("/api/push/subscribe", { subscription: sub.toJSON(), label: isIos() ? "iPhone" : "Browser" }, e); // also re-links an existing subscription to this login
    toast("Notifications are on.");
  });
  const disable = guard(async (e) => {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) { const endpoint = sub.endpoint; await sub.unsubscribe(); await post("/api/push/unsubscribe", { endpoint }, e); }
    toast("Notifications are off on this phone.");
  });
  const test = guard(async (e) => {
    const r = await post("/api/push/test", {}, e);
    toast(r.sent ? "Test sent. It should appear in a few seconds." : "The push service did not accept it.", !r.sent);
  });
  const save = (patch, e) => guard(async (ev) => { await post("/api/push/settings", { settings: patch }, ev); })(e);

  function field(label, input) { return h("label", { class: "np-row" }, h("span", {}, label), input); }
  function check(label, on, onChange) { return field(label, h("input", { type: "checkbox", checked: on || null, onchange: (e) => onChange(e.target.checked, e) })); }
  function time(label, value, onChange) { return field(label, h("input", { type: "time", value, required: "", onchange: (e) => { if (e.target.value) onChange(e.target.value, e); } })); }

  async function render() {
    const st = await load();
    if (!wrap.isConnected) return;
    const kids = [];
    if (!st.sup.ok) kids.push(h("p", { class: "np-note" }, st.sup.text));
    else if (st.error) kids.push(h("p", { class: "np-note err" }, st.error));
    else {
      const on = !!st.sub && st.perm === "granted" && (st.server?.subscribed ?? 0) > 0;
      if (st.perm === "denied") kids.push(h("p", { class: "np-note err" }, "Notifications are blocked for Kemino OS. Allow them in iPhone Settings > Notifications > Kemino OS, then come back."));
      kids.push(h("p", { class: "np-state" }, h("i", { class: on ? "on" : "" }), on ? "On for this phone" : "Off for this phone"));
      kids.push(h("div", { class: "np-actions" },
        on ? h("button", { class: "np-btn", onclick: test }, "Send test") : h("button", { class: "np-btn go", onclick: enable }, "Turn on notifications"),
        on ? h("button", { class: "np-btn", onclick: disable }, "Turn off") : null));
      const s = st.server?.settings;
      if (s) {
        kids.push(h("h3", {}, "What to send"));
        for (const [k, label] of KINDS) kids.push(check(label, s.enabled[k], (v, e) => save({ enabled: { [k]: v } }, e)));
        kids.push(h("h3", {}, "Quiet hours"));
        kids.push(check("Hold notifications at night", s.quiet.on, (v, e) => save({ quiet: { on: v } }, e)));
        kids.push(time("From", s.quiet.start, (v, e) => save({ quiet: { start: v } }, e)));
        kids.push(time("Until", s.quiet.end, (v, e) => save({ quiet: { end: v } }, e)));
        kids.push(h("h3", {}, "Daily briefs"));
        kids.push(time("Morning brief", s.morningAt, (v, e) => save({ morningAt: v }, e)));
        kids.push(time("Evening wrap", s.eveningAt, (v, e) => save({ eveningAt: v }, e)));
        kids.push(time("Weekly review (Sundays)", s.weeklyAt || "18:30", (v, e) => save({ weeklyAt: v }, e)));
        kids.push(h("p", { class: "np-note" }, "Times are the Mac's clock. Held notifications arrive as one summary when quiet hours end. Notifications only come while the Mac is on and Kemino is running."));
      }
    }
    body.replaceChildren(...kids.filter(Boolean));
  }
  render();
}
