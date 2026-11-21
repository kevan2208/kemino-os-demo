// ONE Escape rule for every sheet, dialog and panel. The DECISION is pure and tested here; app.js finds the open layers and closes the one returned.
// One Esc = one layer, the topmost first. Nothing open -> null (the normal Esc keys then run: leave the box / back from a chat).
// Typing in a box never changes it: a layer closes even while the composer has focus, and closing never touches a draft.
export const RANK = { modal: 3, info: 2, question: 1.5, inspector: 1 };

/**
 * layers: [{ kind: "modal"|"info"|"question"|"inspector", order }] where `order` is the position in the page (later = painted on top).
 * ctx: { typing } (accepted so the rule is explicit: typing does not matter when a layer is open).
 * Returns the layer to close, or null.
 */
export function escapeTarget(layers, ctx = {}) {
  void ctx;
  let top = null;
  for (const l of layers || []) {
    if (!l) continue;
    const r = RANK[l.kind] || 0;
    if (!top || r > (RANK[top.kind] || 0) || (r === (RANK[top.kind] || 0) && (l.order || 0) >= (top.order || 0))) top = l;
  }
  return top;
}
