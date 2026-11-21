// "Running hot" break nudge (variant B, You 8 Nov): a small soft warm card with the tired buddy, a title, one plain sentence, the reset time as a chip and a "Got it" button.
// The top is PURE (decision, wording, the once-per-hour rule; numbers in, answer out) and tested in Node. The bottom builds the card with the app's h() (elements only, no inline styles).
// The pace rule is the one in rail.js (planAhead, which reads the server's pace.ts verdict), so there is no second rule. No sound, no vibration, no push, never blocks or moves the decision card.
import { planAhead } from "./rail.js";
import { poseUrl } from "./buddies.js";

export const HOT_KEY = "ko.hot";
export const HOUR_MS = 3600_000;
export const KBB_CAP_PCT = 45;     // kbb's short-term window at/near our cap
export const MANY_LOW = 3;         // this many AIs yellow/red (under 40% left, the existing buddy levels)
const YELLOW_BELOW = 40;

const num = (v) => typeof v === "number" && Number.isFinite(v);
const isShort = (label) => /5\s*h|hour/i.test(String(label || ""));
const planOf = (usage, id) => ((usage && usage.plans) || []).find((p) => p.id === id) || null;
const shortWin = (p) => ((p && p.windows) || []).find((w) => isShort(w.label)) || null;
const leftMin = (p) => { const l = ((p && p.windows) || []).map((w) => w.leftPct).filter(num); return l.length ? Math.min(...l) : null; };
const resetMs = (w) => { const t = w && w.resetsAt ? Date.parse(w.resetsAt) : NaN; return Number.isFinite(t) ? t : null; };

/** "20:30" in the phone's own time. */
export const hhmm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

/**
 * Is it hot, and why? Pure. Returns null when not hot, else { kind: "both"|"bothweek"|"km"|"kb"|"many", face: buddy id, resetAt: ms | null }.
 * Hot = (Kemino ahead of its week pace AND kbb's short window >= 45% used) OR 3+ AIs yellow/red. The wording follows the situation.
 */
export function hotSituation(usage, now = Date.now()) {
  const plans = (usage && usage.plans) || [];
  if (!plans.length) return null;
  const kem = planOf(usage, "claude"), kbb = planOf(usage, "claude_2");
  const km = !!kem && !kem.limited && planAhead(kem, now);
  const kbWeek = !!kbb && !kbb.limited && planAhead(kbb, now);   // kbb not 10+ points under its week pace (same rule as the queue gate)
  const kbw = shortWin(kbb);
  const kb = !!kbw && num(kbw.usedPct) && kbw.usedPct >= KBB_CAP_PCT;
  const low = plans.filter((p) => p.limited || p.limitedUntil || (leftMin(p) !== null && leftMin(p) < YELLOW_BELOW));
  const many = low.length >= MANY_LOW;
  if (!((km && (kb || kbWeek)) || many)) return null;
  const kind = km && kb ? "both" : km && kbWeek ? "bothweek" : km ? "km" : kb ? "kb" : "many";
  const faces = { both: "kemino", bothweek: "kemino", km: "kemino", kb: "kbb" };
  const face = faces[kind] || ({ claude: "kemino", claude_2: "kbb", codex: "codex", copilot: "copilot", antigravity: "antigravity" }[low[0] && low[0].id] || "kemino");
  const involved = kind === "many" ? low : kind === "kb" ? [kbb] : kind === "km" ? [kem] : [kem, kbb];
  const next = kind === "bothweek" ? undefined : involved.map((p) => resetMs(shortWin(p))).filter((t) => t !== null && t > now).sort((a, b) => a - b)[0];
  return { kind, face, resetAt: next ?? null };
}

/** The words: { title, text, chip } where chip is null when no reset time is known. Plain, no numbers, no jargon. */
export function hotWording(kind, resetAt) {
  const W = {
    both: ["You’ve been busy today ☕", "Kemino is a bit ahead for the week and kbb’s short-term limit is half used. Good moment for a break."],
    bothweek: ["You’ve been busy this week ☕", "Kemino and kbb are both ahead for the week. Small jobs only; a break would help."],
    km: ["You’ve been busy today ☕", "Kemino is a bit ahead for the week. Good moment for a break."],
    kb: ["Time for a breather? ☕", "kbb’s short-term limit is about half used. Good moment for a break."],
    many: ["Lots of AIs are tired today ☕", "Several of your AIs are running low. A break would help."],
  };
  const [title, text] = W[kind] || W.many;
  return { title, text, chip: num(resetAt) ? (kind === "many" ? "Only urgent jobs go through until " : "New jobs pick up again at ") + hhmm(resetAt) : null };
}

/** Once per hour: hidden for an hour after "Got it". `dismissedAt` is a ms timestamp or null/garbage. */
export function dueAgain(dismissedAt, now = Date.now()) { return !num(dismissedAt) || now - dismissedAt >= HOUR_MS || dismissedAt > now; }

export function readDismissed(storage = globalThis.localStorage) { try { const v = Number(storage.getItem(HOT_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; } }
export function writeDismissed(ms, storage = globalThis.localStorage) { try { storage.setItem(HOT_KEY, String(ms)); return true; } catch { return false; } }

/** The whole decision for one render: null (no card) or { ...situation, ...wording }. Pure but for the storage argument. */
export function hotModel(usage, { now = Date.now(), storage } = {}) {
  const s = hotSituation(usage, now);
  if (!s) return null;
  if (!dueAgain(readDismissed(storage), now)) return null;
  return { ...s, ...hotWording(s.kind, s.resetAt) };
}

/**
 * Testing aid, INERT in production: `?hot=1|km|kb|many` fakes a hot usage reading, but only on a page served from localhost on a port other than the live 4780
 * (the scratch instance runs there, TEST-ONLY). Anywhere else (the phone, the tailnet name, the live port) it returns null and nothing changes.
 */
export function forcedUsage(loc = globalThis.location, now = Date.now()) {
  try {
    if (!loc || !/^(localhost|127\.0\.0\.1)$/.test(loc.hostname) || !loc.port || loc.port === "4780") return null;
    const v = new URLSearchParams(loc.search).get("hot");
    if (!v) return null;
    const iso = (ms) => new Date(now + ms).toISOString();
    const km = { id: "claude", name: "Kemino", windows: [{ label: "5 hours", usedPct: 30, leftPct: 70, resetsAt: iso(3 * 3600_000) }, { label: "7 days", usedPct: 70, leftPct: 30, resetsAt: iso(5 * 86400_000) }] };
    const kbOk = { id: "claude_2", name: "kbb", windows: [{ label: "5 hours", usedPct: 20, leftPct: 80, resetsAt: iso(2 * 3600_000) }, { label: "7 days", usedPct: 10, leftPct: 90, resetsAt: iso(3 * 86400_000) }] };
    const kbHot = { ...kbOk, windows: [{ label: "5 hours", usedPct: 52, leftPct: 48, resetsAt: iso(100 * 60_000) }, kbOk.windows[1]] };
    const kmOk = { ...km, windows: [km.windows[0], { label: "7 days", usedPct: 20, leftPct: 80, resetsAt: iso(5 * 86400_000) }] };
    const low = (id, name) => ({ id, name, windows: [{ label: "Weekly", usedPct: 70, leftPct: 30, resetsAt: iso(2 * 86400_000) }] });
    const plans = v === "km" ? [km, kbOk, low("codex", "Codex"), low("copilot", "Copilot")]
      : v === "kb" ? [kmOk, kbHot, low("codex", "Codex"), low("copilot", "Copilot"), low("antigravity", "Antigravity")]
      : v === "many" ? [kmOk, kbOk, low("codex", "Codex"), low("copilot", "Copilot"), low("antigravity", "Antigravity")]
      : [km, kbHot];
    return { plans };
  } catch { return null; }
}

// ---------------- DOM (browser only) ----------------
let shown = false; // the fade-in plays when the card first appears, not on every re-render

/** The card, or null. h = the app's element builder. Re-renders keep it; "Got it" fades it out, remembers the hour, and removes it. */
export function hotCard({ h, usage, now = Date.now() }) {
  const m = hotModel(forcedUsage(undefined, now) || usage, { now });
  if (!m) { shown = false; return null; }
  const folder = (globalThis.KEMINO_BUDDY_FOLDERS && globalThis.KEMINO_BUDDY_FOLDERS[m.face]) || m.face;
  const card = h("section", { class: "hot-card" + (shown ? "" : " in"), "data-act": "hot", "aria-label": "A break would help" });
  const gotIt = h("button", { class: "hot-got", type: "button", onclick: () => {
    writeDismissed(Date.now());
    shown = false;
    card.classList.add("gone");
    setTimeout(() => card.remove(), 520);
  } }, "Got it");
  card.append(
    h("div", { class: "hot-hd" }, h("img", { class: "hot-face", src: poseUrl(folder, "tired"), alt: "" }), h("b", {}, m.title)),
    h("p", {}, m.text),
    h("div", { class: "hot-ft" }, m.chip ? h("span", { class: "hot-chip" }, m.chip) : h("span"), gotIt));
  shown = true;
  return card;
}
