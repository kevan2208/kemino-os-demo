// The draggable question sheet: the handle follows the finger 1:1 with transform only (no layout per frame), lets go with an ease-out settle (~300 ms).
// Three resting places: tall (about 70% of the screen), half (about 52%) and closed (folds back to the bar). Pure maths first (Node tests it).

/** Share of the tall sheet that shows at the half stop (52dvh of 70dvh). */
export const HALF_SHARE = 0.74;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Share of the tall sheet that shows at the low stop (the picture stop: 28dvh of 70dvh). */
export const LOW_SHARE = 0.4;
/** Where the stops sit, as translateY px from the tallest position: { tall: 0, half, low, closed }. */
export const stopsFor = (H) => ({ tall: 0, half: Math.round(H * (1 - HALF_SHARE)), low: Math.round(H * (1 - LOW_SHARE)), closed: H });
const ORDER = ["tall", "half", "low"];
/** Picture rule: a question card never covers a picture the agent just showed.
 * avail = px of chat from the top of the chat area down to the sheet's bottom edge; H = sheet height; picH = rendered height of the picture (0 or null = no picture).
 * Returns { stop: the tallest stop that leaves the WHOLE picture visible above the sheet (null = no picture, no limit), fits, shown: share of the picture visible (0..1), room }.
 * A picture that fits at no stop gets "low" (the lowest) and fits:false: the page offers "View picture". */
export function pictureCap({ avail, H, picH, gap = 12 }) {
  if (!(picH > 0)) return { stop: null, fits: true, shown: 1, room: Infinity };
  const roomAt = (s) => Math.floor(avail - visibleAt(H, s) - 4);
  for (const s of ORDER) if (roomAt(s) >= picH + gap) return { stop: s, fits: true, shown: 1, room: roomAt(s) };
  const room = Math.max(0, roomAt("low"));
  return { stop: "low", fits: false, shown: Math.min(1, room / picH), room };
}
/** The lower of two stops (tall > half > low). */
export const lowerStop = (a, b) => ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
/** While dragging: follow the finger down to closed; above the tall stop it resists (rubber band), so "drag up to ~70% max" holds. */
export const followY = (y, H) => (y < 0 ? y * 0.2 : Math.min(y, H));
/** On release: look ~180 ms ahead along the swipe (vy in px/ms, down is positive) and settle on the nearest stop. Closing needs a real pull past half way to the bottom. */
export function snapStop(y, vy, H, withLow = false) {
  const s = stopsFor(H), p = y + vy * 180;
  const lowest = withLow ? "low" : "half";
  const closeAt = s[lowest] + (s.closed - s[lowest]) * 0.45;
  if (p >= closeAt) return "closed";
  return (withLow ? ORDER : ["tall", "half"]).reduce((best, n) => Math.abs(p - s[n]) < Math.abs(p - s[best]) ? n : best, "tall");
}
/** The height of the sheet that shows at a stop: what the chat above needs as bottom padding so the last picture is never hidden. */
export const visibleAt = (H, stop) => Math.max(0, H - stopsFor(H)[stop]);
/** Esc folds one step: tall -> half, anything lower -> closed (back to the bar). */
export const escStop = (stop) => (stop === "tall" ? "half" : "closed");
/** Next stop from the keyboard: up = taller, down = shorter then closed. */
export function keyStop(stop, key, low = false) {
  if (key === "ArrowUp" || key === "Home") return "tall";
  if (key === "End") return "half";
  if (key === "ArrowDown") return stop === "tall" ? "half" : stop === "half" && low ? "low" : "closed";
  return null;
}

let remembered = "half"; // the stop a redraw (or the next open) comes back to within this page visit; nothing else is remembered
let rememberedKey = null, userChose = false; // a picture limit overrides the remembered stop until the reader moves the sheet themselves for THIS question

/** Wire one sheet element. opts: { onClose(), onSettle(visiblePx) }. Safe to call on every redraw: the old element is gone, the new one gets fresh listeners. */
export function attachSheetDrag(sheet, opts = {}) {
  const grab = sheet.querySelector(".qs-grab");
  if (!grab) return;
  const H = () => sheet.offsetHeight || 1;
  // Never taller than the room under the page header: at 1280 the tall stop used to slide the handle and Close under the header.
  const clip = sheet.parentElement;
  const fit = () => {
    if (!clip || !opts.topLimit) return;
    clip.style.removeProperty("--qs-clip-h"); clip.style.removeProperty("--qs-h");
    const room = Math.floor(clip.getBoundingClientRect().bottom - opts.topLimit() - 8);
    if (room < sheet.offsetHeight + 14) { clip.style.setProperty("--qs-clip-h", Math.max(120, room) + "px"); clip.style.setProperty("--qs-h", Math.max(106, room - 14) + "px"); }
  };
  fit();
  const setY = (px) => sheet.style.setProperty("--sy", px + "px");
  // Picture rule: measure the picture the agent just showed and cap the opening stop so it stays whole above the sheet.
  const pic = opts.picture?.(), cap = pic ? pictureCap({ avail: clip.getBoundingClientRect().bottom - pic.top, H: H(), picH: pic.h }) : { stop: null, fits: true, shown: 1 };
  const low = !!cap.stop; // low is a reachable stop only while a picture is on screen
  if (opts.key !== rememberedKey) { rememberedKey = opts.key ?? null; userChose = false; }
  let stop = cap.stop && !userChose ? lowerStop(remembered, cap.stop) : (remembered === "low" && !low ? "half" : remembered), drag = null, raf = 0, pending = 0;
  const place = (name, animate, byUser = false) => {
    stop = name; if (name !== "closed") { remembered = name; if (byUser) userChose = true; }
    sheet.style.setProperty("--qs-pad", Math.round(stopsFor(H())[name === "closed" ? "low" : name] + 14) + "px"); // the part under the fold stays scrollable
    sheet.classList.toggle("settle", !!animate); sheet.classList.toggle("closing", name === "closed" && !!animate);
    setY(stopsFor(H())[name]);
    if (name === "closed") { let done = false; const fin = () => { if (!done) { done = true; opts.onClose?.(); } }; sheet.addEventListener("transitionend", fin, { once: true }); setTimeout(fin, animate ? 340 : 0); }
    else opts.onSettle?.(visibleAt(H(), name));
  };
  place(stop, false);
  opts.onPicture?.(cap);
  sheet.escNow = () => place(escStop(stop), true, true); // Esc: tall -> half first, then the bar
  sheet.foldNow = () => place("closed", true); // Esc, the Close button and a tap outside fold with the same settle
  const flush = () => { raf = 0; setY(pending); };
  grab.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    try { grab.setPointerCapture?.(e.pointerId); } catch { /* a pointer that is already gone: keep going without capture */ }
    sheet.classList.remove("settle"); sheet.classList.add("dragging");
    drag = { id: e.pointerId, y0: e.clientY, base: stopsFor(H())[stop], t0: e.timeStamp, last: [{ y: e.clientY, t: e.timeStamp }], moved: false };
  });
  grab.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0; if (Math.abs(dy) > 4) drag.moved = true;
    drag.last.push({ y: e.clientY, t: e.timeStamp }); if (drag.last.length > 5) drag.last.shift();
    pending = followY(drag.base + dy, H()); if (!raf) raf = requestAnimationFrame(flush);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; sheet.classList.remove("dragging");
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!d.moved) { place(stop === "tall" ? "half" : "tall", true, true); return; } // a plain tap on the handle flips tall/half
    const a = d.last[0], b = d.last[d.last.length - 1], vy = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    place(snapStop(d.base + (e.clientY - d.y0), vy, H(), low), true, true);
  };
  grab.addEventListener("pointerup", end); grab.addEventListener("pointercancel", end);
  grab.addEventListener("keydown", (e) => { const n = keyStop(stop, e.key, low); if (n) { e.preventDefault(); place(n, true, true); } });
  const onResize = () => { if (!sheet.isConnected) { window.removeEventListener("resize", onResize); return; } fit(); place(stop, false); };
  window.addEventListener("resize", onResize);
}
