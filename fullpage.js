// The shared "full page on desktop" pattern (You, 21 Nov: on >= 900 px no feature screen opens as a small centred box over a blurred page).
// Watches for the feature screens' wrappers (.np-wrap with one of these labels), tags them `fp` (fullpage.css does the layout) and adds a "‹ Back" button
// that presses the screen's own close button, so each screen's own close + focus-return code runs. Short confirms/questions (Stop for today, New thread, Menu,
// Keyboard shortcuts, Tour) are NOT listed: they stay sheets. Below 900 px nothing changes (the button is hidden, the sheet stays).
export const FULLPAGE_LABELS = ["Providers", "Notifications", "Google", "Automations", "Queue", "Insights", "Decisions", "Features", "Week in review", "Brief", "Code"];
const wide = () => matchMedia("(min-width:900px)").matches;

/** Tag one wrapper (idempotent) and put the Back button first in its header. Pure DOM, no innerHTML. */
export function fullpageify(wrap) {
  if (!wrap || wrap.classList.contains("fp") || !FULLPAGE_LABELS.includes(wrap.getAttribute("aria-label") || "")) return false;
  wrap.classList.add("fp");
  const head = wrap.querySelector(".np-head"), x = wrap.querySelector(".np-x");
  if (head && x && !head.querySelector(".fp-back")) {
    const back = document.createElement("button");
    back.type = "button"; back.className = "fp-back"; back.setAttribute("aria-label", "Back"); back.title = "Back (Esc)"; back.textContent = "‹ Back";
    back.addEventListener("click", () => x.click());
    head.prepend(back);
  }
  if (wide()) { // the corner × is hidden on desktop: focus moves in to Back (and returns to the opener through the screen's own close)
    const b = wrap.querySelector(".fp-back");
    if (b && !wrap.contains(document.activeElement)) b.focus({ preventScroll: true });
    else if (b && document.activeElement?.classList?.contains("np-x")) b.focus({ preventScroll: true });
  }
  return true;
}
export function watchFullpages() {
  const seen = (n) => { if (n.nodeType === 1 && n.classList?.contains("np-wrap")) fullpageify(n); };
  for (const n of document.body.children) seen(n);
  /** A closed full page leaves focus on <body> (its opener, the menu, is gone): give it back to the More control for ~1.5 s while nothing else holds it. */
  const gone = (n) => {
    if (n.nodeType !== 1 || !n.classList?.contains("fp")) return;
    const t0 = Date.now(), tryFocus = () => {
      const a = document.activeElement;
      if ((!a || a === document.body) && !document.querySelector(".np-wrap")) { try { (document.querySelector('[data-act="more"]') || document.querySelector('[data-tab="more"]'))?.focus({ preventScroll: true }); } catch { /* gone */ } }
      if (Date.now() - t0 < 1500) setTimeout(tryFocus, 150);
    };
    setTimeout(tryFocus, 260);
  };
  new MutationObserver((ms) => { for (const m of ms) { m.addedNodes.forEach(seen); m.removedNodes.forEach(gone); } }).observe(document.body, { childList: true });
}
