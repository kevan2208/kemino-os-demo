// "Week" card on Today: the Sunday weekly review from /api/brief?kind=weekly. Plain lists, no innerHTML.
// Shown automatically on Sundays, and any day through the "week" link.
export const isSunday = (d = new Date()) => d.getDay() === 0;

/** The card. `w` is the server's review (or null while loading); `close` is given when it was opened by hand. */
export function weekCard({ h }, w, close) {
  const head = h("div", { class: "bh" }, h("b", {}, w ? w.title : "Week in review"), close ? h("button", { "aria-label": "Close the week review", onclick: close }, "×") : null);
  if (!w) return h("div", { class: "brief week", "data-card": "week" }, head, h("p", {}, "Loading…"));
  const sug = (w.suggestions || []).filter((s) => typeof s === "string");
  return h("div", { class: "brief week", "data-card": "week" }, head,
    (w.lines || []).length ? h("ul", {}, w.lines.map((l) => h("li", {}, String(l)))) : h("p", {}, "Nothing to report yet."),
    sug.length ? h("div", { class: "wk-sug" }, h("b", {}, "Worth a look"), h("ol", {}, sug.map((s) => h("li", {}, s)))) : null);
}
