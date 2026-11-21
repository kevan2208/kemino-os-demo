// Quick-chat desk (layer 0): the "Ask" button in the top bar on every screen and the desk itself (a side sheet on the Mac that pushes the page, a bottom sheet on the phone).
// Answers come only from Kemino's own data (desk-core.js). No AI, no keys, no network except two read-only GETs. Elements only: no HTML strings, no inline styles.
// Easy to change later (You will refine it): everything visual is in desk.css; the wording is in desk-core.js; this file only wires them.
import { headCard, sendBlock, POLL_MS, GIVE_UP_MS, SEND_HINT } from "./desk-head.js";
import { CHIPS, FREE_HINT, answerFor, asOfLine, claudeOut, parseCommand } from "./desk-core.js";

const SVGNS = "http://www.w3.org/2000/svg";
function askIcon() {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "20"); s.setAttribute("height", "20"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "ask-ic");
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", "M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15h-.5A2.5 2.5 0 0 1 4 12.5z");
  p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "1.8"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
  s.append(p); return s;
}

/**
 * deps: h, fill (element builders), isDesk() -> bool (>= 900px), canType() -> bool (a real keyboard), ctx() -> { usage, vms, needCount, connected, now },
 *       post(path, body, event) -> Promise (guarded POST), headInfo(id?) -> Promise<json|null> (GET /api/desk/head[?id=]), screen() -> a screen id (today, chat, ...),
 *       loadNext() -> Promise<{available,...}|null> (GET /api/desk/next), refresh() -> Promise (reload usage), host() -> the element the sheet is added to (desktop: next to the page).
 * Returns { button, toggle, open, close, isOpen, sync }.
 */
export function createDesk(deps) {
  const { h, fill } = deps;
  const st = { headInfo: null, open: false, msgs: [], busy: 0, panel: null, list: null, input: null, opener: null };
  const MAX_MSGS = 40;

  const buttons = () => Array.from(document.querySelectorAll("[data-act=ask]"));
  function out() { try { return claudeOut(deps.ctx().usage, Date.now()); } catch { return { out: false, until: "" }; } }
  /** The pill itself. Rebuilt by the top bar whenever it redraws, so every state is read at build time. */
  function button() {
    const o = out();
    return h("button", { class: "ask" + (o.out ? " out" : ""), type: "button", "data-act": "ask", "aria-expanded": st.open ? "true" : "false", "aria-controls": "deskpanel",
      "aria-label": "Ask: quick desk" + (o.out ? ", Claude is out, the desk still works" : ""), title: "Quick desk (Ctrl/⌘ J)", onclick: (e) => { st.opener = e.currentTarget; toggle(); } },
      askIcon(), h("span", { class: "ask-t" }, "Ask"), h("kbd", { class: "ask-k", "aria-hidden": "true" }, "⌘J"));
  }
  /** Keep every Ask button's aria-expanded and "out" dot in step without a redraw. */
  function sync() {
    const o = out();
    for (const b of buttons()) { b.setAttribute("aria-expanded", st.open ? "true" : "false"); b.classList.toggle("out", o.out); }
    if (st.open) drawBanner();
  }

  // ---- Send to head (layer 2): free text becomes a draft card with one button; after a send the card follows the head's answer ----
  let pollTimer = null;
  function draftNode(m) {
    const why = m.sent ? "" : sendBlock(st.headInfo);
    const btn = h("button", { class: "dk-sendhead" + (m.confirm ? " warn" : ""), type: "button", disabled: !!why || m.sending, "aria-describedby": why ? "dkwhy" + m.n : null,
      onclick: (e) => sendToHead(m, e) }, m.sending ? "Sending\u2026" : m.confirm ? "Send anyway" : "Send to head");
    return h("div", { class: "dk-m" },
      h("div", { class: "dk-ans dk-hd", "data-kind": "draft" },
        h("small", {}, "Not a desk command"),
        h("div", { class: "dk-line" }, "Send this to the head thread?"),
        m.err ? h("div", { class: "dk-err", role: "alert" }, m.err) : null,
        h("div", { class: "dk-act" }, btn, h("span", { class: "dk-why", id: "dkwhy" + m.n }, why || SEND_HINT))));
  }
  function headNode(m) {
    const c = headCard(m.status, m.sentAt, Date.now(), !!m.timedOut);
    return h("div", { class: "dk-m" },
      h("div", { class: "dk-ans dk-hd " + c.tone, "data-kind": "head", role: c.tone === "replied" ? "status" : null },
        h("small", {}, c.title),
        c.lines.map((l) => h("div", { class: "dk-line" + (c.tone === "replied" ? " reply" : "") }, l)),
        h("div", { class: "dk-meta" }, c.tags.map((t) => h("span", { class: "dk-tag" }, t)))));
  }
  let draftN = 0;
  function draft(text) {
    const m = { t: "draft", n: ++draftN, text, sending: false, confirm: false, err: "" };
    add(m);
    if (!st.headInfo) deps.headInfo().then((i) => { st.headInfo = i || { available: false, why: "Could not reach the head thread." }; drawList(false); }).catch(() => { st.headInfo = { available: false, why: "Could not reach the head thread." }; drawList(false); });
    return m;
  }
  async function sendToHead(m, e) {
    if (m.sending || sendBlock(st.headInfo)) return;
    m.sending = true; m.err = ""; drawList(false);
    try {
      const r = await deps.post("/api/desk/head", { text: m.text, screen: deps.screen(), confirm: m.confirm }, e);
      const id = r && r.check && r.check.messageId;
      const i = st.msgs.indexOf(m);
      const h2 = { t: "head", id, sentAt: Date.now(), status: { state: r && r.queued ? "queued" : "waiting" }, timedOut: false };
      if (i >= 0) st.msgs[i] = h2; else st.msgs.push(h2);
      drawList(true); poll();
    } catch (err) {
      m.sending = false;
      if (err && err.needsConfirm) { m.confirm = true; m.err = "This looks like it asks for something risky. Tap again to send anyway."; }
      else m.err = (err && err.message) || "Could not send.";
      drawList(true); // the card grows by the warning line: scroll so the amber button sits fully in view above the compose bar
      const btn = st.list && st.list.querySelector(".dk-sendhead.warn"); if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: "nearest" });
    }
  }
  /** A sent message we still look for: not answered, not "unknown" (the head thread must be opened), not given up on. */
  const waiting = (m) => m.t === "head" && m.id && !m.timedOut && !(m.status && (m.status.state === "replied" || m.status.state === "unknown"));
  /** One poll loop for every message still waiting on the head; stops by itself when all are answered or old. */
  let backoff = 0;
  function poll() {
    if (pollTimer) return;
    const tick = async () => {
      pollTimer = null;
      const open_ = st.msgs.filter(waiting);
      if (!open_.length) return;
      let changed = false;
      for (const m of open_) {
        if (Date.now() - m.sentAt > GIVE_UP_MS) { m.timedOut = true; changed = true; continue; }
        try {
          const r = await deps.headInfo(m.id);
          backoff = r ? 0 : Math.min(backoff ? backoff * 2 : POLL_MS, 30000); // no answer (429 or offline): wait longer, then longer
          if (r && r.available !== false && r.state) {
            const next = { state: r.state, position: r.position, reply: r.reply, title: r.title, text: r.text };
            if (JSON.stringify(next) !== JSON.stringify(m.status)) { m.status = next; changed = true; }
          }
        } catch { /* try again next tick */ }
      }
      // Redraw only when a status changed, and never force the list to the bottom: it follows only when You was already there.
      if (changed && st.list) { const l = st.list, atEnd = l.scrollHeight - l.scrollTop - l.clientHeight < 40, top = l.scrollTop; drawList(false); l.scrollTop = atEnd ? l.scrollHeight : top; }
      if (st.msgs.some(waiting)) pollTimer = setTimeout(tick, Math.max(POLL_MS, backoff));
    };
    pollTimer = setTimeout(tick, 1200);
  }

  // ---- messages ----
  function add(m) { st.msgs.push(m); if (st.msgs.length > MAX_MSGS) st.msgs.splice(0, st.msgs.length - MAX_MSGS); drawList(true); }
  function msgNode(m) {
    if (m.t === "you") return h("div", { class: "dk-m you" }, h("span", { class: "dk-b" }, m.text));
    if (m.t === "wait") return h("div", { class: "dk-m" }, h("span", { class: "dk-wait", role: "status" }, "Looking…"));
    if (m.t === "draft") return draftNode(m);
    if (m.t === "head") return headNode(m);
    const a = m.a, asof = asOfLine(a, Date.now());
    return h("div", { class: "dk-m" },
      h("div", { class: "dk-ans" + (a.empty ? " empty" : ""), "data-kind": a.kind },
        h("small", {}, a.title, a.kind === "note" ? null : " · from Kemino's own data"),
        a.lines.map((l) => h("div", { class: "dk-line" }, l)),
        a.bar != null ? h("div", { class: "dk-bar", role: "img", "aria-label": a.bar + "% used" }, h("i", { class: "dk-fill", "data-pct": String(a.bar) })) : null,
        h("div", { class: "dk-meta" }, a.tags.map((t) => h("span", { class: "dk-tag" }, t)), asof ? h("span", { class: "dk-tag asof" }, asof) : null)),
      h("span", { class: "dk-cost" }, FREE_HINT));
  }
  function drawList(stick) {
    if (!st.list) return;
    // Keep keyboard focus across the redraw: remember which button inside the list had it, give it back to the same position.
    const act = document.activeElement, btns = [...st.list.querySelectorAll("button")], at = act && st.list.contains(act) ? btns.indexOf(act) : -1;
    fill(st.list, st.msgs.length ? st.msgs.map(msgNode) : h("p", { class: "dk-empty" }, "Tap a button, or type /status /next /usage /jobs. Anything else can be sent to the head thread."));
    for (const f of st.list.querySelectorAll(".dk-fill")) f.style.setProperty("--w", String(Math.min(100, Math.max(0, Number(f.dataset.pct) || 0)) / 100));
    if (at >= 0) { const nb = st.list.querySelectorAll("button")[at]; if (nb && document.activeElement !== nb) nb.focus({ preventScroll: true }); }
    if (stick) st.list.scrollTop = st.list.scrollHeight;
  }
  function drawBanner() {
    const box = st.panel && st.panel.querySelector(".dk-out"); if (!box) return;
    const o = out();
    box.hidden = !o.out;
    if (o.out) fill(box, h("b", {}, "Claude is out: the desk still works"), h("span", {}, "These answers need no AI." + (o.until ? " Claude is back " + o.until + "." : "")));
  }

  async function ask(text) {
    const cmd = parseCommand(text); if (!cmd) return;
    add({ t: "you", text: String(text).trim().slice(0, 200) });
    if (cmd === "text") { draft(String(text).trim()); return; }
    let wait = null;
    if (cmd === "next" || cmd === "status") { /* status needs no file; next reads the plan files */ }
    let next = null;
    if (cmd === "next") { wait = { t: "wait" }; st.msgs.push(wait); drawList(true); try { next = await deps.loadNext(); } catch { next = null; } st.msgs.splice(st.msgs.indexOf(wait), 1); }
    if (cmd === "usage" || cmd === "status") { try { await Promise.race([deps.refresh(), new Promise((r) => setTimeout(r, 1500))]); } catch { /* keep the last reading; the card says how old it is */ } }
    const c = deps.ctx();
    add({ t: "ans", a: answerFor(cmd, { ...c, next, now: Date.now() }) });
    sync();
  }

  // ---- the sheet ----
  function build() {
    const input = h("input", { id: "deskin", class: "dk-in", type: "text", placeholder: "A command, or a note for the head", "aria-label": "Ask the desk", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "send" });
    const form = h("form", { class: "dk-cmp", onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ""; ask(v); } } },
      input, h("button", { class: "dk-send", type: "submit" }, "Send"));
    const list = h("div", { class: "dk-list", id: "dklist", "aria-live": "polite" });
    const phone = !deps.isDesk();
    const panel = h("section", { class: "dk-sheet", id: "deskpanel", role: phone ? "dialog" : "complementary", "aria-modal": phone ? "true" : null, "aria-label": "Quick desk", tabindex: "-1" },
      h("div", { class: "dk-grab", "aria-hidden": "true" }),
      h("div", { class: "dk-head" }, h("h2", {}, "Quick desk"), h("button", { class: "dk-x", type: "button", "aria-label": "Close quick desk", title: "Close (Esc)", onclick: () => close() }, phone ? "Done" : "Close", phone ? null : h("kbd", {}, "Esc"))),
      h("div", { class: "dk-out", role: "status", hidden: true }),
      h("div", { class: "dk-chips", role: "group", "aria-label": "Instant answers, free" }, CHIPS.map(([k, label]) => h("button", { class: "dk-chip", type: "button", "data-cmd": k, onclick: () => ask("/" + k) }, label))),
      list,
      h("p", { class: "dk-fine" }, "Free and instant: no AI, no account. Answers read Kemino’s own state and say how old they are. Other text can go to the head: one message, nothing else attached."),
      form);
    st.panel = panel; st.list = list; st.input = input;
    drawList(false); drawBanner();
    return panel;
  }
  function onKey(e) {
    if (e.key !== "Escape" || !st.open) return;
    const t = e.target;
    if (document.querySelector("[role=dialog]:not(#deskpanel)")) return; // another layer is on top: it closes first
    const idle = t === document.body || t === document.documentElement || (t && t.closest && !!t.closest("button, a, [role=button], [role=tab], [role=menuitem]") && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); // focus parked on a button (e.g. the More control a closed full page returned it to) must not trap Esc
    if (st.panel && (st.panel.contains(t) || idle)) { e.preventDefault(); e.stopPropagation(); close(); }
  }
  function open() {
    if (st.open) return;
    st.open = true;
    const host = deps.host(); if (!host) { st.open = false; return; }
    const panel = build();
    host.append(panel);
    document.documentElement.classList.add("desk-open");
    document.addEventListener("keydown", onKey, true);
    st.headInfo = null; deps.headInfo && deps.headInfo().then((i) => { st.headInfo = i; if (st.open) drawList(false); }).catch(() => {});
    sync();
    deps.refresh && deps.refresh().then(() => { if (st.open) sync(); }).catch(() => {});
    const focusIn = () => (deps.canType() ? st.input : panel).focus({ preventScroll: true });
    requestAnimationFrame(focusIn);
  }
  function close() {
    if (!st.open) return;
    st.open = false;
    document.removeEventListener("keydown", onKey, true);
    const panel = st.panel; st.panel = st.list = st.input = null;
    if (panel) panel.remove();
    document.documentElement.classList.remove("desk-open");
    sync();
    const back = () => {
      const act = document.activeElement;
      if (act && act !== document.body && act.isConnected) return; // focus already lives somewhere useful
      const b = (st.opener && st.opener.isConnected && st.opener) || buttons().find((x) => x.offsetParent !== null) || buttons()[0];
      if (b && !st.open) b.focus({ preventScroll: true });
    };
    back();
    // the page redraws its top bar a moment after a close and drops the focus with the old button: watch the bars for a few seconds and refocus once per redraw
    const bars = [document.getElementById("top"), document.getElementById("chat-head")].filter(Boolean);
    const mo = new MutationObserver(() => { st.opener = null; back(); });
    for (const el of bars) mo.observe(el, { childList: true });
    setTimeout(() => mo.disconnect(), 3000);
  }
  function toggle() { st.open ? close() : open(); }
  /** The window changed between phone and Mac while open: close, so the sheet is rebuilt in the right form next time. */
  function resized() { if (st.open) { close(); } }
  return { button, toggle, open, close, isOpen: () => st.open, sync, resized, ask };
}
