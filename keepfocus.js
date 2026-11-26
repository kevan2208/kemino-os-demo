// Keep keyboard focus across a re-draw. Today re-draws its container on every state tick (replaceChildren), which drops the focused
// element's node and sends focus to BODY. keepFocus() notes which element inside `el` has focus, runs the redraw, and gives focus to the
// same element (same id / data-focus-key / tag+data-act+data-id..., n-th of its kind) in the new nodes. Pure DOM, no app state.
const KEYS = ["data-focus-key", "data-act", "data-id", "data-tid", "data-tab", "data-j", "data-preset", "data-k", "aria-label"];

/** A selector + index that finds the same logical element again after a redraw, or null. */
export function focusKey(el, root) {
  if (!el || !root || el === root || !root.contains(el)) return null;
  const tag = el.tagName.toLowerCase();
  const q = (v) => String(v).replace(/["\\]/g, "\\$&");
  let sel = tag;
  if (el.id) sel = "#" + (globalThis.CSS?.escape ? CSS.escape(el.id) : el.id.replace(/[^\w-]/g, "\\$&"));
  else { const parts = KEYS.filter((k) => el.hasAttribute(k)).map((k) => "[" + k + "=\"" + q(el.getAttribute(k)) + "\"]"); sel = tag + parts.join(""); }
  const all = [...root.querySelectorAll(sel)];
  return { sel, idx: Math.max(0, all.indexOf(el)), n: all.length };
}

/** Focus the element a focusKey() describes, if it is there and focus is currently lost. Returns true when it focused. */
export function restoreKey(key, root) {
  if (!key || !root?.isConnected) return false;
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return false; // someone else holds focus: leave it
  const all = [...root.querySelectorAll(key.sel)];
  const t = all[key.idx] || all[all.length - 1];
  if (!t) return false;
  try { t.focus({ preventScroll: true }); } catch { return false; }
  return document.activeElement === t;
}

/** Run `redraw` and keep focus on the same logical element inside `root`. */
export function keepFocus(root, redraw) {
  const a = document.activeElement;
  const key = a && a !== document.body && root?.contains(a) ? focusKey(a, root) : null;
  const out = redraw();
  if (key) restoreKey(key, root);
  return out;
}

/** First VISIBLE element matching `sel` (the page keeps a hidden desktop copy of some controls, e.g. the "More" pill); null when none shows. */
export function firstVisible(sel) {
  for (const e of document.querySelectorAll?.(sel) || []) if (!e.closest?.("[inert]") && (e.getClientRects?.().length ?? 1) > 0) return e;
  return null;
}
export const moreControl = () => firstVisible('[data-act="more"],[data-tab="more"]');

/** Ask for focus on `target()` (the opener) now and again until `until` ms pass, but only while nothing holds focus.
 *  Covers redraws that come later (a refresh that finishes after the close). Returns a cancel function. */
export function returnFocus(target, { spans = [0, 120, 400, 900, 2000, 4000], keep = 6000 } = {}) {
  const ts = [];
  let done = false;
  const go = () => {
    if (done) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    try { target()?.focus({ preventScroll: true }); } catch { /* gone */ }
  };
  for (const ms of spans) ts.push(setTimeout(go, ms));
  // after the last retry, watch: if the opener's redraw drops focus again, put it back until `keep` ms
  const t0 = Date.now();
  const mo = typeof MutationObserver === "function" ? new MutationObserver(() => { if (Date.now() - t0 > keep) return stop(); go(); }) : null;
  mo?.observe(document.body, { childList: true, subtree: true });
  const stop = () => { done = true; mo?.disconnect(); ts.forEach(clearTimeout); document.removeEventListener?.("pointerdown", user, true); };
  ts.push(setTimeout(stop, keep));
  // any real user focus change or key ends the hand-back so it never fights the user
  const user = () => stop();
  document.addEventListener?.("pointerdown", user, { once: true, capture: true });
  return stop;
}
