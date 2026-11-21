// Insights tab "Skills": the skills installed on this Mac (name + description) and how often each was used in the last 14 days. Read-only.

const norm = (s) => String(s || "").toLowerCase();
/** Skills whose name or description contains every word of the query; order is kept (the server sorts by use). Pure, so Node can test it. */
export function filterSkills(list, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((s) => { const hay = norm(s.name) + " " + norm(s.description); return words.every((w) => hay.includes(w)); });
}
/** "2 d ago", "today", or "" — when a skill was last used. */
export function usedWhen(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = Math.floor((now - t) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " d ago";
}

export const skillsTab = {
  id: "skills", label: "Skills", path: "/api/skills",
  draw(j, { h }) {
    const skills = j.skills || [], used = skills.filter((s) => s.uses > 0);
    const days = j.scan?.days || 14;
    const list = h("div", { class: "sk-list" });
    const paint = (q) => {
      const rows = filterSkills(skills, q);
      list.replaceChildren(...(rows.length ? rows.map((s) => h("div", { class: "sk-row" + (s.uses ? "" : " zero") },
        h("div", { class: "au-top" }, h("b", {}, s.name), h("span", { class: "sk-n" + (s.uses ? " on" : "") }, s.uses ? s.uses + (s.uses === 1 ? " use" : " uses") : "unused")),
        s.description ? h("div", { class: "au-sub sk-d" }, s.description) : null,
        s.lastUsed ? h("div", { class: "sk-last" }, "last used " + usedWhen(s.lastUsed)) : null)) : [h("p", { class: "au-note" }, "No skill matches.")]));
    };
    paint("");
    const notes = [];
    if (!j.scan?.available) notes.push("The transcripts folder could not be read, so use counts are missing.");
    else if (j.scan.capped || j.scan.skipped) { const n = Number(j.scan.skipped) || 0; notes.push("Counts are partial: the scan stopped at its time or size limit" + (n ? " (" + n + " file" + (n === 1 ? "" : "s") + " skipped)." : ".")); }
    if (j.error) notes.push(j.error);
    return [
      h("p", { class: "au-note" }, skills.length + " installed · " + used.length + " used in the last " + days + " days. Counts come from Skill calls in your Claude transcripts; nothing else is read."),
      ...notes.map((n) => h("p", { class: "au-err" }, n)),
      h("input", { type: "search", class: "in-search", placeholder: "Filter skills", "aria-label": "Filter skills", autocomplete: "off", oninput: (e) => paint(e.target.value) }),
      list,
      (j.other || []).length ? h("p", { class: "au-note sk-other" }, "Also used, not installed here: " + j.other.slice(0, 8).map((o) => o.name + " ×" + o.uses).join(", ")) : null,
    ];
  },
};
