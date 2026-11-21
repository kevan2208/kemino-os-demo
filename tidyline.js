// The quiet line on Today after the automatic tidy-up: "Tidied 12 finished helpers · Undo". Shown for 24 h, never pushed.
// Pure text in, DOM out (no inline styles or handlers).

export const tidyLineText = (b) => {
  const n = b && typeof b.left === "number" ? b.left : 0;
  return n > 0 ? "Tidied " + n + " finished " + (n === 1 ? "helper" : "helpers") : "";
};

/** `auto` is the /api/tidy/auto answer ({ enabled, last }). Null when there is nothing to say. `undo(batch, event)` does the undo. */
export function tidyLine({ h, auto, undo }) {
  const b = auto && auto.last;
  const text = tidyLineText(b);
  if (!text) return null;
  return h("div", { class: "tidyline", "data-act": "tidy-line", role: "status" },
    h("span", {}, text + " · "),
    h("button", { class: "tidyline-undo", type: "button", "data-act": "tidy-line-undo", onclick: (e) => undo(b.id, e) }, "Undo"));
}
