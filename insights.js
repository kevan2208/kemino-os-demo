// Insights panel: read-only reports in one dialog, one tab each (Skills, Usage, Tidy). Every tab is { id, label, path, draw(json, { h, post, toast }) -> nodes }.
// The server does the reading; this file only fetches and draws. No HTML strings, no inline script or style (CSP).

/** deps: { h, toLogin(), post, toast }, tabs: the tab objects, start: the tab id to open first. */
export function openInsights({ h, toLogin, post, toast }, tabs, start) {
  if (document.querySelector(".in-wrap")) return;
  let current = tabs.find((t) => t.id === start) || tabs[0], data = null, error = "", seq = 0;
  const body = h("div", { class: "in-body" });
  const bar = h("div", { class: "sg in-tabs", role: "tablist", "aria-label": "Insights" });
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap in-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Insights", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card in-card", "data-ptr": "dialog" },
      h("div", { class: "np-head" }, h("strong", {}, "Insights"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      bar, body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);

  function drawTabs() {
    bar.replaceChildren(...tabs.map((t) => h("button", { role: "tab", "aria-selected": t.id === current.id ? "true" : "false", "aria-pressed": t.id === current.id, "data-tab": t.id, onclick: () => pick(t) }, t.label)));
  }
  async function load() {
    const mine = ++seq, tab = current;
    data = null; error = ""; draw();
    try {
      const r = await fetch(tab.path);
      if (r.status === 401) return toLogin();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "could not load (" + r.status + ")");
      if (mine !== seq) return; // the user moved to another tab meanwhile
      data = j;
    } catch (e) { if (mine !== seq) return; error = e.message; }
    draw();
  }
  function pick(t) { if (t.id === current.id) return; current = t; drawTabs(); load(); }
  function draw() {
    if (error) return body.replaceChildren(h("p", { class: "au-err" }, error), h("button", { class: "np-btn", onclick: load }, "Try again"));
    if (!data) return body.replaceChildren(h("div", { class: "skel" }), h("div", { class: "skel" }));
    body.replaceChildren(...[].concat(current.draw(data, { h, post, toast })).flat(Infinity).filter((k) => k != null && k !== false));
  }
  // Pull down inside the dialog (refresh.js): reload the tab that is showing.
  wrap.addEventListener("ptr:refresh", (e) => { e.detail?.wait?.push(load()); });
  drawTabs();
  load();
}
