// Thin banners under the top bar: "T3 updated to X" (update watcher) and "Stopped for today" (with Resume).
// Pure drawing. No innerHTML, no inline script or style (CSP). deps: { h }.
import { stopLine } from "./stoptoday.js";

/** The text of the T3 banner, or "" when there is nothing to show. A dismissed banner stays hidden until its text changes. */
export function healthText(health, dismissed) {
  const t = health && typeof health.banner === "string" ? health.banner : "";
  return t && t !== dismissed ? t : "";
}

/** `state`: { health, dismissedHealth, stop, unconfirmed }. `on`: { dismissHealth(), resume(), recheck(id), sendAgain(id), dismissUnconfirmed(id) }. Returns an array of nodes (maybe empty). */
export function bannerNodes({ h }, state, on) {
  const out = [];
  const sl = stopLine(state.stop);
  if (sl) {
    out.push(h("div", { class: "banner stop", role: "status", "data-banner": "stop" },
      h("span", { class: "bn-t" }, sl),
      h("button", { class: "b y", "data-act": "resume", onclick: () => on.resume() }, "Resume")));
  }
  // Writes T3 did not show back within a few seconds. "Check again" only reads; "Send again" exists for messages only and is the user's call.
  for (const u of state.unconfirmed || []) {
    out.push(h("div", { class: "banner bad", role: "status", "data-banner": "unconfirmed", "data-id": u.id },
      h("span", { class: "bn-t" }, "Not confirmed: " + u.label),
      h("small", { class: "bn-d" }, "T3 has not shown it yet. It may still arrive."),
      h("button", { class: "b m", "data-act": "recheck", onclick: (e) => on.recheck(u.id, e) }, "Check again"),
      u.canResend ? h("button", { class: "b m", "data-act": "send-again", onclick: (e) => on.sendAgain(u.id, e) }, "Send again") : null,
      h("button", { class: "bn-x", "aria-label": "Dismiss", onclick: () => on.dismissUnconfirmed(u.id) }, "×")));
  }
  const t = healthText(state.health, state.dismissedHealth);
  if (t) {
    const bad = !!state.health.bad;
    out.push(h("div", { class: "banner " + (bad ? "bad" : "ok"), role: "status", "data-banner": "t3" },
      h("span", { class: "bn-t" }, t),
      bad ? h("small", { class: "bn-d" }, "Kemino may misbehave until it is updated. Nothing was written to T3.") : null,
      h("button", { class: "bn-x", "aria-label": "Dismiss", onclick: () => on.dismissHealth() }, "×")));
  }
  return out;
}
