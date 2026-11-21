// Automations panel: T3's scheduled tasks in plain words, with Run now / Pause / Resume.
// Every action needs the second confirm: the first tap only asks, the second one sends `confirm: true`.
// The server decides what is allowed (and re-checks the confirm); this file only draws. No innerHTML, no inline script or style (CSP).

/** "in 3 h", "in 2 d", "5 min ago". Pure, so Node can test it. */
export function relTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.round((t - now) / 1000), a = Math.abs(s);
  const u = a < 90 ? "moments" : a < 5400 ? Math.round(a / 60) + " min" : a < 129600 ? Math.round(a / 3600) + " h" : Math.round(a / 86400) + " d";
  return a < 90 ? (s >= 0 ? "in a moment" : "just now") : s >= 0 ? "in " + u : u + " ago";
}
const clockOf = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }); };
const RESULT = { never: ["Never run", ""], running: ["Running now", "run"], succeeded: ["Succeeded", "ok"], failed: ["Failed", "bad"] };

/** The sentence under the confirm buttons. */
export function confirmText(a, kind) {
  const risky = a.fullAccess ? " It runs with full access: it can change files and run commands without asking." : "";
  if (kind === "run-now") return "Run “" + a.name + "” now? This starts an agent." + risky;
  if (kind === "resume") return "Turn “" + a.name + "” back on? It will run " + a.schedule.toLowerCase() + "." + risky;
  return "Pause “" + a.name + "”? It stays saved and will not run until you turn it on.";
}

/** deps: { h, post(path, body, event), toast(msg, isError), toLogin() }. */
export function openAutomations({ h, post, toast, toLogin, wrote }) {
  if (document.querySelector(".au-wrap")) return;
  let rows = null, error = "", pending = null /* { id, kind } */, busy = false, timer = null;
  const body = h("div", { class: "au-body" });
  const close = () => { clearInterval(timer); wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap au-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Automations", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card au-card" },
      h("div", { class: "np-head" }, h("strong", {}, "Automations"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);

  async function load() {
    try {
      const r = await fetch("/api/automations");
      if (r.status === 401) return toLogin();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "could not load (" + r.status + ")");
      rows = j.automations || []; error = "";
    } catch (e) { error = e.message; }
    draw();
  }

  async function act(a, kind, e, confirm) {
    if (busy) return;
    busy = true; draw();
    try {
      const r = await post("/api/automations/" + kind, { id: a.id, confirm }, e);
      pending = null;
      const msg = kind === "run-now" ? "Started: " + a.name : kind === "pause" ? "Paused: " + a.name : "Turned on: " + a.name;
      if (wrote) wrote(msg, r); else toast(msg); // wrote(): "not confirmed" banner when T3 did not show it back
      await load();
    } catch (err) {
      if (err.needsConfirm) pending = { id: a.id, kind };
      else { pending = null; toast(err.message, true); }
    } finally { busy = false; draw(); }
  }

  function row(a) {
    const [rt, rc] = RESULT[a.lastResult] || [a.lastResult, ""];
    const ask = pending && pending.id === a.id ? pending.kind : null;
    const kinds = a.enabled ? ["run-now", "pause"] : ["run-now", "resume"];
    const label = { "run-now": "Run now", pause: "Pause", resume: "Turn on" };
    return h("div", { class: "au-row" + (a.enabled ? "" : " off") },
      h("div", { class: "au-top" }, h("b", {}, a.name), h("span", { class: "au-st " + (a.blocked ? "bad" : a.enabled ? "on" : "") }, a.blocked ? "Blocked" : a.enabled ? "On" : "Paused")),
      h("div", { class: "au-sub" }, [a.project, a.schedule].filter(Boolean).join(" · ")),
      h("div", { class: "au-when" },
        h("span", {}, a.enabled && a.nextRun ? "Next: " + clockOf(a.nextRun) + " (" + relTime(a.nextRun) + ")" : a.enabled ? "No next run planned" : "Not scheduled"),
        h("span", { class: "au-res " + rc }, a.lastRun ? "Last: " + rt + " " + relTime(a.lastRun) : rt),
        a.runs ? h("span", {}, a.runs + (a.runs === 1 ? " run" : " runs")) : null),
      a.lastError ? h("div", { class: "au-err" }, a.lastError) : null,
      a.blocked ? h("div", { class: "au-err" }, a.blocked) : null,
      ask
        ? h("div", { class: "confirm" }, h("p", {}, confirmText(a, ask)),
            h("div", { class: "acts" },
              h("button", { class: "b y" + (ask === "pause" ? "" : " danger"), disabled: busy, onclick: (e) => act(a, ask, e, true) }, ask === "run-now" ? "Yes, run it" : ask === "resume" ? "Yes, turn on" : "Yes, pause"),
              h("button", { class: "b", onclick: () => { pending = null; draw(); } }, "Cancel")))
        : h("div", { class: "acts" }, a.blocked ? null : kinds.map((k) => h("button", { class: "b" + (k === "run-now" ? "" : " m"), disabled: busy, onclick: (e) => act(a, k, e, false) }, label[k]))));
  }

  function draw() {
    const kids = [];
    if (error) kids.push(h("p", { class: "au-err" }, error), h("button", { class: "np-btn", onclick: load }, "Try again"));
    else if (!rows) kids.push(h("div", { class: "skel" }), h("div", { class: "skel" }));
    else {
      const on = rows.filter((a) => a.enabled);
      kids.push(h("p", { class: "au-note" }, rows.length ? on.length + " on, " + (rows.length - on.length) + " paused. Running or turning one on always asks twice." : "T3 has no scheduled tasks."));
      kids.push(...rows.map(row));
    }
    body.replaceChildren(...kids.filter((k) => k != null && k !== false));
  }

  draw();
  load();
  timer = setInterval(() => { if (!busy && !pending && !document.hidden) load(); }, 15000);
}
