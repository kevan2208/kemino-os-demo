// Insights tab "Apps": ship and apps health for the local repos (read-only). Branch, commits ahead/behind AS OF THE LAST FETCH, last commit,
// uncommitted files, extra worktrees, and the latest CI run when gh can read it. The server does all the reading; nothing here sends anything.

/** "3 h ago", "2 d ago", "just now". Pure, so Node can test it. */
export function agoText(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "unknown";
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 129600 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago";
}
/** "2 ahead, 1 behind", "in sync", or "no upstream". Pure. */
export function syncText(a) {
  if (a.ahead == null || a.behind == null) return a.detached ? "detached HEAD" : "no upstream to compare";
  if (!a.ahead && !a.behind) return "in sync";
  return [a.ahead ? a.ahead + " ahead" : "", a.behind ? a.behind + " behind" : ""].filter(Boolean).join(", ");
}
const CI = { ok: ["CI passing", "ok"], failing: ["CI failing", "bad"], running: ["CI running", "run"], unknown: ["CI unknown", ""] };

export const appsTab = {
  id: "apps", label: "Apps", path: "/api/apps",
  draw(j, { h }) {
    const rows = j.apps || [];
    return [
      h("p", { class: "au-note" }, j.note || "Read-only: nothing here changes a repo."),
      j.configError ? h("p", { class: "au-err" }, j.configError) : null,
      rows.length ? h("div", { class: "ap-list" }, rows.map((a) => {
        if (!a.ok) return h("div", { class: "au-row ap-row bad", "data-app": a.name }, h("div", { class: "au-top" }, h("b", {}, a.name), h("span", { class: "au-st bad" }, "Unreadable")), h("div", { class: "au-sub" }, a.error || "could not read this repo"));
        const [label, tone] = CI[a.ci?.state] || CI.unknown;
        const dirty = a.uncommitted == null ? "uncommitted: unknown" : a.uncommitted + " uncommitted file" + (a.uncommitted === 1 ? "" : "s");
        const trees = a.worktrees == null ? "" : a.worktrees + " extra worktree" + (a.worktrees === 1 ? "" : "s");
        return h("div", { class: "au-row ap-row", "data-app": a.name },
          h("div", { class: "au-top" }, h("b", {}, a.name),
            a.ci?.run?.url ? h("a", { class: "au-st ap-ci" + (tone ? " " + tone : ""), href: a.ci.run.url, target: "_blank", rel: "noopener noreferrer", title: a.ci.run.name || "" }, label)
              : h("span", { class: "au-st ap-ci" + (tone ? " " + tone : ""), title: a.ci?.note || "" }, label)),
          h("div", { class: "au-sub" }, [a.branch ? "on " + a.branch : "", syncText(a) + (a.ahead != null ? " (last fetch)" : "")].filter(Boolean).join(" · ")),
          h("div", { class: "au-when" }, h("span", {}, "last commit " + (a.lastCommitAt ? agoText(a.lastCommitAt, j.now) : "unknown")), h("span", { class: a.uncommitted ? "ap-dirty" : "" }, dirty), trees ? h("span", {}, trees) : null),
          a.ci?.state === "unknown" && a.ci.note ? h("div", { class: "au-sub" }, a.ci.note) : null);
      })) : h("p", { class: "au-note" }, "No repos found. List them in " + (j.configFile || "the data folder/apps.json") + "."),
    ].filter(Boolean); // the Insights panel would print a bare null as the word "null"
  },
};
