// The ledger line ("Today: 6 asks · ~12% of Kemino used by 12 jobs", from /api/ledger) now lives in More → Insights → Ledger, not on the home.
// "Last heard from T3" shows on the home only when T3 has been silent for more than 5 minutes (one red line).
// Pure text. No HTML, no inline style.

export const HEARD_RED_MS = 5 * 60_000;
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

/** `led` is the /api/ledger answer, or null. Empty string = nothing to show yet. */
export function todayLine(led) {
  const t = led && led.today;
  if (!t || typeof t.asks !== "number") return "";
  const parts = ["Today: " + plural(t.asks, "ask", "asks")];
  if (t.jobs > 0) {
    const pct = typeof t.keminoPoints === "number" ? "~" + (Math.round(t.keminoPoints * 10) / 10) + "% of Kemino used by " : "";
    parts.push(pct + plural(t.jobs, "job", "jobs"));
  } else parts.push("no jobs finished");
  return parts.join(" · ");
}

/** True when the day's cap for unattended runs is used up (Kemino only: it is the plan the line shows). */
export function capReached(led) {
  const cap = led && led.cap && led.cap.pct, used = led && led.today && led.today.keminoPoints;
  return typeof cap === "number" && cap > 0 && typeof used === "number" && used >= cap;
}

const minutes = (ms) => Math.max(0, Math.floor(ms / 60_000));
/** { text, red }. `lastHeard` is epoch ms from the server (0 or missing = never). */
export function heardLine(lastHeard, now) {
  if (!lastHeard) return { text: "Not heard from T3 yet", red: true };
  const ms = now - lastHeard, m = minutes(ms);
  const text = "Last heard from T3: " + (ms < 45_000 ? "just now" : m < 60 ? m + " min ago" : Math.floor(m / 60) + " h ago");
  return { text, red: ms > HEARD_RED_MS };
}

/** Insights tab "Ledger": today's line, the daily cap, and the last days. Counts only. */
export const ledgerTab = {
  id: "ledger", label: "Ledger", path: "/api/ledger?days=7",
  draw(j, { h }) {
    const line = todayLine(j), rows = (j.perDay || []).slice(-7).reverse();
    return [
      h("p", { class: "au-note", "data-line": "ledger" }, line || "Nothing counted yet today.", capReached(j) ? " Daily cap for unattended runs reached." : ""),
      rows.length ? h("ul", { class: "lg-days" }, rows.map((d) => h("li", {}, h("b", {}, d.day), " · " + plural(d.asks || 0, "ask", "asks") + " · " + plural(d.jobs || 0, "job", "jobs") + (d.failed ? " · " + d.failed + " failed" : "")))) : null,
    ];
  },
};
