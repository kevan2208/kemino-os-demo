// The Google card (More > Google): connection status, Connect / Reconnect / Disconnect, which parts are allowed, and the saved-files list.
// Read-only Mail, Calendar and Drive. The server (src/google/*) does everything; this file only draws.
// All text goes in as text nodes (mail file names and senders come from outside): no innerHTML, no inline script or style (CSP).

const PARTS = [["mail", "Mail"], ["calendar", "Calendar"], ["drive", "Drive"]];
/** "1.4 MB", "820 KB". Pure. */
export const sizeText = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
/** One plain sentence for the state. Pure. */
export function stateText(s) {
  if (!s) return "Loading…";
  if (!s.enabled) return "Off. Switch it on in Features (Main screen) first.";
  if (s.state === "not-connected") return s.clientConfigured ? "Not connected." : "Waiting for the Google client (client.json) before it can connect.";
  if (s.state === "reconnect") return "Google needs you to sign in again.";
  if (s.state === "partial") return "Connected, but not everything was allowed.";
  return "Connected" + (s.email ? " as " + s.email : "") + ".";
}
/** The result Kemino was opened with after Google sent the browser back (?google=...). Pure. */
export const resultText = (r) => ({ connected: "Google connected (read-only).", partial: "Google connected, but not everything was allowed.", denied: "Nothing was allowed, so nothing was connected.", error: "Google sign-in did not finish. Try again." })[r] || "";

/** deps: { h, post, del, toast, toLogin }. */
export function openGoogle({ h, post, del, toast, toLogin }) {
  if (document.querySelector(".gg-wrap")) return;
  const body = h("div", { class: "ft-body" }, h("p", { class: "ft-note" }, "Loading…"));
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap ft-wrap gg-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Google", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card ft-card" },
      h("div", { class: "np-head" }, h("strong", {}, "Google (read-only)"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      h("p", { class: "ft-note" }, "Kemino can only look: Mail, Calendar and Drive. It never sends, changes or deletes anything there."),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);

  async function get(path) {
    const r = await fetch(path);
    if (r.status === 401) { toLogin(); throw new Error("Logged out."); }
    return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
  }
  async function load() {
    try {
      const s = await get("/api/google/status");
      draw(s.j, s.j.enabled && s.j.state !== "off" ? (await get("/api/google/files")).j.files || [] : []);
    } catch (err) { body.replaceChildren(h("p", { class: "ft-note err" }, err.message)); }
  }
  async function act(fn, e, done) {
    try { const j = await fn(e); if (done) done(j); else await load(); }
    catch (err) { toast(err.message, true); }
  }
  function draw(s, files) {
    const btn = (label, cls, fn) => h("button", { class: "b " + cls, "data-act": label.toLowerCase().split(" ")[0], onclick: (e) => fn(e) }, label);
    const connect = (label) => btn(label, "y", (e) => act((ev) => post("/api/google/connect", {}, ev), e, (j) => { location.href = j.url; }));
    const actions = [];
    if (s.enabled && s.state === "not-connected" && s.clientConfigured) actions.push(connect("Connect Google (read-only)"));
    if (s.enabled && (s.state === "reconnect" || s.state === "partial")) actions.push(connect("Reconnect Google"));
    if (s.enabled && s.state !== "not-connected" && s.state !== "off") actions.push(btn("Disconnect", "m", (e) => act((ev) => post("/api/google/disconnect", {}, ev), e)));
    const parts = s.enabled && s.state !== "not-connected" ? PARTS.map(([k, label]) => h("span", { class: "gg-part", "data-part": k, "data-on": s.allowed && s.allowed[k] ? "1" : "0" }, (s.allowed && s.allowed[k] ? "✓ " : "✕ ") + label + (s.allowed && s.allowed[k] ? "" : " not allowed"))) : [];
    const fileRows = files.map((f) => h("div", { class: "ft-row gg-file", "data-file": f.id },
      h("div", { class: "ft-t" }, h("b", {}, f.name), h("small", {}, sizeText(f.size) + " · " + (f.sender || f.source) + " · " + String(f.date || "").slice(0, 10))),
      h("a", { class: "b m", href: "/api/google/files/" + f.id + "/download", "aria-label": "Download " + f.name }, "Download"),
      h("button", { class: "b m", "aria-label": "Delete " + f.name, onclick: (e) => act((ev) => del("/api/google/files/" + f.id, ev), e) }, "Delete")));
    const old = s.files && s.files.old && s.files.old.count ? h("p", { class: "ft-note" }, s.files.old.count + " saved file" + (s.files.old.count === 1 ? " is" : "s are") + " older than 90 days (" + sizeText(s.files.old.bytes) + "). Delete the ones you do not need.") : null;
    body.replaceChildren(...[
      h("div", { class: "ft-row gg-status", "data-state": s.state }, h("div", { class: "ft-t" }, ...[h("b", {}, stateText(s)), s.lastError ? h("small", {}, "Last problem: " + s.lastError) : null].filter(Boolean))),
      parts.length ? h("div", { class: "gg-parts" }, parts) : null,
      actions.length ? h("div", { class: "gg-actions" }, actions) : null,
      s.enabled && s.state !== "not-connected" ? h("h3", {}, "Saved files") : null,
      s.enabled && s.state !== "not-connected" ? (fileRows.length ? fileRows : h("p", { class: "ft-note" }, "No saved files yet.")) : null,
      old].flat().filter(Boolean));
  }
  load();
}
