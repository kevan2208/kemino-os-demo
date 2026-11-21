// PHONE BOTTOM BAR "A" (You, 8 Nov): Today / Office / Map / All / More as a tab bar, a waving buddy dot on Today when something needs him,
// and the search as a sheet from the top (a magnifier in the header). Phone only (< 900px); the desktop never draws any of this.
// The top half is PURE (tested in Node). The bottom half builds elements with the app's h(): no HTML strings, no inline styles (CSP).
import { poseUrl } from "./buddies.js";

/** The four views in tab order: [S.mode value, word shown]. "More" is the fifth tab and is not a view. */
export const TABS = [["list", "Today"], ["office", "Office"], ["map", "Map"], ["all", "All"]];

/** Which tab is active: none while a chat is open or for an unknown mode. */
export const activeTab = (mode, openId) => (!openId && TABS.some(([m]) => m === mode) ? mode : "");

/** The dot on Today: how many need him, and the buddy of the AI that has waited longest. null when nothing needs him. `vms` = buddies.vms(). Pure. */
export function dotOf(vms, count) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  const asking = (vms || []).filter((v) => v.needs && v.needs.length).sort((a, b) => (a.since || 0) - (b.since || 0))[0];
  return { count: n, buddy: asking ? { id: asking.id, name: asking.name } : null };
}
/** Same folder map as the buddy row (the public demo swaps personal art out). */
export const folderOf = (id, map = globalThis.KEMINO_BUDDY_FOLDERS) => (map && map[id]) || id;
export const dotLabel = (dot) => (dot ? dot.count + (dot.count === 1 ? " needs you" : " need you") + (dot.buddy ? ", asked by " + dot.buddy.name : "") : "");
/** The text of the removable chip under the header; "" when no filter is on. */
export const chipText = (filter) => { const f = String(filter || "").trim(); return f ? "Search: " + (f.length > 28 ? f.slice(0, 27) + "…" : f) : ""; };
/** Rebuild the bar only when something it shows changed. */
export const barSig = (mode, openId, dot, update = false) => JSON.stringify([activeTab(mode, openId), dot ? [dot.count, dot.buddy && dot.buddy.id] : null, !!update]);

const NS = "http://www.w3.org/2000/svg";
const PATHS = {
  list: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  office: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  map: '<circle cx="12" cy="5" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M12 7v4M12 11 6 16M12 11l6 5"/>',
  all: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
};
/** A 24px stroke icon from the fixed PATHS above (constant markup, never user text). */
export function icon(name) {
  const s = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "tb-ico" })) s.setAttribute(k, v);
  const tmp = new DOMParser().parseFromString('<svg xmlns="' + NS + '">' + (PATHS[name] || "") + "</svg>", "image/svg+xml").documentElement;
  for (const n of [...tmp.childNodes]) s.append(document.importNode(n, true));
  return s;
}

/** The bar: <nav> with five buttons. */
export function buildBar({ h, mode, openId, dot, update = false, setMode, openMore }) {
  const act = activeTab(mode, openId);
  const tabs = TABS.map(([m, word]) => {
    const on = act === m;
    const d = m === "list" ? dot : null;
    return h("button", { class: "tb-tab", type: "button", "data-tab": m, "aria-current": on ? "page" : null, "aria-label": d ? word + ", " + dotLabel(d) : null, onclick: () => setMode(m) },
      icon(m), word,
      d ? h("span", { class: "tb-dot", "data-act": "tab-dot" },
        d.buddy ? h("img", { class: "tb-face", alt: "", src: poseUrl(folderOf(d.buddy.id), "needsyou") }) : null,
        h("b", {}, String(d.count))) : null);
  });
  return h("nav", { class: "tb", "aria-label": "Main" }, tabs,
    h("button", { class: "tb-tab", type: "button", "data-tab": "more", "aria-haspopup": "dialog", "aria-label": update ? "More, update ready" : null, onclick: () => openMore() }, icon("more"), "More",
      update ? h("span", { class: "tb-upd", "aria-hidden": "true" }) : null));
}

/** The magnifier button for the phone header. */
export const searchButton = ({ h, open }) => h("button", { class: "pill logout bell srchbtn phone-only", type: "button", "data-act": "search", "aria-label": "Search threads", title: "Search threads", onclick: open }, icon("search"));

/** The removable chip under the header (phone only). Fills `el`; empty when no filter. */
export function renderChip({ h, el, filter, clear, open }) {
  const t = chipText(filter);
  el.replaceChildren(...(t ? [h("span", { class: "fchip" },
    h("button", { class: "fchip-t", type: "button", "aria-label": t + ". Edit search", onclick: open }, t),
    h("button", { class: "fchip-x", type: "button", "aria-label": "Remove search", onclick: clear }, "×"))] : []));
}

/** The search sheet from the top. Typing calls setFilter(text) (the app's own filter); Done / Esc / the scrim close it and keep the filter. */
export function openSearch({ h, getFilter, setFilter, voiceButton, toast }) {
  if (document.querySelector(".srch-wrap")) return;
  const input = h("input", { type: "search", class: "srch-in", value: getFilter() || null, placeholder: "Search threads", "aria-label": "Search threads", enterkeyhint: "search", autocomplete: "off",
    oninput: (e) => setFilter(e.target.value) });
  const mic = voiceButton ? voiceButton({ h, toast }, input, null) : null;
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "srch-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Search", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "srch-card" }, h("div", { class: "srch-row" }, input, mic, h("button", { class: "srch-done", type: "button", onclick: close }, "Done"))));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);
  input.focus(); input.setSelectionRange(input.value.length, input.value.length);
}

/** Is the on-screen keyboard up? Geometry only (no dependence on which element has focus, which flickers while the chat re-renders): the visible height, undone from pinch-zoom (height * scale), is much shorter than the window. */
export const keyboardOpen = ({ inner = 0, vvHeight = 0, scale = 1 } = {}) => inner > 0 && vvHeight > 0 && inner - vvHeight * (scale || 1) > 120;
/** What the shell does for the visual viewport (iOS standalone: the layout viewport never shrinks for the keyboard). open: pin #app to the visible area (--vvh height, --vvt offset); closed: touch nothing (desktop and normal phone unchanged). */
export const viewportState = ({ inner = 0, vvHeight = 0, vvTop = 0, scale = 1 } = {}) =>
  keyboardOpen({ inner, vvHeight, scale }) ? { open: true, vvh: Math.round(vvHeight * (scale || 1)), vvt: Math.max(0, Math.round(vvTop)) } : { open: false, vvh: 0, vvt: 0 };
/** Was a scroller at (or within `slack` px of) its bottom? */
export const atBottom = ({ scrollHeight = 0, scrollTop = 0, clientHeight = 0 } = {}, slack = 40) => scrollHeight - scrollTop - clientHeight <= slack;
/** Keep the last message above the dock when the viewport changes? Yes when the list is at the bottom, the chat was just opened, the app is still sticking to the bottom (stickUntil), or it is being scrolled right now (momentum / smooth scroll) within a screen of the bottom. */
export const stickDecision = ({ near = false, nearScreen = false, justOpened = false, stickUntil = 0, now = 0, lastScrollAt = 0 } = {}) =>
  near || justOpened || now < stickUntil || (now - lastScrollAt < 500 && nearScreen);
/** Re-measure schedule after a focus or viewport event (ms): iOS fires visualViewport events late, out of order, or not at all on the first focus. */
export const REMEASURE_MS = 900;
