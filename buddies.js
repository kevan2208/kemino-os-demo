// The buddies: one pixel face per AI, each showing that AI's live state. They replace the usage chips on the home (and sit compact in the Mac top bar).
// Two halves. The top is PURE (state mapping, captions, quiet hours, "just finished" tracking) and is tested in Node.
// The bottom is the DOM: five persistent buttons per row (never rebuilt, so an animation is never cut short), one tap sheet, one animator.
// The engine is buddy.js (a classic script that sets window.Buddy) with buddy.css, because the CSP is style-src 'self'. Elements are built with h(), with no HTML strings and no inline style.
import { heardLine } from "./ledgerline.js";

/** The five AIs in row order: usage plan id (ai-usage key), the T3 provider instance, the buddy folder, the name shown. */
export const BUDDIES = [
  { id: "kemino", plan: "claude", instance: "claudeAgent", name: "Kemino" },
  { id: "kbb", plan: "claude_2", instance: "claudeAgent_2", name: "kbb" },
  { id: "codex", plan: "codex", instance: "codex", name: "Codex" },
  { id: "copilot", plan: "copilot", instance: "acpRegistry_copilot", name: "Copilot" },
  { id: "antigravity", plan: "antigravity", instance: "antigravity", name: "Antigravity" },
];
const BY_INSTANCE = new Map(BUDDIES.map((b) => [b.instance, b]));
/** Highest first: a buddy shows exactly one of these. */
export const PRIORITY = ["needsyou", "done", "working", "tired", "asleep", "idle"];
/** The frames each state loops through (2 fps, only for the one buddy that is allowed to move). */
export const FRAMES = { working: ["working", "working-b"], needsyou: ["needsyou", "needsyou-b"] };
export const TIRED_BELOW = 20;       // % left in the busiest window
export const DONE_MS = 8000;         // how long the "done" face stays
export const ONE_SHOT_GAP_MS = 10_000; // a second hop or wave waits at least this long
export const SAY_MS = 5000;

const num = (v) => typeof v === "number" && Number.isFinite(v);

/** The buddy for a T3 provider instance id, or null. */
export const buddyOfInstance = (instance) => BY_INSTANCE.get(instance) || null;

/** Who is behind a thread's model: { id, name, folder, idleUrl } or null for an unknown instance. The folder goes through the same demo map as the buddy row
 *  (window.KEMINO_BUDDY_FOLDERS, set by the public demo), so personal art never reaches the demo. */
export function aiOf(model) {
  const b = buddyOfInstance(model?.instanceId);
  if (!b) return null;
  const folder = (globalThis.KEMINO_BUDDY_FOLDERS && globalThis.KEMINO_BUDDY_FOLDERS[b.id]) || b.id;
  return { id: b.id, name: b.name, folder, idleUrl: "buddy/" + folder + "/idle.png" };
}

/** The smallest "% left" over a plan's windows (the busiest one), rounded; null when there is no reading. */
export function leftOf(plan) {
  const w = (plan && plan.windows || []).map((x) => x.leftPct).filter(num);
  return w.length ? Math.round(Math.min(...w)) : null;
}
/** Limited by the provider, or a window is used up (that is its stop). */
export function isAsleep(plan) {
  if (!plan) return false;
  if (plan.limited || plan.limitedUntil) return true;
  const l = leftOf(plan);
  return l !== null && l <= 0;
}
export const isTired = (plan) => { const l = leftOf(plan); return l !== null && l < TIRED_BELOW; };

/**
 * What every AI is doing, read from the Today data. Per buddy id: { needs: [{id,title,since}], running: [{id,title}] }, plus `index`:
 * thread id -> { buddy, status, title } (every thread the data lists), used to notice that a job just finished. Pure.
 * A root's own status is a roll-up; it counts as running itself only when more of its tree is "working" than its helpers account for.
 */
export function collect(data) {
  const out = { byBuddy: Object.fromEntries(BUDDIES.map((b) => [b.id, { needs: [], running: [] }])), index: new Map() };
  if (!data) return out;
  const add = (t, status, title) => {
    const b = buddyOfInstance(t.model && t.model.instanceId);
    if (!b) return null;
    out.index.set(t.id, { buddy: b.id, status, title: title || t.title || "(untitled)" });
    return b;
  };
  for (const g of [...(data.working || []), ...(data.done || [])]) {
    const kids = g.helpers || [];
    const kidsWorking = kids.filter((k) => k.status === "working").length;
    const rootWorking = g.status === "working" && ((g.counts ? g.counts.working : 1) - kidsWorking > 0 || !kids.length);
    const rb = add(g, g.status === "working" && !rootWorking ? "rolled" : g.status);
    if (rb && rootWorking) out.byBuddy[rb.id].running.push({ id: g.id, title: g.title });
    for (const k of kids) {
      const kb = add(k, k.status);
      if (kb && k.status === "working") out.byBuddy[kb.id].running.push({ id: k.id, title: k.title });
    }
  }
  for (const n of data.needs || []) {
    if (n.held) continue;
    const b = buddyOfInstance(n.provider) || (out.index.get(n.id) ? BUDDIES.find((x) => x.id === out.index.get(n.id).buddy) : null);
    if (b) out.byBuddy[b.id].needs.push({ id: n.id, title: n.title, since: n.since || 0 });
  }
  for (const b of BUDDIES) out.byBuddy[b.id].needs.sort((x, y) => x.since - y.since);
  return out;
}

/** Which jobs just finished: ids that were running or asking last time and are now listed as done. Returns the next memory and the buddies that finished one. Pure. */
export function trackFinished(prevActive, collected) {
  const next = new Map(), finished = [];
  for (const [id, buddy] of Object.entries(collected.byBuddy).flatMap(([b, v]) => [...v.running, ...v.needs].map((j) => [j.id, b]))) next.set(id, buddy);
  for (const [id, buddy] of prevActive || []) {
    if (next.has(id)) continue;
    const now = collected.index.get(id);
    if (now && now.status === "done" && !finished.includes(buddy)) finished.push(buddy);
  }
  return { next, finished };
}

/** One pose for one buddy, by the priority needsyou > done > working > tired > asleep > idle. `doneActive` = a job finished within DONE_MS. */
export function pickState({ needs = 0, running = 0, doneActive = false, plan = null }) {
  if (needs > 0) return "needsyou";
  if (doneActive) return "done";
  if (running > 0) return "working";
  if (isAsleep(plan)) return "asleep";   // asleep outranks tired: an AI at its stop is not just a bit low
  if (isTired(plan)) return "tired";
  return "idle";
}
/** The state of all five, in row order. `doneAt` is { buddyId: epoch ms of the finish }. Pure. */
export function buddyStates({ usage, data, doneAt = {}, now = Date.now() }) {
  const c = collect(data), plans = new Map(((usage && usage.plans) || []).map((p) => [p.id, p]));
  return BUDDIES.map((b) => {
    const plan = plans.get(b.plan) || null, mine = c.byBuddy[b.id];
    const state = pickState({ needs: mine.needs.length, running: mine.running.length, doneActive: num(doneAt[b.id]) && now - doneAt[b.id] < DONE_MS, plan });
    return { ...b, plan, state, left: leftOf(plan), count: mine.running.length + mine.needs.length, needs: mine.needs, running: mine.running, since: mine.needs[0] ? mine.needs[0].since : 0 };
  });
}

/** 22:00 to 07:30 local: every buddy holds still (needs-you keeps its mark). */
export function isQuiet(d = new Date()) { const m = d.getHours() * 60 + d.getMinutes(); return m >= 22 * 60 || m < 7 * 60 + 30; }

/** The frames to show: the looping pair for working and needs-you, else the single pose. `still` = hold the first frame. */
export const framesFor = (state) => FRAMES[state] || [state];
export const poseUrl = (folder, pose) => "buddy/" + folder + "/" + pose + ".png";

/** "18:29" today, "Sat 18:29" another day, in the phone's own time. */
export function clockText(v, now = new Date()) {
  const d = new Date(v);
  if (isNaN(d)) return "";
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === now.toDateString() ? t : d.toLocaleDateString("en-GB", { weekday: "short" }) + " " + t;
}
/** Which window is which, by the server's label ("5 hours", "7 days", "Weekly", "Premium interactions", Antigravity's "claude gpt weekly" / "gemini weekly"). */
function slotOf(label) {
  const l = String(label || "").toLowerCase();
  if (/gemini/.test(l)) return "gem";
  if (/claude|gpt/.test(l)) return "cg";
  if (/premium|month/.test(l)) return "mo";
  if (/5\s*h|hour/.test(l)) return "5h";
  if (/week|7\s*d|day/.test(l)) return "wk";
  return null;
}
const SHORT = { "5h": "5h", wk: "wk", mo: "mo", cg: "C/G", gem: "Gem" };
const ORDER = { kemino: ["5h", "wk"], kbb: ["5h", "wk"], codex: ["5h", "wk"], copilot: ["mo"], antigravity: ["cg", "gem"] };
/** Amber below 40% left, red below 20%. */
export const toneOf = (left) => (left < 20 ? "low" : left < 40 ? "mid" : "ok");
/** The honest line when a plan has no windows: the server's note ("reading failed: ...", "last read 40 min ago") or "not read yet". */
export const noReadingText = (plan) => (plan && plan.note ? plan.note : "not read yet");
/** The usage plan the server has for an AI instance ("copilot" -> the plan with id "copilot"), or null. Pure. */
export const planOfInstance = (instanceId, usage) => { if (!usage) return null; const b = buddyOfInstance(instanceId), plans = usage.plans || []; return plans.find((p) => b && p.id === b.plan) || plans.find((p) => p.id === instanceId) || null; }; // T3 may name an AI by its plan id ("copilot") or its registry id ("acpRegistry_copilot")
/** ONE text for "no usage windows" shared by Today (via captionOf), the Providers sheet and the New thread hint: the plan's own note ("reading failed: ..."), else `fallback`. Pure. */
export const noReadingFor = (instanceId, usage, fallback = "not read yet") => { const p = planOfInstance(instanceId, usage); return p && p.note ? p.note : fallback; };
/** Names that can be shortened where a column is truly too narrow (the full name stays in the title and the aria label). */
export const SHORT_NAME = { Antigravity: "Antigrav." };
export const nameShort = (n) => SHORT_NAME[n] || "";
/** Short form for the narrow face columns: drops the window label before "back" ("C/G back Sat 19:15" -> "back Sat 19:15") and trims "N min ago". Pure; the full text stays in the tooltip. */
export const shortLine = (t) => String(t || "").replace(/^(5h|wk|mo|C\/G|Gem)\s+(back\b)/, "$2").replace(/\s*min ago\b/, "m ago").replace(/^last read\b/, "read");
/** The lines under a face: its name, then one tiny line per window in a fixed order ("5h 94%", "wk 39%", all % left), or "back 18:29" / "limited" / "no reading".
 *  `lines` = [{ text, tone }] for the face; `line` = the same as one sentence for the aria label. */
export function captionOf(vm, now = new Date()) {
  const p = vm.plan;
  let lines = [];
  if (p && p.limitedUntil) lines = [{ text: "back " + clockText(p.limitedUntil, now), tone: "ok" }];
  else if (p && p.limited) {
    // limited without a stated end: the empty window's own reset time, if the reading has one
    const back = (p.windows || []).filter((w) => num(w.leftPct) && w.leftPct <= 0 && (w.resetsAt || w.resetsText)).map((w) => w.resetsAt ? clockText(w.resetsAt, now) : w.resetsText).find(Boolean);
    lines = [{ text: back ? "back " + back : "limited", tone: "ok" }];
  }
  else if (p) {
    const by = {};
    for (const w of p.windows || []) { const k = slotOf(w.label); if (k && num(w.leftPct) && !(k in by)) by[k] = { pct: Math.round(w.leftPct), back: w.resetsAt ? clockText(w.resetsAt, now) : (w.resetsText || "") }; }
    // an empty window shows when it is back ("5h back 18:40") instead of "0%", so that time is never lost
    lines = (ORDER[vm.id] || ["5h", "wk"]).filter((k) => k in by).map((k) => ({ text: SHORT[k] + " " + (by[k].pct <= 0 && by[k].back ? "back " + by[k].back : by[k].pct + "%"), tone: k === "wk" && p.pace && p.pace.ahead && toneOf(by[k].pct) === "ok" ? "mid" : toneOf(by[k].pct) }));   // ahead of week pace (pace.ts) = at least amber; red stays at 80% used
  }
  if (!lines.length) {
    // windows we cannot name: fall back to the busiest one so a reading is never hidden
    lines = [vm.left !== null && vm.left !== undefined ? { text: vm.left + "% left", tone: toneOf(vm.left) } : { text: noReadingText(p), tone: "ok" }];
  }
  if (p && p.staleMin !== undefined && p.note && !lines.some((l) => l.text === p.note)) lines = [...lines, { text: p.note, tone: "ok" }];
  return { name: vm.name, lines, line: lines.map((l) => l.text).join(", ") };
}
const STATE_WORD = { needsyou: "needs you", done: "just finished", working: "working", tired: "running low", asleep: "asleep", idle: "idle" };
export function stateWord(vm, now = new Date()) {
  if (vm.state === "asleep") { const p = vm.plan; return p && p.limitedUntil ? "asleep until " + clockText(p.limitedUntil, now) : "asleep (limited)"; }
  if (vm.state === "working" && vm.running.length > 1) return "working on " + vm.running.length + " jobs";
  return STATE_WORD[vm.state] || vm.state;
}
export const labelOf = (vm, now) => { const c = captionOf(vm, now); return vm.name + ", " + stateWord(vm, now) + ", " + c.line; };
/** Jobs for the tap sheet: the asking ones first, then running, at most `max`; `more` is how many were left out. */
export function sheetJobs(vm, max = 3) {
  const all = [...vm.needs.map((j) => ({ ...j, asks: true })), ...vm.running.filter((j) => !vm.needs.some((n) => n.id === j.id)).map((j) => ({ ...j, asks: false }))];
  return { jobs: all.slice(0, max), more: Math.max(0, all.length - max) };
}
/** "Codex needs you" (max 6 words); spoken once per event. */
export const sayOf = (vm) => vm.name + " needs you";

// ================= the DOM half (browser only) =================
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const folderOf = (id) => (globalThis.KEMINO_BUDDY_FOLDERS && globalThis.KEMINO_BUDDY_FOLDERS[id]) || id;

/**
 * deps: h (element builder), openThread(id), lastHeard() -> epoch ms. Returns { mount(kind, host), update({usage, data, now}), vms(), destroy() }.
 * Two rows live at once ("home" under the Today title, "top" in the Mac top bar); both show the same states.
 */
export function createBuddies(deps) {
  const { h } = deps;
  const rows = new Map();                // kind -> { el, nodes: Map(id -> node) }
  let vms = [], doneAt = {}, prev = new Map(), hasPrev = false, lastShot = 0, active = null, frame = 0, ticker = 0, breathAt = 0, breathI = 0, sheet = null, latest = null;
  const said = new Set();                // "<buddy>:<since>" already spoken
  const live = h("div", { class: "bd-live sr", "aria-live": "polite", "aria-atomic": "true", "data-buddy-live": "" });
  let sayTimer = 0, expireTimer = 0;

  const faceSize = (kind) => 48;         // art is 24 px: 2x, a whole-number scale (the engine floors anyway)
  function makeNode(kind, b) {
    const host = h("span", { class: "bd-face" });
    const cap = h("span", { class: "bd-cap" }, h("span", Object.assign({ class: "bd-nm" }, nameShort(b.name) ? { "data-short": nameShort(b.name), title: b.name } : {}), b.name), h("span", { class: "bd-lf" }, ""), h("span", { class: "bd-lf" }, ""));
    const pill = h("b", { class: "bd-n", "aria-hidden": "true", hidden: true }, "");
    const btn = h("button", { class: "bd", type: "button", "data-buddy": b.id, "data-state": "idle", "aria-haspopup": "dialog", onclick: () => openSheet(b.id) }, host, pill, cap);
    let buddy = null;
    try { buddy = globalThis.Buddy.create(host, { src: poseUrl(folderOf(b.id), "idle"), alt: "", height: faceSize(kind), hop: 8, injectStyle: false }); buddy.el.className = "pixel-buddy"; } catch { /* engine missing: the caption still tells the state */ }
    return { btn, buddy, pill, nm: cap.firstChild, lfs: [cap.children[1], cap.children[2]], lf: cap.children[1], state: "idle", pose: "idle" };
  }
  function rowFor(kind) {
    let r = rows.get(kind);
    if (!r) {
      const nodes = new Map(BUDDIES.map((b) => [b.id, makeNode(kind, b)]));
      r = { el: h("div", { class: "buddies " + kind, role: "group", "aria-label": "AI buddies" }, BUDDIES.map((b) => nodes.get(b.id).btn)), nodes };
      rows.set(kind, r);
      if (vms.length) paint(r, Date.now());
    }
    return r;
  }
  function setPose(node, folder, pose) {
    if (node.pose === pose) return;
    node.pose = pose;
    if (node.buddy) node.buddy.pose(poseUrl(folder, pose));
  }
  function hold(node, vm) { // still: the first frame, no move
    setPose(node, folderOf(vm.id), framesFor(vm.state)[0]);
    if (node.buddy) node.buddy.el.className = "pixel-buddy";
  }
  function paint(r, now) {
    const when = new Date(now);
    for (const vm of vms) {
      const n = r.nodes.get(vm.id), c = captionOf(vm, when);
      if (n.state !== vm.state) { n.state = vm.state; n.btn.dataset.state = vm.state; if (active !== vm.id) hold(n, vm); }
      if (n.nm.textContent !== c.name) { n.nm.textContent = c.name; const sh = nameShort(c.name); if (sh) { n.nm.dataset.short = sh; n.nm.title = c.name; } else { delete n.nm.dataset.short; n.nm.removeAttribute("title"); } }
      if (!n.lf.dataset.say) c.lines.concat([null, null]).slice(0, 2).forEach((l, i) => {
        const el = n.lfs[i], t = l ? shortLine(l.text) : "", tone = l && l.tone !== "ok" ? l.tone : "";
        if (el.textContent !== t) el.textContent = t;
        if (l) el.title = l.text; else el.removeAttribute("title"); // the full line is always on hover: a long reason ("reading failed: ...") is clipped with an ellipsis
        if ((el.dataset.tone || "") !== tone) { if (tone) el.dataset.tone = tone; else delete el.dataset.tone; }
        el.hidden = !t;
      });
      n.btn.dataset.asleep = vm.state === "asleep" ? "1" : "0";
      const label = labelOf(vm, when);
      if (n.btn.getAttribute("aria-label") !== label) n.btn.setAttribute("aria-label", label);
      n.btn.title = label;
      const show = vm.count >= 2;
      n.pill.hidden = !show; if (show) n.pill.textContent = String(vm.count);
    }
  }
  function stillNow(now) { return reduced() || isQuiet(new Date(now)); }
  /** Who moves: a buddy that needs you (waiting longest), else the first one working. At most one at a time; the rest hold still. */
  function chooseActive() {
    const asking = vms.filter((v) => v.state === "needsyou").sort((a, b) => a.since - b.since)[0];
    return (asking || vms.find((v) => v.state === "working") || null)?.id || null;
  }
  function forEachNode(fn) { for (const r of rows.values()) for (const [id, n] of r.nodes) fn(n, vms.find((v) => v.id === id), id); }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = 0; } }
  function tick() {
    const now = Date.now();
    if (document.hidden || stillNow(now) || !active) return;
    frame++;
    forEachNode((n, vm, id) => { if (vm && id === active) setPose(n, folderOf(id), framesFor(vm.state)[frame % framesFor(vm.state).length]); });
  }
  function hop(id, now) {
    if (stillNow(now) || document.hidden || now - lastShot < ONE_SHOT_GAP_MS) return;
    lastShot = now;
    forEachNode((n, vm, i) => { if (i === id && n.buddy) n.buddy.play("hop"); });
  }
  function breathe(now) { // calm idle: one idle buddy at a time, now and then, only when nothing else moves
    if (active || stillNow(now) || document.hidden || now - breathAt < 9000 || now - lastShot < 4000) return;
    const idle = vms.filter((v) => v.state === "idle");
    if (!idle.length) return;
    breathAt = now;
    const v = idle[breathI++ % idle.length];
    forEachNode((n, vm, i) => { if (i === v.id && n.buddy) n.buddy.play("idle"); });
  }
  function say(vm) {
    const key = vm.id + ":" + vm.since;
    if (said.has(key)) return;
    said.add(key);
    live.textContent = sayOf(vm);
    for (const r of rows.values()) { const n = r.nodes.get(vm.id); if (n) { n.lf.dataset.say = "1"; n.lf.textContent = "needs you"; } }
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { live.textContent = ""; forEachNode((n) => { delete n.lf.dataset.say; }); for (const r of rows.values()) paint(r, Date.now()); }, SAY_MS);
  }

  function update(input) {
    const now = input.now || Date.now();
    latest = input;
    const col = collect(input.data);
    const stale = !input.data || input.data.stale || input.data.connected === false;
    if (!stale) {
      const t = trackFinished(hasPrev ? prev : null, col);
      prev = t.next; hasPrev = true;
      for (const b of t.finished) doneAt[b] = now;
    }
    const before = new Map(vms.map((v) => [v.id, v.state]));
    vms = buddyStates({ usage: input.usage, data: input.data, doneAt, now });
    const newActive = chooseActive();
    if (newActive !== active) { const old = active; active = newActive; frame = 0; if (old) forEachNode((n, vm, id) => { if (id === old && vm) hold(n, vm); }); }
    for (const r of rows.values()) paint(r, now);
    forEachNode((n, vm, id) => {
      if (!vm) return;
      if (id !== active || stillNow(now)) hold(n, vm);
      else setPose(n, folderOf(id), framesFor(vm.state)[frame % framesFor(vm.state).length]);
    });
    for (const vm of vms) {
      if (vm.state === "done" && before.get(vm.id) !== "done") hop(vm.id, now);
      if (vm.state === "needsyou") say(vm);
    }
    // the done face expires on its own timer, so it never lingers when nothing else changes
    const soon = Object.values(doneAt).filter((t) => now - t < DONE_MS).map((t) => t + DONE_MS - now);
    clearTimeout(expireTimer);
    if (soon.length) expireTimer = setTimeout(() => latest && update({ ...latest, now: undefined }), Math.min(...soon) + 50);
    if (active && !stillNow(now)) { if (!ticker) ticker = setInterval(tick, 500); } else stopTicker();
    breathe(now);
    if (sheet) sheet.update(vms.find((v) => v.id === sheet.id));
  }

  /** Put this row into its host (the home's #buddy-row or the Mac top bar's #buddy-top). The nodes are reused, so nothing restarts. */
  function mount(kind, host) {
    if (!host) return;
    const r = rowFor(kind);
    if (!live.isConnected) document.body.append(live); // one polite region for the whole app, outside both rows: only "needs you" is ever announced
    if (host.firstChild !== r.el || host.childNodes.length !== 1) host.replaceChildren(r.el);
  }

  // ---------- the tap sheet: the same for all five ----------
  function openSheet(id) {
    const vm = vms.find((v) => v.id === id);
    if (!vm) return;
    sheet?.close();
    const body = h("div", { class: "bs-body bd-sheet-body" });
    const title = h("strong", { class: "bd-sheet-title" }, "");
    const face = h("img", { class: "bd-sheet-face", alt: "", width: 48, height: 48, src: poseUrl(folderOf(id), "idle") });
    const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); if (sheet && sheet.id === id) sheet = null; };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    const wrap = h("div", { class: "np-wrap bs-wrap bd-sheet", role: "dialog", "aria-modal": "true", "aria-label": vm.name, "data-sheet": "buddy", onclick: (e) => { if (e.target === wrap) close(); } },
      h("div", { class: "np-card bs-card" }, h("div", { class: "np-head" }, h("span", { class: "bd-sheet-head" }, face, title), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")), body));
    const draw = (v) => {
      if (!v) return close();
      const now = new Date();
      title.textContent = v.name + " · " + stateWord(v, now);
      face.src = poseUrl(folderOf(v.id), framesFor(v.state)[0]);
      const p = v.plan, wins = (p && p.windows) || [];
      const { jobs, more } = sheetJobs(v);
      const heard = heardLine(deps.lastHeard ? deps.lastHeard() : 0, Date.now());
      body.replaceChildren(...[
        v.state === "asleep" ? h("p", { class: "bd-back", "data-line": "back" }, p && p.limitedUntil ? "Back at " + clockText(p.limitedUntil, now) : "Limited right now.") : null,
        h("div", { class: "bd-sec" }, "Usage"),
        wins.length ? h("ul", { class: "bd-wins" }, wins.map((w) => h("li", { "data-win": w.label }, h("b", {}, w.label), " ", Math.round(w.leftPct) + "% left", w.resetsAt ? " · resets " + clockText(w.resetsAt, now) : w.resetsText ? " · resets " + w.resetsText : "")))
          : h("p", { class: "bd-none" }, p && p.limitedUntil ? "Limited until " + clockText(p.limitedUntil, now) + "." : (p && p.note ? "No usage reading: " + p.note + "." : "No usage reading yet.")),
        h("div", { class: "bd-sec" }, "Running jobs"),
        jobs.length ? h("ul", { class: "bd-jobs" }, jobs.map((j) => h("li", {}, h("button", { class: "bd-job" + (j.asks ? " asks" : ""), "data-job": j.id, onclick: () => { close(); deps.openThread(j.id); } },
          h("span", { class: "bd-jt" }, j.title), j.asks ? h("small", {}, "needs you") : null))))
          : h("p", { class: "bd-none" }, "Nothing running."),
        more ? h("p", { class: "bd-none" }, "+" + more + " more") : null,
        h("p", { class: "bd-heard" + (heard.red ? " red" : ""), "data-line": "heard" }, heard.text)].filter(Boolean));
    };
    draw(vm);
    addEventListener("keydown", onKey, true);
    document.body.append(wrap);
    sheet = { id, close, update: (v) => { if (wrap.isConnected) draw(v); } };
  }

  return {
    mount, update, vms: () => vms, openSheet,
    destroy() { stopTicker(); clearTimeout(sayTimer); clearTimeout(expireTimer); sheet?.close(); rows.clear(); live.remove(); },
  };
}
