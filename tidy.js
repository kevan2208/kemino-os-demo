// Insights tab "Tidy": finished helper threads older than 24 h, a manual "Archive these" (asks twice) and "Undo".
// The server decides what may be archived: it re-checks every id and skips what changed. This file only sends the ids it showed and draws the result.
// No innerHTML, no inline script or style (CSP).
const clockOf = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }); };
/** "26 h", "3 d". Pure. */
export function ageText(hours) { return hours < 48 ? hours + " h" : Math.floor(hours / 24) + " d"; }
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

/** The sentence after an archive: "Archived 318, skipped 8: 3 still running, 5 changed while tidying. 2 failed." Pure. */
export function resultText(r) {
  const parts = ["Archived " + (r.archived || 0)];
  const skipped = r.skippedCount ?? (r.skipped || []).length;
  if (skipped) {
    const by = new Map();
    for (const s of r.skipped || []) by.set(s.reason, (by.get(s.reason) || 0) + 1);
    const detail = [...by].map(([why, n]) => n + " " + why).join(", ");
    parts[0] += ", skipped " + skipped + (detail ? ": " + detail : ": still running or changed");
  }
  let text = parts[0] + ".";
  const failed = (r.failed || []).length;
  if (failed) text += " " + failed + (failed === 1 ? " was" : " were") + " not accepted by T3 (not retried)" + (r.aborted ? "; the rest were not tried because T3 stopped answering" : "") + ".";
  return text;
}

export const tidyTab = {
  id: "tidy", label: "Tidy", path: "/api/tidy",
  draw(j, { h, post, toast }) {
    const root = h("div", { class: "td-root" });
    let data = j, auto = { enabled: true }, recent = [], phase = "idle" /* idle | confirm | running | done */, result = null, undone = null, err = "", running = null, timer = null, busy = false;
    const stop = () => { clearInterval(timer); timer = null; };
    const ids = () => (data.wouldArchive || []).map((t) => t.id);

    async function refresh() {
      try {
        const [a, b, c] = await Promise.all([fetch("/api/tidy"), fetch("/api/tidy/recent"), fetch("/api/tidy/auto")]);
        if (a.ok) data = await a.json();
        if (c.ok) auto = await c.json();
        if (b.ok) { const x = await b.json(); recent = x.batches || []; running = x.running || null; }
      } catch { /* keep what is shown */ }
      paint();
    }
    function poll() {
      stop();
      timer = setInterval(async () => {
        if (!root.isConnected) return stop();
        try { const r = await fetch("/api/tidy/recent"); if (r.ok) { const x = await r.json(); running = x.running || null; recent = x.batches || recent; paint(); } } catch { /* next tick */ }
      }, 1000);
    }
    async function run(path, body, e, label) {
      if (busy) return;
      busy = true; err = ""; phase = "running"; result = null; undone = null; running = null; paint(); poll();
      try {
        const r = await post(path, body, e);
        if (label === "undo") { undone = r; phase = "done"; result = null; } else { result = r; phase = "done"; }
        toast(label === "undo" ? "Brought back " + (r.restored || 0) : "Archived " + (r.archived || 0));
      } catch (x) { err = x.needsConfirm ? "T3 wants a second confirm. Tap again." : x.message; phase = "idle"; toast(err, true); }
      finally { busy = false; stop(); running = null; await refresh(); }
    }
    const undoBtn = (b) => h("button", { class: "b td-undo", "data-act": "tidy-undo", "data-batch": b.id, disabled: busy || null, onclick: (e) => run("/api/tidy/undo", { batch: b.id, confirm: true }, e, "undo") }, "Undo (" + b.left + ")");

    function paint() {
      const rows = data.wouldArchive || [];
      const n = rows.length;
      const nodes = [];
      nodes.push(h("label", { class: "np-row td-auto" }, h("span", {}, "Tidy automatically once a day"),
        h("input", { type: "checkbox", "data-act": "tidy-auto", checked: auto.enabled !== false, disabled: busy || null, "aria-label": "Tidy automatically once a day",
          onchange: async (e) => { const on = e.target.checked; try { const r = await post("/api/tidy/auto", { enabled: on }, e); auto = { ...auto, enabled: r.enabled }; toast(r.enabled ? "Auto-tidy is on" : "Auto-tidy is off"); } catch (x) { toast(x.message, true); } paint(); } })));
      nodes.push(h("p", { class: "au-note" }, "After 06:00 Kemino archives finished helpers (quiet for 24 h, nothing live under them, not pinned) by itself, never a head, foreman or lead and nothing you wrote to in 7 days. Today shows one line with Undo for a day."));
      nodes.push(h("p", { class: "au-note" }, n
        ? "Ready to archive now: " + data.total + " finished helper thread" + (data.total === 1 ? "" : "s") + " older than " + data.olderThanHours + " h. The button below asks twice, and you can undo it."
        : "Nothing to tidy: no finished helper threads older than " + data.olderThanHours + " h."));
      if (err) nodes.push(h("p", { class: "au-err" }, err));
      if (result) nodes.push(h("p", { class: "td-result", role: "status" }, resultText(result)));
      if (undone) nodes.push(h("p", { class: "td-result", role: "status" }, "Brought back " + (undone.restored || 0) + "." + ((undone.failed || []).length ? " " + undone.failed.length + " could not be restored." : "")));
      if (phase === "running") {
        const p = running;
        nodes.push(h("p", { class: "td-progress", role: "status" }, p ? (p.op === "undo" ? "Bringing back " : "Archiving ") + p.done + " of " + p.total + "…" : "Working…"));
      }
      if (result && result.undoable > 0 && phase === "done") {
        const b = recent.find((x) => x.id === result.batch);
        if (b && b.left > 0) nodes.push(h("div", { class: "td-act" }, undoBtn(b)));
      }
      if (n) nodes.push(h("div", { class: "td-list" }, rows.map((t) => h("div", { class: "td-row" },
        h("div", { class: "au-top" }, h("b", {}, t.title), h("span", { class: "sk-n" }, ageText(t.ageHours))),
        h("div", { class: "au-sub" }, [t.project, t.finishedAt ? "finished " + clockOf(t.finishedAt) : ""].filter(Boolean).join(" · "))))));
      if (data.total > data.shown) nodes.push(h("p", { class: "au-note" }, "Showing the " + data.shown + " most recent of " + data.total + ". Tidy again for the rest."));
      if (phase === "confirm") {
        nodes.push(h("div", { class: "td-confirm", role: "alert" },
          h("p", {}, "Archive " + plural(n, "finished helper thread", "finished helper threads") + "? They move to T3's archive. Undo brings them back."),
          h("div", { class: "td-act" },
            h("button", { class: "b td-yes", "data-act": "tidy-confirm", onclick: (e) => run("/api/tidy/archive", { ids: ids(), confirm: true }, e, "archive") }, "Yes, archive " + n),
            h("button", { class: "b", "data-act": "tidy-cancel", onclick: () => { phase = "idle"; paint(); } }, "Cancel"))));
      } else {
        nodes.push(h("div", { class: "td-act" },
          h("button", { class: "b", "data-act": "tidy-archive", disabled: !n || phase === "running" || null, onclick: () => { err = ""; result = null; undone = null; phase = "confirm"; paint(); } }, n ? "Archive these (" + n + ")" : "Archive these"),
          h("small", {}, n ? "Asks twice. Undo is kept for 7 days." : "Nothing to archive")));
      }
        if (recent.length) {
        nodes.push(h("h4", { class: "td-h" }, "Recent tidy-ups"));
        nodes.push(h("div", { class: "td-list td-recent" }, recent.map((b) => h("div", { class: "td-row", "data-batch": b.id },
          h("div", { class: "au-top" }, h("b", {}, plural(b.archived, "thread", "threads") + " archived"), h("span", { class: "sk-n" }, clockOf(b.ts))),
          h("div", { class: "au-sub" }, (b.titles || []).slice(0, 3).join(", ") + (b.archived > 3 ? " …" : "")),
          h("div", { class: "td-act" },
            b.left > 0 ? undoBtn(b) : null,
            h("small", {}, b.left > 0 ? (b.restored ? b.restored + " already restored" : "can be undone") : "all restored"))))));
      }
      root.replaceChildren(...nodes.filter((k) => k != null && k !== false));
    }
    paint();
    fetch("/api/tidy/recent").then((r) => (r.ok ? r.json() : null)).then((x) => { if (x) { recent = x.batches || []; running = x.running || null; if (running && phase === "idle") { phase = "running"; poll(); } paint(); } }).catch(() => {});
    return root;
  },
};
