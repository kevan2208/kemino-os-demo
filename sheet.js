// Mini chat sheet over the office: the last 3 messages of one thread, the question or approval it is waiting on (Yes / No / Later),
// and a reply box. It reuses the app's own respond/send paths (deps.needCard, deps.post), so every write guard still applies:
// real click, CSRF token, x-kemino header, the "asks twice" confirm for risky things. No innerHTML anywhere.
const IMG_MD = /!\[[^\]]*\]\(t3-context:\/\/v1\/image\/[A-Za-z0-9_-]+\)/g;

/** The last `n` messages of a chat that a person would read: yours and the agent's, not the tool steps. Pure (tested in Node). */
export function lastMessages(chat, n = 3, max = 280) {
  const items = Array.isArray(chat?.items) ? chat.items : [];
  const out = [];
  for (const it of items) {
    if (!it || (it.role !== "user" && it.role !== "assistant")) continue;
    let text = String(it.text ?? "").replace(IMG_MD, "[picture]").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length > max) text = text.slice(0, max - 1).trimEnd() + "…";
    out.push({ id: String(it.id ?? out.length), role: it.role, text, at: it.at, ...(it.role === "user" && (it.kind === "agent" || it.kind === "system") ? { kind: it.kind } : {}) });
  }
  return out.slice(-Math.max(0, n));
}

let cur = null;
export const sheetOpenId = () => cur?.id ?? null;
export function closeSheet() { cur?.close(); }
export function refreshSheet() { cur?.refresh(); }

/**
 * deps: h, post, toast, toLogin, badge, ago, live(), cachedChat(id), headOf(id), needFor(id, chat), needCard(need, selected, {sheet:true}),
 *       asks() -> ids of workers who ask, goto(id) (next/prev), openFull(id), onClose(), voice?(textarea) -> button | null
 */
export function openSheet(deps, id) {
  if (cur?.id === id) return cur;
  cur?.close(true);
  const { h } = deps;
  const st = { chat: deps.cachedChat(id) || null, fetching: false, lastFetch: 0, text: "", confirm: null, sending: false, sig: "", closed: false };
  const ta = h("textarea", { class: "os-ta", rows: "1", placeholder: "Reply to this thread", "aria-label": "Reply", enterkeyhint: "send",
    oninput: () => { st.text = ta.value; grow(); sync(); },
    onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && matchMedia("(hover: hover)").matches && !e.isComposing) { e.preventDefault(); send(e); } } });
  const grow = () => { ta.style.height = "42px"; if (ta.value) ta.style.height = Math.min(Math.max(ta.scrollHeight, 42), 130) + "px"; };
  const sendBtn = h("button", { class: "send os-send", "aria-label": "Send reply", onclick: (e) => send(e) }, "↑");
  const mic = deps.voice ? deps.voice(ta, () => { st.text = ta.value; grow(); sync(); }) : null;
  const sync = () => { sendBtn.disabled = !deps.live() || !ta.value.trim() || st.sending; ta.disabled = !deps.live(); };

  const body = h("div", { class: "os-body" });
  const card = h("div", { class: "os-card" }, body);
  const wrap = h("div", { class: "os-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Quick chat", "data-id": id, onclick: (e) => { if (e.target === wrap) api.close(); } }, card);
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); api.close(); } };

  async function send(e, confirm = false) {
    const text = ta.value.trim();
    if (!text || st.sending || !deps.live()) return;
    st.sending = true; sync();
    try {
      await deps.post("/api/send", { threadId: id, text, confirm }, e);
      st.confirm = null; ta.value = ""; st.text = ""; grow();
      deps.toast("Sent");
      st.lastFetch = 0; render(true);
    } catch (err) {
      if (err.needsConfirm) { st.confirm = { text, kinds: err.kinds }; render(true); } else deps.toast(err.message, true);
    } finally { st.sending = false; sync(); }
  }

  async function fetchChat() {
    if (st.fetching || st.closed || Date.now() - st.lastFetch < 1500) return;
    st.fetching = true; st.lastFetch = Date.now();
    try {
      const r = await fetch("/api/thread?id=" + encodeURIComponent(id));
      if (r.status === 401) return deps.toLogin();
      if (r.ok) { st.chat = await r.json(); }
    } catch { /* offline: keep what we have */ }
    finally { st.fetching = false; }
    if (!st.closed) render();
  }

  function render(force = false) {
    if (st.closed) return;
    const head = deps.headOf(id), msgs = lastMessages(st.chat);
    const need = deps.needFor(id, st.chat);
    const asks = deps.asks();
    const q = need && need.kind === "question";
    const sig = JSON.stringify([head, msgs, need, deps.live(), asks, st.confirm, !!st.chat?.running, deps.stateKey?.(id)]);
    if (!force && sig === st.sig) { sync(); return; }
    st.sig = sig;
    const pos = asks.indexOf(id);
    const nodes = [
      h("div", { class: "os-head" },
        deps.badge(head?.status || "done", 18),
        h("div", { class: "os-t" }, h("h2", {}, head?.title || "Thread"), h("small", {}, [head?.project, head?.status === "needs-you" ? "asks you" : head?.status].filter(Boolean).join(" · "))),
        asks.length > 1 || (asks.length === 1 && pos < 0) ? h("span", { class: "os-nav" },
          h("button", { class: "os-arrow", "data-act": "sheet-prev", "aria-label": "Previous worker who needs you", title: "Previous who needs you", onclick: () => deps.goto(-1) }, "‹"),
          h("span", { class: "os-count" }, pos >= 0 ? (pos + 1) + "/" + asks.length : asks.length + " ask"),
          h("button", { class: "os-arrow", "data-act": "sheet-next", "aria-label": "Next worker who needs you", title: "Next who needs you", onclick: () => deps.goto(1) }, "›")) : null,
        h("button", { class: "np-x", "aria-label": "Close", "data-act": "sheet-close", onclick: () => api.close() }, "×")),
      h("ul", { class: "os-msgs", "aria-label": "Last messages" },
        msgs.length ? msgs.map((m) => h("li", { class: "os-m " + (m.kind ? "assistant" : m.role) }, h("b", {}, m.kind === "system" ? "System" : m.kind === "agent" ? "Agent" : m.role === "user" ? "You" : "Agent"), h("span", {}, m.text)))
          : [h("li", { class: "os-m none" }, st.chat ? "No messages yet." : "Loading…")]),
      st.chat?.running ? h("div", { class: "os-run" }, deps.badge("working", 14), "Working…") : null,
      need ? deps.needCard(need, false, { sheet: true }) : null,
      q ? h("div", { class: "os-q" }, h("p", { class: "hint" }, "This worker asks a question with choices. Open the chat to answer."),
        h("button", { class: "b y", "data-act": "sheet-answer", onclick: () => deps.openFull(id) }, "Open the chat to answer")) : null,
      st.confirm ? h("div", { class: "confirm" }, h("p", {}, "This message mentions " + st.confirm.kinds.join(" and ") + ". Send it?"),
        h("div", { class: "acts" }, h("button", { class: "b danger y", "data-act": "sheet-confirm", onclick: (e) => send(e, true) }, "Yes, send"),
          h("button", { class: "b", onclick: () => { st.confirm = null; render(true); } }, "Edit"))) : null,
      h("div", { class: "composer os-composer" }, ta, mic, sendBtn),
      h("div", { class: "os-foot" }, h("button", { class: "np-btn", "data-act": "sheet-full", onclick: () => deps.openFull(id) }, "Open full chat")),
    ];
    body.replaceChildren(...nodes.filter(Boolean));
    sync();
  }

  const api = {
    id,
    refresh() { if (st.closed) return; render(); void fetchChat(); },
    close(silent = false) {
      if (st.closed) return;
      st.closed = true; wrap.remove(); removeEventListener("keydown", onKey, true);
      if (cur === api) cur = null;
      if (!silent) deps.onClose?.(id);
    },
  };
  cur = api;
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);
  render(true); void fetchChat();
  return api;
}
