// Personal bills: pure helpers (words, grouping, the Today line). No DOM, no network; tested in Node.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const rs = (n) => "Rs " + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
/** "2026-11-14" -> "14 Nov". */
export const dayText = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); return m ? +m[3] + " " + MON[+m[2] - 1] : ""; };
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
/** How far away a due date is, in plain words: "today", "tomorrow", "in 3 days", "yesterday", "2 days late". */
export function whenText(days) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days < 0 ? plural(-days, "day") + " late" : "in " + days + " days";
}
/** Colour band of the due tag: hot = late or within 3 days, soon = within 7. */
export const urgency = (b) => (b.paid ? "" : b.days <= 3 ? "hot" : b.days <= 7 ? "soon" : "");
/** { open, next, after, paid, owed, paidCount }: `next` is the first open bill (the card in front), `after` the rest, by due date. */
export function groupBills(bills) {
  const list = Array.isArray(bills) ? bills : [];
  const open = list.filter((b) => !b.paid), paid = list.filter((b) => b.paid);
  return { open, next: open[0] || null, after: open.slice(1), paid, owed: open.reduce((a, b) => a + (b.amount || 0), 0), paidCount: paid.length };
}
/** "5 to pay · Rs 22,730 still to go" (the amount only when some bill has one). */
export function summaryText(g) {
  if (!g.open.length) return g.paid.length ? "All paid. Nice." : "";
  return g.open.length + " to pay" + (g.owed > 0 ? " · " + rs(g.owed) + " still to go" : "");
}
/** Today's one quiet line, or "" when nothing is open. "Rent is due in 3 days · 2 more this week". */
export function billsLine(bills) {
  const open = (Array.isArray(bills) ? bills : []).filter((b) => !b.paid);
  if (!open.length) return "";
  const f = open[0];
  const verb = f.days < 0 ? "was due " + (f.days === -1 ? "yesterday" : -f.days + " days ago") : f.days === 0 ? "is due today" : f.days === 1 ? "is due tomorrow" : "is due in " + f.days + " days";
  const more = open.filter((b) => b.days <= 7).length - (f.days <= 7 ? 1 : 0);
  return f.name.replace(/\s*\([^)]*\)\s*$/, "") + " " + verb + (more > 0 ? " · " + more + " more this week" : "");
}
/** Whole days between two YYYY-MM-DD strings. */
export const daysBetween = (a, b) => { const p = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000; }; return Math.round(p(b) - p(a)); };
/** Typed form values -> the body the server wants. Empty amount = none. Returns { body } or { error }. */
export function formBody(v) {
  const name = String(v.name || "").replace(/\s+/g, " ").trim();
  if (!name) return { error: "Give the bill a name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.due || ""))) return { error: "Pick a due date." };
  const a = String(v.amount ?? "").replace(/[\s,]/g, "").replace(/^rs/i, "");
  if (a && !/^\d{1,12}(\.\d{1,2})?$/.test(a)) return { error: "The amount should be a number, or left empty." };
  return { body: { name, due: v.due, amount: a || null, repeat: v.repeat === "monthly" ? "monthly" : "none" } };
}
/** Today's date in local (Etc/GMT-4), never the device's zone. Only a fallback: the server sends `today`. */
export const todayMU = (now = Date.now()) => { const o = {}; for (const p of new Intl.DateTimeFormat("en-CA", { timeZone: "Etc/GMT-4", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now))) o[p.type] = p.value; return o.year + "-" + o.month + "-" + o.day; };
