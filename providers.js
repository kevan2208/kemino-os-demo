// Providers: a READ-ONLY sheet that shows what T3 knows about each AI (signed in or not, status, version, usage, models and their effort options).
// Nothing here changes anything: no sign-in, no sign-out, no install, no credits. Changing a setting happens in T3 (the note at the bottom says so).
// The server (src/providers.ts) already whitelists, masks and caps every field; this file only draws. No innerHTML, no inline script or style (CSP).
import { buddyOfInstance, captionOf, clockText, leftOf, noReadingFor } from "./buddies.js";

/** A SHAPE for each status kind, so the state is never told by colour alone. */
export const GLYPH = { ready: "●", signedout: "○", warning: "▲", error: "✕", disabled: "–", notinstalled: "–", unknown: "?" };
export const glyphOf = (kind) => GLYPH[kind] || GLYPH.unknown;

/** The usage lines under a name, exactly as the buddies row writes them ("5h 94%", "wk 39%", "back 18:29"), plus "limited until HH:MM". Pure. */
export function usageLines(p, now = new Date(), usageView = null) {
  const u = p.usage;
  if (!u) return [{ text: noReadingFor(p.instanceId, usageView, "no usage reading"), tone: "ok" }]; // the same note Today shows
  const b = buddyOfInstance(p.instanceId);
  const plan = { windows: u.windows, limited: u.limited, limitedUntil: u.limitedUntil };
  const lines = captionOf({ id: b ? b.id : "", name: p.displayName, plan, left: leftOf(plan) }, now).lines;
  if (u.limitedUntil) return [{ text: "limited until " + clockText(u.limitedUntil, now), tone: "low" }];
  return u.limited ? [{ text: "limited", tone: "low" }, ...lines] : lines;
}
/** "T3 says: 5h 45% left, wk 30% left": shown only when the server found T3 and Kemino far apart. "" otherwise. Pure. */
export function t3SaysText(p) {
  const w = (p.t3Says || []).map((x) => (x.slot || x.label) + " " + Math.round(x.leftPercent) + "% left");
  return w.length ? "T3 says: " + w.join(", ") : "";
}
/** One model line: "Claude Opus 5.5 · effort: Low, High". Pure. */
export const modelLine = (m) => m.name + (m.efforts && m.efforts.length ? " · " + m.efforts.map((e) => (e.id === "reasoningEffort" ? "effort" : e.id === "thinking_level" ? "thinking" : e.id) + ": " + e.values.join(", ")).join(" · ") : "");
/** The account line: label and masked email, e.g. "Claude Max · a•••@example.org", or "Signed out". Pure. */
export function accountLine(p) {
  const a = p.auth || {};
  const bits = [a.label || a.type, a.email].filter(Boolean);
  if (bits.length) return bits.join(" · ");
  return a.status === "unauthenticated" ? "Not signed in" : "Account not shown by T3";
}
/** The honest line when T3 did not answer. null when the reading is fresh. Pure. */
export function staleLine(view, now = new Date()) {
  if (view.unavailable) return "T3 did not answer, and there is no earlier reading.";
  return view.stale ? "T3 did not answer; showing the last reading from " + clockText(view.readAt, now) + "." : null;
}
/** "Not set up" entries that are not already listed above under the same name (T3 may list one AI under two ids: Copilot). Pure. */
export const notSetUpOnly = (view) => { const have = new Set((view.providers || []).map((p) => String(p.displayName || "").toLowerCase())); return (view.notSetUp || []).filter((n) => !have.has(String(n.name || "").toLowerCase())); };
/** The folded line for AIs that are switched off. Pure. */
export const notEnabledLine = (names) => (names && names.length ? "Not enabled: " + names.join(", ") : "");
/** Where to change anything: T3 has no deep link into its settings from outside (only thread links), so this is plain words. */
export const CHANGE_NOTE = "Change provider settings in T3 (Settings → Providers).";

const folderOf = (id) => (globalThis.KEMINO_BUDDY_FOLDERS && globalThis.KEMINO_BUDDY_FOLDERS[id]) || id;
const faceOf = (h, instanceId, pose) => {
  const b = buddyOfInstance(instanceId);
  return b ? h("img", { class: "pv-face", src: "buddy/" + folderOf(b.id) + "/" + pose + ".png", alt: "", width: "40", height: "40" }) : h("span", { class: "pv-face blank" });
};

function card(h, p, now, usageView) {
  const st = p.status;
  const lines = usageLines(p, now, usageView), says = t3SaysText(p);
  const pose = st.kind === "ready" ? "idle" : st.kind === "disabled" ? "asleep" : "tired";
  const models = p.models || [];
  return h("section", { class: "pv-card", "data-ai": p.instanceId },
    h("div", { class: "pv-top" }, faceOf(h, p.instanceId, pose),
      h("div", { class: "pv-name" }, h("b", {}, p.displayName), h("span", { class: "pv-acct" }, accountLine(p)))),
    h("p", { class: "pv-status", "data-kind": st.kind }, h("span", { class: "pv-glyph", "aria-hidden": "true" }, glyphOf(st.kind)), " " + st.word + (p.version ? " · v" + p.version : "")),
    h("p", { class: "pv-use" }, lines.map((l) => h("span", { class: "pv-u " + (l.tone || "ok") }, l.text))),
    says ? h("p", { class: "pv-says" }, says) : null,
    models.length ? h("details", { class: "pv-models" }, h("summary", {}, "Models (" + models.length + ")"),
      h("ul", {}, models.map((m) => h("li", {}, modelLine(m))))) : h("p", { class: "pv-none" }, "No models listed"),
    h("p", { class: "pv-note" }, CHANGE_NOTE));
}

export function openProviders({ h, toLogin }) {
  if (document.querySelector(".pv-wrap")) return;
  const body = h("div", { class: "pv-body" }, h("p", { class: "pv-none" }, "Loading…"));
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap pv-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Providers", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card pv-sheet" },
      h("div", { class: "np-head" }, h("strong", {}, "Providers"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      h("p", { class: "pv-lead" }, "What T3 knows about each AI. Read-only."),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);

  (async () => {
    let kids;
    try {
      const [r, ur] = await Promise.all([fetch("/api/providers"), fetch("/api/usage").catch(() => null)]);
      const usageView = ur && ur.ok ? await ur.json().catch(() => null) : null;
      if (r.status === 401) { close(); return toLogin(); }
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error || "could not load (" + r.status + ")");
      const now = new Date(), stale = staleLine(v, now), off = notEnabledLine(v.notEnabled);
      kids = [
        stale ? h("p", { class: "pv-stale", role: "status" }, h("span", { "aria-hidden": "true" }, "▲ "), stale) : null,
        (v.providers || []).map((p) => card(h, p, now, usageView)),
        notSetUpOnly(v).map((n) => h("section", { class: "pv-card pv-off", "data-ai": n.instanceId },
          h("div", { class: "pv-top" }, faceOf(h, n.instanceId, "asleep"), h("div", { class: "pv-name" }, h("b", {}, n.name), h("span", { class: "pv-acct" }, "Not set up in T3"))))),
        off ? h("p", { class: "pv-folded" }, off) : null];
    } catch (e) { kids = [h("p", { class: "pv-stale", role: "status" }, h("span", { "aria-hidden": "true" }, "✕ "), "Could not read providers: " + e.message)]; }
    body.replaceChildren(...kids.flat().filter(Boolean));
  })();
}
