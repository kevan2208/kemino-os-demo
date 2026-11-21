// Queue view: park an approved job until a reset. A job = "send this message to a NEW thread in this project, with this model", started by the
// server when its condition is met (never when the AI is at its stop, at most 3 starts an hour, each job at most once).
// Adding always asks once more (the first Add only asks, the second tap sends `confirm: true`). The server re-checks everything; this file only draws.
// No innerHTML, no inline script or style (CSP).

const WAITS = [
  ["kemino-below-50", "Kemino is below 50% (both windows)"],
  ["kemino-5h-reset", "Kemino's 5-hour window resets"],
  ["codex-reset", "Codex resets (its busiest window drops)"],
  ["time", "A time I pick"],
];
const MODES = [
  ["approval-required", "Ask me before each action"],
  ["auto-accept-edits", "Edit files without asking (default)"],
  ["full-access", "Full access (runs commands without asking)"],
];
const STATE = { queued: ["Waiting", ""], starting: ["Starting", "run"], started: ["Started", "ok"], failed: ["Failed", "bad"], unsure: ["Check T3", "bad"], cancelled: ["Cancelled", ""] };

/** The first line of the message, shortened. Pure, so Node can test it. */
export function jobTitle(text, max = 70) {
  const l = String(text || "").split("\n")[0].trim();
  return l.length > max ? l.slice(0, max - 1) + "…" : l || "(empty)";
}
/** The note under a job, or null. "waiting when ..." only repeats the "Starts when ..." line above it, so it is dropped. Pure. */
export function jobNote(j) {
  const n = j && j.note;
  return n && !/^waiting\s/i.test(n) ? n : null;
}
/** "claude-sonnet-5-5" -> "Sonnet 5.5". Pure. */
export function modelLabel(m) {
  const r = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(m || "");
  return r ? r[1][0].toUpperCase() + r[1].slice(1) + " " + r[2] + "." + r[3] : m || "";
}
/** The question under the confirm buttons. `kinds` come from the server's 409 answer. Pure. */
export function confirmText(form, kinds, projectName) {
  const bits = ["Queue this? When " + (WAITS.find((w) => w[0] === form.waitFor)?.[1] || "the condition is met") + ", Kemino starts a NEW thread in " + (projectName || "that project") + " with this message."];
  if ((kinds || []).includes("full-access")) bits.push("It will have full access: it can change files and run commands without asking.");
  const risky = (kinds || []).filter((k) => !["queue", "full-access"].includes(k));
  if (risky.length) bits.push("The message mentions " + risky.join(", ") + ".");
  return bits.join(" ");
}
/** Turns the form into the body the server expects. Pure. */
export function formBody(f) {
  const body = { opId: f.opId, projectId: f.projectId, text: f.text, instanceId: f.instanceId, model: f.model, effort: f.effort || null, runtimeMode: f.runtimeMode, waitFor: f.waitFor };
  if (f.runtimeMode === "full-access") body.fullAccess = f.fullAccess === true;
  if (f.waitFor === "time") body.at = f.at ? new Date(f.at).toISOString() : "";
  return body;
}
const clockOf = (ms) => { const d = new Date(ms); return isNaN(d) ? "" : d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }); };

/** deps: { h, post(path, body, event), toast(msg, isError), toLogin(), models: { byInstance, efforts } }. */
export function openQueue({ h, post, toast, toLogin, models }) {
  if (document.querySelector(".qu-wrap")) return;
  let data = null, error = "", busy = false, pending = null /* { body, kinds } */, timer = null;
  const newOp = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g, "");
  const form = { opId: newOp() /* one id per Add gesture: a replayed request returns the first job */, projectId: "", text: "", instanceId: "claudeAgent", model: "", effort: "", runtimeMode: "auto-accept-edits", fullAccess: false, waitFor: "kemino-below-50", at: "" };
  const body = h("div", { class: "au-body" });
  const close = () => { clearInterval(timer); wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap au-wrap qu-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Queue", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card au-card qu-card" },
      h("div", { class: "np-head" }, h("strong", {}, "Queue"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);

  const modelsFor = (inst) => { const l = (models?.byInstance?.[inst] || []).slice(); if (form.model && !l.includes(form.model)) l.unshift(form.model); return l; };
  const projectName = () => data?.projects?.find((p) => p.id === form.projectId)?.title || "";

  async function load() {
    try {
      const r = await fetch("/api/queue");
      if (r.status === 401) return toLogin();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "could not load (" + r.status + ")");
      data = j; error = "";
      if (!form.projectId) form.projectId = j.projects?.[0]?.id || "";
      if (!form.model) form.model = modelsFor(form.instanceId)[0] || "";
    } catch (e) { error = e.message; }
    draw();
  }

  async function send(e, confirm) {
    if (busy) return;
    if (!form.text.trim()) return toast("Write the message first.", true);
    busy = true; draw();
    const b = formBody(form);
    try {
      await post("/api/queue/add", { ...b, confirm }, e);
      pending = null; form.text = ""; form.opId = newOp();
      toast("Queued.");
      await load();
    } catch (err) {
      if (err.needsConfirm) pending = { body: b, kinds: err.kinds || [] };
      else { pending = null; toast(err.message, true); }
    } finally { busy = false; draw(); }
  }
  async function cancel(job, e) {
    if (busy) return;
    busy = true; draw();
    try { await post("/api/queue/cancel", { id: job.id }, e); toast("Cancelled."); await load(); }
    catch (err) { toast(err.message, true); }
    finally { busy = false; draw(); }
  }

  const sel = (label, value, opts, on, extra = {}) => h("label", { class: "qu-f" }, h("span", {}, label),
    h("span", { class: "sel-wrap" }, h("select", { "aria-label": label, disabled: busy || !!pending, onchange: (e) => { on(e.target.value); draw(); }, ...extra }, opts.map(([v, t]) => h("option", { value: v, selected: v === value }, t)))));

  function row(j) {
    const [label, tone] = STATE[j.state] || [j.state, ""];
    const eff = j.effort ? " · " + j.effort : "";
    return h("div", { class: "au-row qu-job " + j.state, "data-state": j.state },
      h("div", { class: "au-top" }, h("b", {}, jobTitle(j.text)), h("span", { class: "au-st" + (tone === "ok" || tone === "run" ? " on" : tone === "bad" ? " bad" : "") }, label)),
      h("div", { class: "au-sub" }, [j.project.title, j.providerName + " " + modelLabel(j.model) + eff, j.runtimeMode].join(" · ")),
      h("div", { class: "au-when" }, h("span", {}, "Starts " + j.waitText),
        j.startedAt ? h("span", {}, "claimed " + clockOf(j.startedAt)) : null),
      jobNote(j) ? h("div", { class: "au-sub qu-note" }, jobNote(j)) : null,
      j.error ? h("div", { class: "au-err" }, j.error) : null,
      j.state === "queued" ? h("div", { class: "acts" }, h("button", { class: "b m", disabled: busy, "data-act": "queue-cancel", onclick: (e) => cancel(j, e) }, "Cancel")) : null);
  }

  function formView() {
    const inst = data.providers.map((p) => [p.instanceId, p.name]);
    const full = form.runtimeMode === "full-access";
    return h("div", { class: "qu-form" },
      h("strong", {}, "Add a job"),
      sel("Project", form.projectId, data.projects.map((p) => [p.id, p.title]), (v) => (form.projectId = v)),
      h("label", { class: "qu-f" }, h("span", {}, "Message to send"),
        h("textarea", { class: "qu-text", rows: "4", maxlength: "8000", "aria-label": "Message to send", placeholder: "What should the new thread do?", disabled: busy || !!pending, oninput: (e) => { form.text = e.target.value; } }, form.text)),
      sel("AI", form.instanceId, inst, (v) => { form.instanceId = v; form.model = modelsFor(v)[0] || ""; }),
      sel("Model", form.model, modelsFor(form.instanceId).map((m) => [m, modelLabel(m)]), (v) => (form.model = v)),
      sel("Effort", form.effort, [["", "Default"], ...(models?.efforts || ["low", "medium", "high"]).map((x) => [x, x])], (v) => (form.effort = v)),
      sel("What the new thread may do", form.runtimeMode, MODES, (v) => { form.runtimeMode = v; if (v !== "full-access") form.fullAccess = false; }),
      full ? h("label", { class: "qu-f qu-check" }, h("input", { type: "checkbox", "data-act": "queue-full", checked: form.fullAccess, disabled: busy || !!pending, onchange: (e) => { form.fullAccess = e.target.checked; } }), h("span", {}, "I choose full access for this job")) : null,
      sel("Start when", form.waitFor, WAITS, (v) => (form.waitFor = v)),
      form.waitFor === "time" ? h("label", { class: "qu-f" }, h("span", {}, "At"), h("input", { type: "datetime-local", class: "qu-at", "aria-label": "Start time", value: form.at, disabled: busy || !!pending, onchange: (e) => { form.at = e.target.value; } })) : null,
      pending
        ? h("div", { class: "confirm" }, h("p", {}, confirmText(form, pending.kinds, projectName())),
            h("div", { class: "acts" },
              h("button", { class: "b y" + (pending.kinds.some((k) => k !== "queue") ? " danger" : ""), disabled: busy, "data-act": "queue-yes", onclick: (e) => send(e, true) }, "Yes, queue it"),
              h("button", { class: "b", onclick: () => { pending = null; draw(); } }, "Cancel")))
        : h("div", { class: "acts" }, h("button", { class: "b y", disabled: busy, "data-act": "queue-add", onclick: (e) => send(e, false) }, "Add to the queue")));
  }

  function draw() {
    const kids = [];
    if (error) kids.push(h("p", { class: "au-err" }, error), h("button", { class: "np-btn", onclick: load }, "Try again"));
    else if (!data) kids.push(h("div", { class: "skel" }), h("div", { class: "skel" }));
    else {
      const waiting = data.jobs.filter((j) => j.state === "queued").length;
      const l = data.limits;
      kids.push(h("p", { class: "au-note" }, waiting + " waiting. Checked every " + l.checkEveryMinutes + " minutes. At most " + l.perHour + " start per hour (" + l.startedLastHour + " used). A job never starts when its AI is at its stop (Kemino 80%, Codex 80%, Copilot 80%, kbb 80%, Antigravity limited), and each job starts only once."));
      if (data.error) kids.push(h("p", { class: "au-err" }, data.error));
      const jobs = data.jobs.slice().sort((a, b) => (a.state === "queued" ? 0 : 1) - (b.state === "queued" ? 0 : 1) || b.createdAt - a.createdAt);
      kids.push(jobs.length ? h("div", { class: "qu-list" }, jobs.map(row)) : h("p", { class: "au-note" }, "Nothing is parked. Add a job below."));
      kids.push(formView());
    }
    // keep typing and the scroll position when the list refreshes
    const scroll = body.scrollTop;
    body.replaceChildren(...kids.filter((k) => k != null && k !== false));
    body.scrollTop = scroll;
  }

  draw();
  load();
  timer = setInterval(() => { if (!busy && !pending && !document.hidden && document.activeElement?.tagName !== "TEXTAREA") load(); }, 20000);
}
