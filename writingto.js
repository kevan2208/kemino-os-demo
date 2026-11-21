// "Writing to: <thread>" hint above the chat box: a quiet line so a send to the wrong thread is easy to spot.
// Pure decision (writingToModel) + one small DOM builder. No inline styles; the look lives in style.css (.wt).

/** { title, tinted }: tinted only when the head thread is known AND the open thread is not it. Unknown head = plain (never guess). */
export function writingToModel(head, headId) {
  if (!head || !head.id) return null;
  const title = String(head.title || "(untitled)").replace(/\s+/g, " ").trim() || "(untitled)";
  return { title, tinted: typeof headId === "string" && headId !== "" && head.id !== headId };
}

/** The DOM line: tiny buddy face + "Writing to: <name>" (one line, ellipsis). `face` is a ready node or null. */
export function writingToNode(h, head, headId, face) {
  const m = writingToModel(head, headId);
  if (!m) return null;
  return h("div", { class: "wt" + (m.tinted ? " wt-off" : ""), title: "Writing to: " + m.title, role: "note" }, face, h("span", { class: "wt-l" }, "Writing to:"), h("span", { class: "wt-n" }, m.title), headId && head.id === headId ? h("em", { class: "hd-tag" }, "Head") : null);
}
