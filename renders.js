// RENDER CARDS: a page an agent drew with html_render, shown inside the chat at its place. The page is hostile input:
// it only ever runs in a sandboxed iframe (allow-scripts, NO same-origin) whose address is a short-lived signed /render/<token>
// served with its own sandbox CSP (server render.ts). The html never travels in the chat JSON. Classes only (CSP).

export const INLINE_MAX = 420;
export const clampHeight = (n) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(900, Math.max(120, v)) : INLINE_MAX; };
export const inlineHeight = (n) => Math.min(clampHeight(n), INLINE_MAX);
const SANDBOX = "allow-scripts"; // never add allow-same-origin, allow-popups, allow-forms, allow-top-navigation

const cards = new Map(); // item id -> card element (kept, so a chat refresh does not reload the page)

/** Fetches a fresh token url (they live 5 minutes) for one render. */
async function mint(thread, item) {
  const r = await fetch("/api/render?thread=" + encodeURIComponent(thread) + "&item=" + encodeURIComponent(item), { credentials: "same-origin" });
  if (!r.ok) throw new Error("gone");
  return (await r.json()).url;
}

function frame(src, title) {
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", SANDBOX); f.setAttribute("referrerpolicy", "no-referrer"); f.setAttribute("title", title); f.setAttribute("loading", "lazy");
  f.className = "rframe"; f.src = src;
  return f;
}

function fullscreen(h, thread, m) {
  const close = () => { box.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const body = h("div", { class: "rfs-body" }, h("div", { class: "rnote" }, "Loading…"));
  const box = h("div", { class: "rfs", role: "dialog", "aria-label": m.title },
    h("div", { class: "rfs-bar" }, h("b", {}, m.title), h("button", { class: "rfs-x", type: "button", "aria-label": "Close", onclick: close }, "Close")), body);
  addEventListener("keydown", onKey, true);
  document.body.append(box);
  mint(thread, m.id).then((u) => body.replaceChildren(frame(u, m.title)), () => body.replaceChildren(h("div", { class: "rnote" }, "This page is no longer available.")));
  box.querySelector(".rfs-x").focus();
}

/** One card for a chat item {id, title, height, at}. Same item = same element. */
export function renderCard({ h, m, threadId }) {
  const key = threadId + "|" + m.id;
  const old = cards.get(key);
  if (old) return old;
  const slot = h("div", { class: "rslot" }, h("div", { class: "rnote" }, "Loading…"));
  slot.style.height = inlineHeight(m.height) + "px"; // CSSOM, allowed under CSP (not an inline attribute)
  const card = h("div", { class: "m render", "data-render": m.id },
    h("div", { class: "rhead" }, h("b", { class: "rtitle" }, m.title), h("button", { class: "rfull", type: "button", "aria-label": "Full screen", title: "Full screen", onclick: () => fullscreen(h, threadId, m) }, "\u2922")), slot);
  const load = () => mint(threadId, m.id).then((u) => slot.replaceChildren(frame(u, m.title)), () => slot.replaceChildren(h("div", { class: "rnote" }, "This page is no longer available.")));
  if (typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: "300px" });
    io.observe(card);
  } else load();
  cards.set(key, card);
  if (cards.size > 60) cards.delete(cards.keys().next().value);
  return card;
}

/** Puts `nodes` into `parent` WITHOUT moving render cards that are already there (moving an iframe reloads it). */
export function reconcile(parent, nodes) {
  let ref = parent.firstChild;
  for (const n of nodes) {
    if (n.parentNode === parent && n.classList?.contains("render")) {
      while (ref && ref !== n) { const next = ref.nextSibling; ref.remove(); ref = next; }
      ref = n.nextSibling;
    } else parent.insertBefore(n, ref);
  }
  while (ref) { const next = ref.nextSibling; ref.remove(); ref = next; }
}
