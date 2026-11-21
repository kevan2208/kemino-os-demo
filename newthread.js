// New thread picker: ONE calm sheet. Project, AI (face + live usage hint, from T3's real model list), mode, the first message, Start.
// The server re-checks everything (src/newthread.ts); this file only draws. A limited AI can be picked only after an explicit "use it anyway" line,
// and full access (or a limited AI) asks once more in plain words before Start sends `confirm`. No innerHTML, no inline script or style (CSP).
import { buddyOfInstance, captionOf, leftOf, noReadingFor } from "./buddies.js";

const KEY = "ko.nt";
/** Runtime modes in You's words. */
export const MODES = [
  ["approval-required", "Supervised", "Asks before each action"],
  ["auto-accept-edits", "Accept edits", "Edits files without asking"],
  ["full-access", "Full access", "Runs anything without asking"],
];
const CHAT_PLAN = [["default", "Chat"], ["plan", "Plan"]];

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: nothing is remembered */ } };

/** "claude-sonnet-5-5" -> "Sonnet 5.5" is T3's own `name` now; this only trims "Claude " for room. Pure. */
export const shortName = (n) => String(n || "").replace(/^Claude\s+/, "");

/**
 * What the sheet starts with. Project: the open thread's, else the last used on this device, else the first. AI+model: the open thread's if T3 still
 * offers it, else the last used, else the first AI that is not limited. Mode: the open thread's, else supervised. Pure.
 * head = { project (title), runtimeMode, model: { instanceId, model, effort } } of the open thread, or null.
 */
export function defaultsFor(opts, head, saved = {}) {
  const projects = opts.projects || [], providers = opts.providers || [];
  const byTitle = head?.project ? projects.find((p) => p.title === head.project) : null;
  const projectId = (byTitle || projects.find((p) => p.id === saved.projectId) || projects[0] || {}).id || "";
  const offers = (i, m) => providers.find((p) => p.instanceId === i)?.models.some((x) => x.slug === m);
  let instanceId = "", model = "", effort = "";
  const pick = head?.model && offers(head.model.instanceId, head.model.model) ? head.model : saved.instanceId && offers(saved.instanceId, saved.model) ? { instanceId: saved.instanceId, model: saved.model } : null;
  if (pick) { instanceId = pick.instanceId; model = pick.model; effort = pick.effort || ""; }
  else {
    const p = providers.find((x) => x.state !== "limited") || providers[0];
    if (p) { instanceId = p.instanceId; model = (p.models.find((m) => m.isDefault) || p.models[0]).slug; }
  }
  const prov = providers.find((p) => p.instanceId === instanceId);
  const m = prov?.models.find((x) => x.slug === model);
  if (m?.effort && !m.effort.options.some((o) => o.id === effort)) effort = m.effort.options.find((o) => o.isDefault)?.id || "";
  if (!m?.effort) effort = "";
  const modes = prov?.runtimeModes || [];
  const runtimeMode = head?.runtimeMode && modes.includes(head.runtimeMode) ? head.runtimeMode : "approval-required";
  return { projectId, instanceId, model, effort, runtimeMode, interactionMode: "default" };
}

/** The live hint under an AI: the same lines the buddy shows ("5h 94%", "wk 39%", "back 18:29", "limited"). Pure. */
export function hintFor(provider, usage, now = new Date()) {
  const b = buddyOfInstance(provider.instanceId);
  const plan = b && usage ? (usage.plans || []).find((p) => p.id === b.plan) : null;
  const left = plan ? leftOf(plan) : null;
  if (!plan) return { lines: [{ text: provider.state === "limited" ? "limited" : noReadingFor(provider.instanceId, usage), tone: "ok" }], left: null };
  const c = captionOf({ id: b.id, name: b.name, plan, left }, now);
  return { lines: provider.state === "limited" && !plan.limited && !plan.limitedUntil ? [{ text: "limited", tone: "low" }, ...c.lines] : c.lines, left };
}

/** The body the server expects. `confirm` only when the person already said yes to the plain-words lines. Pure. */
export function bodyOf(f, confirm) {
  const b = { opId: f.opId, projectId: f.projectId, instanceId: f.instanceId, model: f.model, effort: f.effort || null, runtimeMode: f.runtimeMode, interactionMode: f.interactionMode, text: f.text };
  if (confirm) b.confirm = true;
  return b;
}

/** The plain-words lines of the confirm step. `kinds` are the server's (409) or the page's own guess. Pure. */
export function confirmLines(kinds, provider) {
  const out = [];
  const ks = kinds || [];
  if (ks.includes("full-access")) out.push("Full access: this thread can change files and run commands on your computer without asking you. Only choose it for work you trust.");
  if (ks.includes("limited")) out.push((provider?.reason || (provider?.name || "This AI") + " is limited") + ". The thread may be refused or stop part-way.");
  const risky = ks.filter((k) => !["full-access", "limited"].includes(k));
  if (risky.length) out.push("The message mentions " + risky.join(", ") + ".");
  return out;
}
/** What the page already knows will need a yes, before it asks the server. Pure. */
export const needsYes = (f, provider) => [...(f.runtimeMode === "full-access" ? ["full-access"] : []), ...(provider?.state === "limited" ? ["limited"] : [])];

/** deps: { h, post(path, body, event), toast(msg, isError), toLogin(), usage, head, text, openThread(id) }. */
export function openNewThread({ h, post, toast, toLogin, usage, head, text, openThread }) {
  if (document.querySelector(".nt-wrap")) return;
  const saved = load();
  let opts = null, error = "", busy = false, step = "form" /* or "confirm" */, kinds = [], fail = "", askLimited = null;
  const okLimited = new Set();
  const newOp = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g, "");
  const form = { opId: newOp(), projectId: "", instanceId: "", model: "", effort: "", runtimeMode: "approval-required", interactionMode: "default", text: text || "" };
  const body = h("div", { class: "nt-body" });
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap nt-wrap", role: "dialog", "aria-modal": "true", "aria-label": "New thread", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card nt-card" },
      h("div", { class: "np-head" }, h("strong", {}, "New thread"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);

  const prov = () => opts?.providers.find((p) => p.instanceId === form.instanceId);
  const modelOf = () => prov()?.models.find((m) => m.slug === form.model);
  const projectTitle = () => opts?.projects.find((p) => p.id === form.projectId)?.title || "";

  async function init() {
    try {
      const r = await fetch("/api/newthread/options");
      if (r.status === 401) return toLogin();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "could not load (" + r.status + ")");
      opts = j; error = "";
      Object.assign(form, defaultsFor(j, head, saved));
    } catch (e) { error = e.message; }
    draw();
  }

  function chooseAi(p) {
    form.instanceId = p.instanceId;
    form.model = (p.models.find((m) => m.isDefault) || p.models[0]).slug;
    Object.assign(form, defaultsFor({ ...opts, projects: opts.projects }, { model: { instanceId: p.instanceId, model: form.model }, project: projectTitle(), runtimeMode: form.runtimeMode }, { projectId: form.projectId }), { projectId: form.projectId, text: form.text, opId: form.opId, interactionMode: p.planMode ? form.interactionMode : "default" });
    step = "form"; fail = "";
  }

  async function start(e, confirm) {
    if (busy) return;
    if (!form.text.trim()) { fail = "Write the first message."; draw(); return; }
    const need = needsYes(form, prov());
    if (!confirm && need.length) { kinds = need; step = "confirm"; fail = ""; draw(); return; }
    busy = true; fail = ""; draw();
    try {
      const r = await post("/api/threads/start", bodyOf(form, confirm), e);
      save({ projectId: form.projectId, instanceId: form.instanceId, model: form.model });
      toast(r.confirmed === false ? "Started. T3 has not shown it yet." : "Thread started");
      close();
      if (r.threadId) openThread(r.threadId);
      return;
    } catch (err) {
      if (err.needsConfirm) { kinds = err.kinds || []; step = "confirm"; }
      else { fail = err.message; step = "form"; }
    } finally { busy = false; if (document.body.contains(wrap)) draw(); }
  }

  const seg = (items, value, on, label) => h("div", { class: "nt-seg", role: "radiogroup", "aria-label": label },
    items.map(([v, t, sub]) => h("button", { type: "button", class: "nt-opt" + (v === value ? " on" : ""), role: "radio", "aria-checked": v === value ? "true" : "false", disabled: busy || step === "confirm", title: sub || null, "data-v": v, onclick: () => { on(v); step = "form"; fail = ""; draw(); } }, t)));
  const sel = (label, value, options, on) => h("label", { class: "nt-f" }, h("span", { class: "nt-l" }, label),
    h("span", { class: "sel-wrap" }, h("select", { "aria-label": label, disabled: busy || step === "confirm", onchange: (e) => { on(e.target.value); step = "form"; fail = ""; draw(); } }, options.map(([v, t]) => h("option", { value: v, selected: v === value }, t)))));

  function aiRow(p) {
    const b = buddyOfInstance(p.instanceId);
    const folder = (globalThis.KEMINO_BUDDY_FOLDERS && b && globalThis.KEMINO_BUDDY_FOLDERS[b.id]) || b?.id;
    const hint = hintFor(p, usage);
    const limited = p.state === "limited", on = p.instanceId === form.instanceId;
    return h("button", { type: "button", class: "nt-ai" + (on ? " on" : "") + (limited ? " limited" : ""), role: "radio", "aria-checked": on ? "true" : "false", "data-ai": p.instanceId, "aria-disabled": limited && !okLimited.has(p.instanceId) ? "true" : null, disabled: busy || step === "confirm",
      onclick: () => {
        if (limited && !okLimited.has(p.instanceId)) { askLimited = p.instanceId; draw(); return; }
        askLimited = null; chooseAi(p); draw();
      } },
      folder ? h("img", { class: "nt-face", src: "buddy/" + folder + "/" + (limited ? "asleep" : "idle") + ".png", alt: "", width: "36", height: "36" }) : h("span", { class: "nt-face blank" }),
      h("span", { class: "nt-ai-t" }, h("b", {}, p.name), h("span", { class: "nt-hint" }, hint.lines.map((l, i) => h("span", { class: "nt-h " + (l.tone || "ok") }, l.text)))),
      limited ? h("span", { class: "nt-tag" }, "limited") : null);
  }

  function draw() {
    const kids = [];
    if (error) kids.push(h("p", { class: "au-err" }, error), h("button", { class: "np-btn", onclick: init }, "Try again"));
    else if (!opts) kids.push(h("div", { class: "skel" }), h("div", { class: "skel" }));
    else {
      const p = prov(), m = modelOf();
      kids.push(sel("Project", form.projectId, opts.projects.map((x) => [x.id, x.title]), (v) => (form.projectId = v)));
      kids.push(h("div", { class: "nt-f" }, h("span", { class: "nt-l" }, "AI"), h("div", { class: "nt-ais", role: "radiogroup", "aria-label": "AI" }, opts.providers.map(aiRow))));
      if (askLimited) {
        const lp = opts.providers.find((x) => x.instanceId === askLimited);
        kids.push(h("div", { class: "nt-ask", role: "alert", "data-act": "nt-limited-ask" }, h("p", {}, (lp?.reason || lp?.name + " is limited") + ". Use it anyway?"),
          h("div", { class: "acts" }, h("button", { class: "b m", type: "button", "data-act": "nt-limited-yes", onclick: () => { okLimited.add(lp.instanceId); askLimited = null; chooseAi(lp); draw(); } }, "Use it anyway"),
            h("button", { class: "b", type: "button", onclick: () => { askLimited = null; draw(); } }, "Pick another"))));
      }
      if (p) {
        const modelSel = sel("Model", form.model, p.models.map((x) => [x.slug, shortName(x.name)]), (v) => { form.model = v; const mm = p.models.find((x) => x.slug === v); form.effort = mm?.effort ? (mm.effort.options.find((o) => o.isDefault)?.id || "") : ""; });
        const style = p.planMode ? h("div", { class: "nt-f" }, h("span", { class: "nt-l" }, "Style"), seg(CHAT_PLAN, form.interactionMode, (v) => (form.interactionMode = v), "Chat or Plan")) : null;
        kids.push(h("div", { class: "nt-two" }, modelSel, style));
        if (m?.effort) kids.push(h("div", { class: "nt-f" }, h("span", { class: "nt-l" }, "Effort"), seg(m.effort.options.map((o) => [o.id, o.label]), form.effort, (v) => (form.effort = v), "Effort")));
        kids.push(h("div", { class: "nt-f" }, h("span", { class: "nt-l" }, "What it may do"), seg(MODES.filter((x) => p.runtimeModes.includes(x[0])), form.runtimeMode, (v) => (form.runtimeMode = v), "What it may do"),
          form.runtimeMode === "full-access" ? h("span", { class: "nt-warn" }, "Full access runs commands without asking.") : null));
      }
      kids.push(h("label", { class: "nt-f" }, h("span", { class: "nt-l" }, "First message"),
        h("textarea", { class: "nt-text", rows: "3", maxlength: "8000", "aria-label": "First message", placeholder: "What should it do?", disabled: busy || step === "confirm", oninput: (e) => { form.text = e.target.value; startBtn && (startBtn.disabled = busy || !form.text.trim()); } }, form.text)));
      if (fail) kids.push(h("p", { class: "au-err", role: "alert", "data-act": "nt-error" }, fail));
      if (step === "confirm") {
        const lines = confirmLines(kinds, p);
        kids.push(h("div", { class: "nt-confirm confirm", role: "alert", "data-act": "nt-confirm" }, lines.map((t) => h("p", {}, t)), h("p", { class: "nt-sum" }, "Start in " + projectTitle() + " with " + (p?.name || "") + " · " + shortName(m?.name) + "?"),
          h("div", { class: "acts" }, h("button", { class: "b y danger", type: "button", disabled: busy, "data-act": "nt-yes", onclick: (e) => start(e, true) }, "Yes, start it"),
            h("button", { class: "b", type: "button", disabled: busy, onclick: () => { step = "form"; draw(); } }, "Back"))));
      } else {
        startBtn = h("button", { class: "b y nt-start", type: "button", disabled: busy || !form.text.trim(), "data-act": "nt-start", onclick: (e) => start(e, false) }, busy ? "Starting…" : "Start");
        kids.push(h("div", { class: "acts nt-acts" }, startBtn, h("span", { class: "nt-note" }, "Pictures: attach them after the thread starts.")));
      }
    }
    const scroll = wrapScroll();
    body.replaceChildren(...kids.filter((k) => k != null && k !== false));
    restore(scroll);
  }
  let startBtn = null;
  const card = () => wrap.querySelector(".nt-card");
  const wrapScroll = () => card()?.scrollTop || 0;
  const restore = (y) => { if (card()) card().scrollTop = y; };

  draw();
  init();
}
