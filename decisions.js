// Decisions panel: every answer given through Kemino (by hand or by a saved rule), the saved "Always allow here" rules, and the kill switch.
// The server decides everything that matters (hard limits, guards); this file only draws. No innerHTML, no inline script or style (CSP).

/** "14:05" today, "Thu 14:05" this week, "3 Nov 14:05" older. Pure, so Node can test it. */
export function whenText(iso, now = Date.now()) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const age = now - d.getTime();
  if (new Date(now).toDateString() === d.toDateString()) return hm;
  if (age < 6 * 86400000) return d.toLocaleDateString([], { weekday: "short" }) + " " + hm;
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + hm;
}
export const answerClass = (a) => (a === "no" || a === "cancelled" ? "no" : "yes");
export const sourceText = (s, rule) => (s === "auto (rule)" ? (rule ? "answered by rule " + rule : "auto (rule)") : s === "agent decided" ? "agent decided" : s === "mac" ? "Mac" : "phone");

/** deps: { h, del(path, event), post(path, body, event), toast(msg, isError), toLogin() }. */
export function openDecisions({ h, del, post, toast, toLogin }) {
  if (document.querySelector(".dc-wrap")) return;
  let decisions = null, rules = null, error = "", busy = false;
  const body = h("div", { class: "dc-body" });
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const wrap = h("div", { class: "np-wrap dc-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Decisions", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card au-card" },
      h("div", { class: "np-head" }, h("strong", {}, "Decisions"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);

  async function load() {
    try {
      const [a, b] = await Promise.all([fetch("/api/decisions?limit=50"), fetch("/api/rules")]);
      if (a.status === 401 || b.status === 401) return toLogin();
      const ja = await a.json().catch(() => ({})), jb = await b.json().catch(() => ({}));
      if (!a.ok) throw new Error(ja.error || "could not load (" + a.status + ")");
      decisions = ja.decisions || [];
      rules = b.ok ? jb : null;
      error = "";
    } catch (e) { error = e.message; }
    draw();
  }

  async function removeRule(r, e) {
    if (busy) return;
    busy = true; draw();
    try { const j = await del("/api/rules?id=" + encodeURIComponent(r.id), e); rules = { enabled: j.enabled, rules: j.rules }; toast("Rule removed"); }
    catch (err) { toast(err.message, true); }
    finally { busy = false; draw(); }
  }
  async function setEnabled(on, e) {
    if (busy) return;
    busy = true; draw();
    try { const j = await post("/api/rules/settings", { enabled: on }, e); rules = { enabled: j.enabled, rules: j.rules }; toast(on ? "Saved rules are on" : "Saved rules are off: everything asks you"); }
    catch (err) { toast(err.message, true); }
    finally { busy = false; draw(); }
  }

  function ruleRow(r) {
    return h("div", { class: "au-row dc-rule" },
      h("div", { class: "au-top" }, h("b", { class: "dc-cmd" }, r.kind === "file_change" ? "Edits in " + r.pattern : r.pattern), h("button", { class: "b m", disabled: busy, "aria-label": "Remove this rule", onclick: (e) => removeRule(r, e) }, "Remove")),
      h("div", { class: "au-sub" }, [r.project || "project", r.kind === "file_change" ? "any file in this folder" : "exact command", r.createdAt ? "saved " + whenText(r.createdAt) : null].filter(Boolean).join(" · ")));
  }
  function decisionRow(d) {
    return h("div", { class: "au-row dc-row" },
      h("div", { class: "au-top" }, h("b", {}, d.thread || "(thread)"), h("span", { class: "au-st dc-" + answerClass(d.answer) }, d.answer)),
      h("div", { class: "au-sub" }, [d.project, whenText(d.ts), sourceText(d.source, d.rule)].filter(Boolean).join(" · ")),
      d.asked ? h("div", { class: "cmd dc-asked" }, d.asked) : null);
  }

  function draw() {
    const kids = [];
    if (error) kids.push(h("p", { class: "au-err" }, error), h("button", { class: "np-btn", onclick: load }, "Try again"));
    else if (!decisions) kids.push(h("div", { class: "skel" }), h("div", { class: "skel" }));
    else {
      kids.push(h("h3", {}, "Saved rules"));
      if (rules) {
        kids.push(h("label", { class: "np-row" }, h("span", {}, "Let saved rules answer for me"),
          h("input", { type: "checkbox", checked: rules.enabled, disabled: busy, "aria-label": "Let saved rules answer", onchange: (e) => setEnabled(e.target.checked, e) })));
        kids.push(h("p", { class: "au-note" }, rules.rules.length
          ? "A rule answers yes by itself only when the project and the exact command (or, for edits, the folder) match. Each answer shows “answered by rule …” below. Anything risky (push, merge, deploy, delete, secrets) always asks you."
          : "No saved rules. Answer yes on a permission card, then tap “Remember”."));
        kids.push(...rules.rules.map(ruleRow));
      } else kids.push(h("p", { class: "au-note" }, "Rules are not available on this server."));
      kids.push(h("h3", {}, "Your answers"));
      kids.push(decisions.length ? decisions.map(decisionRow) : h("p", { class: "au-note" }, "Nothing answered through Kemino yet."));
    }
    body.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  }

  draw();
  load();
}
