// The feature freeze: which parts sit in the main navigation and which wait behind "More", plus the Features screen that switches them.
// The server (flags.ts) is the source of truth; this list only supplies the defaults used until /api/flags has answered.
// No innerHTML, no inline script or style (CSP).

export const FEATURES = [
  { key: "today", label: "Today", locked: true, main: true },
  { key: "chat", label: "Chat", locked: true, main: true },
  { key: "approve", label: "Approve", locked: true, main: true },
  { key: "brief", label: "Brief", locked: false, main: true },
  { key: "office", label: "Office", locked: false, main: true },
  { key: "notifications", label: "Notifications", locked: false, main: true },
  { key: "map", label: "Map", locked: false, main: false },
  { key: "automations", label: "Automations", locked: false, main: false },
  { key: "queue", label: "Queue", locked: false, main: false },
  { key: "insights", label: "Insights", locked: false, main: false },
  { key: "decisions", label: "Decisions", locked: false, main: false },
  { key: "tidy", label: "Tidy", locked: false, main: false },
  { key: "stop-today", label: "Stop for today", locked: false, main: false },
  { key: "apps", label: "Apps", locked: false, main: false },
  { key: "skills", label: "Skills", locked: false, main: false },
  { key: "weekly", label: "Weekly review", locked: false, main: false },
  { key: "hours", label: "Hours", locked: false, main: false },
  { key: "code", label: "Code", locked: false, main: false },
  { key: "google", label: "Google (read-only)", locked: false, main: false },
];

/** `flags` is the `features` array of /api/flags (or null before it loaded). Unknown keys count as not main. */
export function isMain(flags, key) {
  const f = Array.isArray(flags) ? flags.find((x) => x.key === key) : null;
  if (f) return f.main === true;
  return FEATURES.find((x) => x.key === key)?.main === true;
}

/** Features that have no home of their own on a phone (the capsule only has list/office/map and the bell). */
export const PHONE_NO_HOME = new Set(["automations", "queue", "insights", "decisions", "tidy", "stop-today", "apps", "skills", "weekly", "hours", "code", "google"]);

/**
 * What the More menu lists: `shortcuts` = promoted features that a phone could not reach otherwise, `more` = everything not in the main navigation.
 * Locked features are never listed (they are always on screen).
 */
export function menuGroups(flags) {
  const optional = FEATURES.filter((f) => !f.locked);
  return {
    shortcuts: optional.filter((f) => isMain(flags, f.key) && PHONE_NO_HOME.has(f.key)),
    // Google is an off-by-default switch: while off its card is absent from More (turn it on in Features).
    more: optional.filter((f) => !isMain(flags, f.key) && f.key !== "google"),
  };
}

/** "3 taps in 30 days" for a Features row. */
export const tapText = (n) => (n ? n + (n === 1 ? " tap" : " taps") + " in 30 days" : "not used in 30 days");

/**
 * The Features screen. deps: { h, post, toast, toLogin }, onChange(features): called after a switch so the page can redraw.
 * Each row switches one feature between "main screen" and "behind More"; locked rows are always on. The last row is the daily cap.
 */
export function openFeatures({ h, post, toast, toLogin }, onChange) {
  if (document.querySelector(".ft-wrap")) return;
  const body = h("div", { class: "ft-body" }, h("p", { class: "ft-note" }, "Loading…"));
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap ft-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Features", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card ft-card" },
      h("div", { class: "np-head" }, h("strong", {}, "Features"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      h("p", { class: "ft-note" }, "Choose what stays on the main screen. Everything else stays one tap away under More."),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);

  let data = null;
  async function load() {
    try {
      const r = await fetch("/api/flags");
      if (r.status === 401) return toLogin();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "could not load (" + r.status + ")");
      data = j; draw(); onChange?.(j.features);
    } catch (err) { body.replaceChildren(h("p", { class: "ft-note err" }, err.message)); }
  }
  async function set(key, value, e) {
    try { await post("/api/flags", { key, value }, e); await load(); }
    catch (err) { toast(err.message, true); }
  }
  async function setCap(input, e) {
    const n = Number(input.value);
    try { await post("/api/flags", { cap: n }, e); toast(n > 0 ? "Daily cap: " + n + " points" : "Daily cap off"); await load(); }
    catch (err) { toast(err.message, true); }
  }
  function draw() {
    const rows = data.features.map((f) => h("div", { class: "ft-row", "data-feature": f.key },
      h("div", { class: "ft-t" }, h("b", {}, f.label), h("small", {}, f.hint + " · " + tapText(f.taps30))),
      f.locked ? h("span", { class: "ft-lock" }, "Always on")
        : h("button", { class: "b " + (f.main ? "y" : "m"), "aria-pressed": f.main ? "true" : "false", "data-act": "flag", "aria-label": f.label + (f.main ? ": on the main screen" : ": behind More"), onclick: (e) => set(f.key, !f.main, e) }, f.main ? "Main screen" : "Behind More")));
    const cap = h("input", { type: "number", min: "0", max: "100", step: "1", value: String(data.cap.pct), "aria-label": "Daily cap in points", class: "ft-cap-in" });
    body.replaceChildren(...rows, h("div", { class: "ft-row ft-cap", "data-feature": "cap" },
      h("div", { class: "ft-t" }, h("b", {}, "Daily cap for unattended runs"),
        h("small", {}, "The queue starts no new job once a plan has used this many points of its weekly window today. 0 = no cap. Default " + data.cap.default + ".")),
      cap, h("button", { class: "b m", "data-act": "cap", onclick: (e) => setCap(cap, e) }, "Save")));
  }
  load();
}
