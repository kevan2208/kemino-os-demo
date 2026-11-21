// Insights tab "Usage": per project, for the last 7 days: threads, helper jobs, and which providers and models did the work. Counts only (no money).

/** "claude-sonnet-5-5" -> "Sonnet 5.5"; anything else passes through. Pure, so Node can test it. */
export function modelName(m) {
  const r = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(m || "");
  if (r) return r[1][0].toUpperCase() + r[1].slice(1) + " " + r[2] + "." + r[3];
  return m || "unknown";
}
/** One line per project: "Kemino: Sonnet 5.5 ×12, Opus 5.5 ×3 · kbb: Sonnet 5.5 ×1". Pure. */
export function workersLine(byProvider) {
  return (byProvider || []).map((p) => p.provider + ": " + p.models.map((m) => modelName(m.model) + " ×" + m.count).join(", ")).join(" · ");
}

export const usageTab = {
  id: "usage", label: "Usage", path: "/api/usage/projects",
  draw(j, { h }) {
    const rows = j.projects || [];
    const head = h("tr", {}, ["Project", "Threads", "Helpers", "New"].map((t, i) => h("th", { scope: "col", class: i ? "num" : "" }, t)));
    const table = h("table", { class: "us-table" },
      h("caption", { class: "sr" }, "Usage per project, last " + j.days + " days"),
      h("thead", {}, head),
      h("tbody", {}, rows.map((p) => h("tr", {},
        h("th", { scope: "row", class: "us-name" }, h("b", {}, p.name), h("small", {}, workersLine(p.byProvider))),
        h("td", { class: "num", "data-k": "threads" }, p.active),
        h("td", { class: "num", "data-k": "helpers" }, p.helpers),
        h("td", { class: "num", "data-k": "new" }, p.started)))),
      rows.length ? h("tfoot", {}, h("tr", {}, h("th", { scope: "row" }, "All projects"), h("td", { class: "num" }, j.totals.active), h("td", { class: "num" }, j.totals.helpers), h("td", { class: "num" }, j.totals.started))) : null);
    return [
      h("p", { class: "au-note" }, "Last " + j.days + " days. Threads = did something in the window; helpers = threads with a parent; new = started in the window. Each thread counts once, under the model it has now."),
      rows.length ? h("div", { class: "us-wrap" }, table) : h("p", { class: "au-note" }, "No thread activity in this window."),
      j.tokens && !j.tokens.available ? h("p", { class: "au-note us-tok" }, j.tokens.note) : null,
    ];
  },
};
