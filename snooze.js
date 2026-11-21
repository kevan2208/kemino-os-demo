// Snooze ("Later"): a small sheet with the wake-time choices. T3 holds the snooze (src/snooze.ts, thread.snooze), so it survives restarts;
// this file only draws the choices and asks the server. Plain DOM calls only (CSP).
const HOUR = 3600_000;
const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

/** The quick choices, same rules as the server's presets: later today = +3 h, tomorrow 07:30, next Monday 07:30 (a Monday means the following one). Pure. */
export function presetChoices(now = Date.now()) {
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const mon = new Date(now); mon.setDate(mon.getDate() + (((8 - mon.getDay()) % 7) || 7));
  return [
    { id: "later-today", label: "Later today", until: now + 3 * HOUR },
    { id: "tomorrow", label: "Tomorrow 07:30", until: at(tomorrow, 7, 30).getTime() },
    { id: "monday", label: "Monday 07:30", until: at(mon, 7, 30).getTime() },
  ];
}

/** `<input type=datetime-local>` value ("2026-11-09T07:30", local time) for an epoch time, and back. */
export const toLocalInput = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); };
export const fromLocalInput = (v) => { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };

/** The pending-snooze map (instant feedback until the server's state arrives): a wake time counts for 15 s after the tap. Pure. */
export const PENDING_MS = 15_000;
export function pendingUntil(map, id, now = Date.now()) { const p = map[id]; return p && now - p.at < PENDING_MS && p.until > now ? p.until : 0; }

/**
 * Opens the sheet. `choose(until)` is called with a wake time (epoch ms) and returns a promise; the sheet closes when it settles.
 * Escape, the backdrop and Cancel close it without doing anything.
 */
export function openSnoozeSheet({ h, title, choose, now = Date.now() }) {
  const prev = document.activeElement;
  const close = () => { back.remove(); removeEventListener("keydown", onKey, true); if (prev && prev.focus) prev.focus(); };
  const go = (until) => { Promise.resolve(choose(until)).finally(close); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const when = h("input", { type: "datetime-local", class: "sz-when", "aria-label": "Pick a time", min: toLocalInput(now + 60_000), value: toLocalInput(now + 24 * HOUR) });
  const set = h("button", { class: "b m", "data-act": "snooze-pick", onclick: () => { const t = fromLocalInput(when.value); if (t) go(t); } }, "Set");
  const first = h("button", { class: "sz-opt", "data-act": "snooze-" + presetChoices(now)[0].id, onclick: () => go(presetChoices(now)[0].until) }, presetChoices(now)[0].label);
  const opts = presetChoices(now).slice(1).map((p) => h("button", { class: "sz-opt", "data-act": "snooze-" + p.id, onclick: () => go(p.until) }, p.label));
  const menu = h("div", { class: "sz-menu", role: "dialog", "aria-modal": "true", "aria-label": "Later" },
    h("h2", { class: "sz-h" }, "Later"), h("p", { class: "sz-t" }, title),
    h("div", { class: "sz-opts" }, first, opts),
    h("div", { class: "sz-pick" }, when, set),
    h("button", { class: "b m sz-x", onclick: close }, "Cancel"));
  const back = h("div", { class: "sz-back", onclick: (e) => { if (e.target === back) close(); } }, menu);
  addEventListener("keydown", onKey, true);
  document.body.append(back);
  first.focus();
  return { close };
}
