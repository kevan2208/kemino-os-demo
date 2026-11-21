// Hours meter on Today: "This week: 31 h, day off: none yet" and a small Mon-Sun bar row. Pure model + drawing.
// No innerHTML, no inline script or style attribute (CSP); bar heights are set through the DOM (CSSOM), which CSP allows.

const fmt = (h) => (h >= 10 ? String(Math.round(h)) : String(Math.round(h * 10) / 10)) + " h";

/** Bars for the 7 days. `pct` is the bar height (0-100) against the busiest day, but never less than an 8-hour day; a day with any message shows at least a sliver. kind: day | today | future | unknown | off. Pure. */
export function barModel(week) {
  const days = (week && week.days) || [];
  const peak = Math.max(8, ...days.map((d) => (typeof d.hours === "number" ? d.hours : 0)));
  return days.map((d) => {
    const kind = d.future ? "future" : d.hours === null ? "unknown" : d.today ? "today" : d.messages === 0 ? "off" : "day";
    const pct = typeof d.hours === "number" ? Math.max(d.messages > 0 ? 6 : 0, Math.round((d.hours / peak) * 100)) : 0;
    const title = d.future ? d.label : d.hours === null ? d.label + ": no data yet" : d.label + ": " + (d.messages === 0 ? "no activity" : fmt(d.hours));
    return { label: d.label, pct, kind, title };
  });
}

/** The caption under the title. Falls back to a plain sentence if the server sent no line. */
export function weekCaption(week) {
  return week && typeof week.line === "string" ? week.line : "This week: counting…";
}

/** deps: { h }. Returns one element, or null when there is no data to show. */
export function hoursRow({ h }, week) {
  if (!week || !Array.isArray(week.days) || week.days.length !== 7) return null;
  const bars = barModel(week).map((b) => {
    const fill = h("i", { class: "hr-fill" });
    fill.style.height = b.pct + "%";
    return h("span", { class: "hr-day " + b.kind, title: b.title, "aria-label": b.title, role: "img" }, h("span", { class: "hr-bar" }, fill), h("small", {}, b.label[0]));
  });
  return h("div", { class: "hours", "data-hours": "1" }, h("div", { class: "hr-line" }, weekCaption(week)), h("div", { class: "hr-bars" }, bars));
}
