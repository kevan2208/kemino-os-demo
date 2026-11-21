// The brief and the week review live in a bottom sheet; the home shows only ONE tappable line for each.
// Plain lists, no innerHTML, no inline style (CSP). `h` is the app's element builder.

/** The tappable one-liner on the home. `kind` is "morning" | "evening" | "week"; `text` is the server's summary (or a placeholder while it loads). */
export function briefLine({ h }, kind, text, onOpen) {
  return h("button", { class: "briefline " + kind, "data-act": kind === "week" ? "week-line" : "brief-line", "data-card": kind === "week" ? "weekline" : "briefline", "aria-haspopup": "dialog", onclick: onOpen },
    h("span", { class: "bl-t" }, text), h("span", { class: "bl-c", "aria-hidden": "true" }, "›"));
}

/** The summary line for a brief, built from the server's `summary` or, for an older cached answer, from its title. */
export const summaryText = (b, fallback) => (b && (b.summary || b.title)) || fallback;

/**
 * Opens the sheet. `b` is the server answer ({ title, lines, suggestions? }) or null while loading. Returns { close, update(b) }.
 * `kind` "week" adds the "Worth a look" list.
 */
export function openBriefSheet({ h }, kind, b, { onClose } = {}) {
  document.querySelector(".bs-wrap")?.remove();
  const body = h("div", { class: "bs-body" });
  const title = h("strong", {}, "");
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); if (onClose) onClose(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap bs-wrap", role: "dialog", "aria-modal": "true", "aria-label": kind === "week" ? "Week in review" : "Brief", "data-sheet": kind === "week" ? "week" : "brief", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card bs-card" }, h("div", { class: "np-head" }, title, h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")), body));
  function update(x) {
    title.textContent = x ? (x.title || "") : kind === "week" ? "Week in review" : "Brief";
    if (!x) return body.replaceChildren(h("p", {}, "Loading…"));
    const lines = (x.lines || []).filter((l) => typeof l === "string"), sug = (x.suggestions || []).filter((s) => typeof s === "string");
    // replaceChildren(null) would print the text "null": only real nodes go in
    body.replaceChildren(...[
      lines.length ? h("ul", {}, lines.map((l) => h("li", {}, l))) : h("p", {}, "Nothing to report."),
      sug.length ? h("div", { class: "wk-sug" }, h("b", {}, "Worth a look"), h("ol", {}, sug.map((s) => h("li", {}, s)))) : null].filter(Boolean));
  }
  update(b);
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);
  return { close, update: (x) => { if (wrap.isConnected) update(x); } };
}
