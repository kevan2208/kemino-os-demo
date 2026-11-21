// Insights tab "Leads": per project, a folded "Lead files" section with ROLE.md, STATE.md and the open-task counts (read-only).
// The server does the reading (/api/leadfiles); this file only draws. Text goes in with textContent (files are written by agents: untrusted), no HTML strings.

const ORDER = ["todo", "doing", "blocked", "review", "done", "failed"];
/** "1 open task", "3 open tasks (1 doing, 2 todo)", "no tasks". Pure, so Node can test it. */
export function taskLine(t) {
  if (!t || !t.total) return "no tasks";
  const parts = ORDER.filter((s) => t.byStatus && t.byStatus[s]).map((s) => t.byStatus[s] + " " + s);
  return t.open + " open task" + (t.open === 1 ? "" : "s") + (parts.length ? " (" + parts.join(", ") + ")" : "");
}
/** "ROLE 0.4 KB of 2 KB". Pure. */
export function sizeLine(name, file, maxBytes) {
  if (!file) return name + " missing";
  return name + " " + (file.bytes / 1024).toFixed(1) + " KB of " + maxBytes / 1024 + " KB";
}

/** The calm one-line branch signal. Pure. `level` is ok | yellow | red from the server. */
export function branchLine(b) { return b && b.line ? b.line : "Branches: not available right now."; }
/** The details one tap away: flagged threads, task branches open over a day, finished tasks without a report. Pure: returns plain strings. */
export function branchDetails(b) {
  if (!b) return [];
  const out = [];
  for (const f of b.flagged || []) out.push((f.project ? f.project + ": " : "") + f.title + " - " + f.reason + (f.real ? " (on " + f.real + ")" : ""));
  for (const t of b.stale || []) out.push(t.project + "/" + t.id + ": branch " + t.branch + " open for " + t.hours + " h. Merge or close it within a day.");
  for (const r of b.reportsMissing || []) out.push(r.project + "/" + r.id + ": report missing");
  return out;
}

export const leadTab = {
  id: "leads", label: "Leads", path: "/api/leadfiles",
  draw(j, { h }) {
    const rows = j.projects || [], lim = j.limits || { roleBytes: 2048, stateBytes: 4096 };
    const file = (title, f, max, empty) => h("div", { class: "lf-file", "data-file": title },
      h("div", { class: "lf-name" }, h("b", {}, title), h("span", {}, f ? sizeLine("", f, max).trim() : "missing")),
      f ? h("div", { class: "lf-text" }, f.text) : h("p", { class: "lf-empty" }, empty));
    const br = j.branches, details = branchDetails(br);
    return [
      h("div", { class: "lf-br lf-br-" + (br ? br.level : "ok"), "data-level": br ? br.level : "ok" },
        h("p", { class: "lf-br-line" }, branchLine(br)),
        details.length ? h("details", { class: "lf-fold lf-br-fold" }, h("summary", {}, "Details (" + details.length + ")"), h("ul", { class: "lf-br-list" }, details.map((d) => h("li", {}, d)))) : null),
      h("p", { class: "au-note lf-note" }, "Each project keeps its lead files in the project folder. Read-only here: the lead rewrites STATE.md, workers change only a task's status and summary."),
      (j.problems || []).map((p) => h("p", { class: "au-err lf-err", "data-problem": p.slug }, p.slug + ": " + p.error)),
      rows.length ? rows.map((p) => h("div", { class: "lf-project", "data-project": p.slug },
        h("div", { class: "lf-head" }, h("b", {}, p.slug), h("span", {}, taskLine(p.tasks))),
        h("details", { class: "lf-fold" },
          h("summary", {}, "Lead files"),
          file("ROLE.md", p.role, lim.roleBytes, "No ROLE.md yet. It says who the lead is and rarely changes."),
          file("STATE.md", p.state, lim.stateBytes, "No STATE.md yet. The lead writes it at the end of each task."),
          p.tasks && p.tasks.error ? h("p", { class: "au-err lf-err" }, "TASKS.json: " + p.tasks.error) : null,
          h("p", { class: "lf-tasks" }, "Tasks: " + taskLine(p.tasks) + ". Reports on file: " + (p.reports || 0) + (p.reportsMissing && p.reportsMissing.length ? ". Report missing: " + p.reportsMissing.join(", ") : "") + ".")))) :
        h("p", { class: "au-note lf-note" }, "No lead files yet. A project gets a folder when its lead first writes ROLE.md or STATE.md."),
    ].flat().filter(Boolean);
  },
};
