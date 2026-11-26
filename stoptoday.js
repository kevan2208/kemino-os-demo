// "Stop for today": a dialog that says exactly what will be paused, then one confirm. Same dialog resumes.
// The server decides and re-checks everything (gesture, confirm, which tasks); this file only draws. No innerHTML, no inline script or style (CSP).

const when = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }); };
const plural = (n, one, many = one + "s") => n + " " + (n === 1 ? one : many);

/** One line for the banner under the top bar, or "" when not stopped. Pure. */
export function stopLine(st) {
  if (!st || !st.stopped) return "";
  const parts = ["Stopped for today" + (st.until ? ", back on " + when(st.until) : "")];
  parts.push(st.paused.length ? plural(st.paused.length, "automation") + " paused" : "none were due");
  parts.push(st.running ? plural(st.running, "thread") + " still running" : "nothing running");
  return parts.join(" · ");
}

/** The sentences in the dialog. Pure. `mode` is "stop" or "resume". */
export function stopDialogText(st, mode) {
  if (!st) return { lead: "Checking what's scheduled…", items: [], notes: [] };
  const notes = [];
  if (mode === "resume") {
    notes.push("Only these are turned back on. Everything else stays as is.");
    if (st.failed && st.failed.length) notes.push(plural(st.failed.length, "automation") + " could not be paused earlier: " + st.failed.map((f) => f.title).join(", ") + ".");
    return { lead: st.paused.length ? "Turn back on " + plural(st.paused.length, "automation") + "?" : "Nothing was paused. Clear the stop?", items: st.paused, notes };
  }
  const items = (st.preview || []).map((p) => p.title + (p.nextRun ? " (next " + when(p.nextRun) + ")" : ""));
  notes.push(st.running ? plural(st.running, "thread") + (st.running === 1 ? " is" : " are") + " working and will keep going." : "Nothing is running. Running threads are never stopped.");
  if (st.webhook) notes.push(plural(st.webhook, "webhook automation") + " cannot be predicted and will not be paused.");
  return { lead: items.length ? "Pause " + plural(items.length, "automation") + " that would run before 07:00?" : "Nothing is due before 07:00. Stop anyway?", items, notes };
}

/** deps: { h, post(path, body, event), toast(msg, isError), toLogin(), onChange() }. mode: "stop" | "resume". */
export function openStopToday({ h, post, toast, toLogin, onChange }, mode = "stop") {
  if (document.querySelector(".st-wrap")) return;
  let st = null, error = "", busy = false;
  const body = h("div", { class: "st-body" });
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap st-wrap", role: "dialog", "aria-modal": "true", "aria-label": mode === "stop" ? "Stop for today" : "Resume", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card" },
      h("div", { class: "np-head" }, h("strong", {}, mode === "stop" ? "Stop for today" : "Resume"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);

  async function load() {
    try {
      const r = await fetch("/api/stop-today" + (mode === "stop" ? "?preview=1" : ""));
      if (r.status === 401) return toLogin();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "could not load (" + r.status + ")");
      st = j; error = "";
    } catch (e) { error = e.message; }
    draw();
  }

  async function go(e) {
    if (busy) return;
    busy = true; draw();
    try {
      const r = await post(mode === "stop" ? "/api/stop-today" : "/api/stop-today/resume", { confirm: true }, e);
      if (mode === "stop") toast(r.failed && r.failed.length ? "Stopped. " + plural(r.paused, "automation") + " paused, " + r.failed.length + " could not be." : "Stopped for today. " + plural(r.paused, "automation") + " paused.", !!(r.failed && r.failed.length));
      else toast(r.changed && r.changed.length ? "Resumed " + plural(r.resumed, "automation") + ". " + plural(r.changed.length, "automation") + " changed since Stop, left as is." : r.stillStopped ? "Resumed some. " + plural(r.failed.length, "automation") + " could not be turned on." : "Resumed. " + plural(r.resumed, "automation") + " turned back on.", !!r.stillStopped);
      onChange && onChange();
      close();
    } catch (err) { busy = false; error = err.message; draw(); }
  }

  function draw() {
    const kids = [];
    if (error) kids.push(h("p", { class: "au-err" }, error), h("button", { class: "np-btn", onclick: load }, "Try again"));
    else if (!st) kids.push(h("div", { class: "skel" }), h("div", { class: "skel" }));
    else if (mode === "stop" && st.stopped) kids.push(h("p", {}, "Already stopped for today."), h("button", { class: "np-btn", onclick: close }, "Close"));
    else if (mode === "resume" && !st.stopped) kids.push(h("p", {}, "Not stopped, so nothing to resume."), h("button", { class: "np-btn", onclick: close }, "Close"));
    else {
      const t = stopDialogText(st, mode);
      kids.push(h("p", { class: "st-lead" }, t.lead));
      if (t.items.length) kids.push(h("ul", { class: "st-list" }, t.items.map((i) => h("li", {}, i))));
      for (const n of t.notes) kids.push(h("p", { class: "au-note" }, n));
      kids.push(h("div", { class: "acts" },
        h("button", { class: "b y", "data-act": "go", disabled: busy, onclick: go }, mode === "stop" ? "Yes, stop for today" : "Yes, resume"),
        h("button", { class: "b", onclick: close }, "Cancel")));
    }
    body.replaceChildren(...kids.filter((k) => k != null && k !== false));
  }

  draw();
  load();
}
