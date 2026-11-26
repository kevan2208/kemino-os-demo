// Tour: steps through everything waiting on You, one card at a time. Yes / No / Later (keys Y N L on a keyboard).
// Later moves the card to the end. "3 of 7". Ends with "Done". Answers go through the app's normal respond action,
// so the same server guards (gesture, CSRF, second confirm for risky requests) apply. No innerHTML (CSP, untrusted text).

/** The queue behind the tour, with no screen in it so Node can test it. `ids` are thread ids that have an open request. */
export function createTour(ids) {
  let queue = [...new Set(ids)], seen = new Set(queue), done = 0;
  return {
    get current() { return queue.length ? queue[0] : null; },
    get position() { return done + (queue.length ? 1 : 0); },
    get total() { return done + queue.length; },
    get finished() { return queue.length === 0; },
    /** A card was answered. Pass its id: the live data may already have dropped it (answered elsewhere), and then nothing else may be removed. */
    answered(id = queue[0]) { const i = queue.indexOf(id); if (i >= 0) { queue.splice(i, 1); done++; } },
    /** Later: the current card goes to the end of the line. */
    later() { if (queue.length > 1) queue.push(queue.shift()); },
    /** The world moved: cards answered somewhere else disappear (and count as done), new ones join at the end. */
    sync(liveIds) {
      const live = new Set(liveIds);
      const keep = queue.filter((i) => live.has(i));
      done += queue.length - keep.length;
      queue = keep;
      for (const i of liveIds) if (!seen.has(i)) { seen.add(i); queue.push(i); }
    },
  };
}

/**
 * deps: { h, getNeeds() -> [{id,title,chain,project,kind,detail,risky,riskKinds,requestId,since}], answer(need, decision, event, confirm) -> Promise<boolean>,
 *         live() -> boolean, openThread(id), toast(msg, isError) }.  Returns { refresh, close }.
 */
export function openTour({ h, getNeeds, answer, live, openThread, toast, isLater = () => false }) {
  const existing = document.querySelector(".tour-wrap");
  if (existing) existing.remove();
  const open = () => getNeeds().filter((n) => !n.held && !isLater(n)); // snoozed ("Later") cards are not in the tour, so "1 of N" matches the Needs you count
  const tour = createTour(open().map((n) => n.id));
  let confirming = false, busy = false, sig = "";
  const card = h("div", { class: "np-card tour-card", role: "document" });
  const close = () => { wrap.remove(); removeEventListener("keydown", onKey, true); };
  const wrap = h("div", { class: "np-wrap tour-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Tour", onclick: (e) => { if (e.target === wrap) close(); } }, card);

  const needOf = () => open().find((n) => n.id === tour.current) || null;

  async function reply(decision, e) {
    const n = needOf();
    if (!n || busy || !live() || n.kind !== "permission" || n.secret || !n.requestId) return;
    if (decision === "accept" && n.risky && !confirming) { confirming = true; draw(true); return; }
    busy = true; draw(true);
    let ok = false;
    try { ok = await answer(n, decision, e, decision === "accept" && n.risky); } catch (err) { toast(err.message, true); }
    busy = false; confirming = false;
    if (ok) tour.answered(n.id);
    draw(true);
  }
  function later() { if (busy) return; confirming = false; tour.later(); draw(true); }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (!["y", "n", "l"].includes(k) || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
    e.preventDefault(); e.stopPropagation(); // the page's own Y N L keys must not fire as well
    if (k === "l") later(); else reply(k === "y" ? "accept" : "decline", e);
  }
  addEventListener("keydown", onKey, true);

  function draw(force) {
    tour.sync(open().map((n) => n.id));
    const n = needOf();
    const s = JSON.stringify([tour.current, tour.position, tour.total, confirming, busy, live(), n && [n.detail, n.risky]]);
    if (!force && s === sig) return;
    sig = s;
    const kids = [h("div", { class: "np-head" }, h("strong", {}, "Needs you"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×"))];
    if (tour.finished || !n) {
      kids.push(h("div", { class: "tour-clear" }, h("b", {}, "Done"), h("p", {}, tour.total ? "You went through " + tour.total + (tour.total === 1 ? " card." : " cards.") : "Nothing here."),
        h("button", { class: "b y", onclick: close }, "Done")));
    } else {
      const q = n.kind === "question", sec = !!n.secret, openOnly = q || sec; // a question or a secret is answered in T3/the chat, never with Yes/No here
      const ok = live() && n.requestId && !busy;
      kids.push(
        tour.total > 1 ? h("div", { class: "tour-count", "aria-live": "polite" }, tour.position + " of " + tour.total) : null, // "1 of 1" says nothing
        h("h3", { class: "tour-title" }, n.title),
        h("div", { class: "ch" }, (n.chain && n.chain.length > 1 ? n.chain.map((c) => c.title).join("  ›  ") : n.project) + (sec ? " · needs a secret" : q ? " · has a question" : " · wants permission")),
        n.detail && !sec ? h("div", { class: "cmd" }, n.detail.slice(0, 700)) : null,
        n.risky ? h("div", { class: "risk" }, "Careful: " + (n.riskKinds || []).join(", ")) : null,
        confirming
          ? h("div", { class: "confirm" }, h("p", {}, "This will " + (n.riskKinds || []).join(" and ") + ". Go ahead?"),
              h("div", { class: "acts" }, h("button", { class: "b danger y", disabled: !ok, onclick: (e) => reply("accept", e) }, busy ? "Sending…" : "Yes, go ahead", h("kbd", {}, "Y")),
                h("button", { class: "b", disabled: busy, onclick: () => { confirming = false; draw(true); } }, "Cancel")))
          : h("div", { class: "acts" },
              openOnly ? h("button", { class: "b y", onclick: () => { close(); openThread(n.id); } }, "Open chat")
                : h("button", { class: "b y", disabled: !ok, onclick: (e) => reply("accept", e) }, busy ? "Sending…" : n.risky ? "Review" : "Yes", h("kbd", {}, "Y")),
              openOnly ? null : h("button", { class: "b", disabled: !ok, onclick: (e) => reply("decline", e) }, "No", h("kbd", {}, "N")),
              h("button", { class: "b m", disabled: busy, onclick: later }, sec ? "Skip" : "Later", h("kbd", {}, "L"))),
        live() ? null : h("p", { class: "hint" }, "You're offline. Answers go out when it's back."));
    }
    card.replaceChildren(...kids.filter(Boolean));
  }

  document.body.append(wrap);
  draw(true);
  return { refresh: () => { if (wrap.isConnected) draw(false); }, close };
}
