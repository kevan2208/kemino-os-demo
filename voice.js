// Hold-to-talk dictation with the browser's own speech recognition (SpeechRecognition / webkitSpeechRecognition).
//  - Feature-detected: where the API is missing, voiceButton() returns null and nothing is drawn. It never throws into the page.
//  - The words only fill the text box. They are never sent by themselves: You still taps Send.
//  - No audio goes through Kemino's server. The browser does the recognising itself (the page only gets text back), so no connect-src is needed.
//  - Recording starts only from a real touch, click or key press (isTrusted), never from page code.

/** The browser's recogniser class, or null. */
export const speechCtor = (w = globalThis) => (w && (w.SpeechRecognition || w.webkitSpeechRecognition)) || null;
export const voiceSupported = (w = globalThis) => !!speechCtor(w);

/** What the box shows while talking: the text that was there, a space, then what was heard (finished words + the guess still being made). */
export function mergeTranscript(base, finalText, interim = "") {
  const heard = `${finalText || ""} ${interim || ""}`.replace(/\s+/g, " ").trim();
  return [String(base || "").replace(/\s+$/, ""), heard].filter(Boolean).join(" ");
}

/** Text of every result so far, split into finished and still-guessing. `results` is the SpeechRecognitionResultList (array-like). */
export function readResults(results) {
  let fin = "", tmp = "";
  for (let i = 0; i < (results?.length || 0); i++) {
    const r = results[i], t = r && r[0] ? String(r[0].transcript || "") : "";
    if (r && r.isFinal) fin += t; else tmp += t;
  }
  return { fin, tmp };
}

const SVGNS = "http://www.w3.org/2000/svg";
function micIcon() {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("width", "18"); s.setAttribute("height", "18"); s.setAttribute("aria-hidden", "true");
  for (const [tag, a] of [["rect", { x: "6", y: "1.5", width: "4", height: "8", rx: "2" }], ["path", { d: "M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V15" }]]) {
    const n = document.createElementNS(SVGNS, tag);
    n.setAttribute("fill", "none"); n.setAttribute("stroke", "currentColor"); n.setAttribute("stroke-width", "1.6"); n.setAttribute("stroke-linecap", "round");
    for (const [k, v] of Object.entries(a)) n.setAttribute(k, v);
    s.append(n);
  }
  return s;
}

/**
 * A mic button that fills `field` (a textarea or input) while it is held. `after(text)` runs after each change (to refresh Send / the filter).
 * `deps`: h (element builder), toast. `win` is injectable for tests.
 */
export function voiceButton({ h, toast }, field, after, win = globalThis) {
  const Ctor = speechCtor(win);
  if (!Ctor) return null;
  let rec = null, base = "", on = false;
  const btn = h("button", { type: "button", class: "mic", "data-act": "mic", "aria-label": "Hold to talk", "aria-pressed": "false", title: "Hold to talk. The words appear in the box; nothing is sent until you tap Send." }, micIcon());
  const paint = () => { btn.classList.toggle("rec", on); btn.setAttribute("aria-pressed", on ? "true" : "false"); };
  const stop = () => { if (!on) return; on = false; paint(); try { rec?.stop(); } catch { /* already stopped */ } };
  const start = () => {
    if (on || btn.disabled || field.disabled) return;
    let r;
    try { r = new Ctor(); } catch { toast?.("Voice input is not available here.", true); return; }
    try { r.lang = win.navigator?.language || "en-US"; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1; } catch { /* old engines ignore these */ }
    base = field.value;
    r.onresult = (e) => {
      const { fin, tmp } = readResults(e.results);
      field.value = mergeTranscript(base, fin, tmp);
      field.dispatchEvent(new Event("input", { bubbles: true })); // the page's own input handler grows the box and refreshes Send
      after?.(field.value);
    };
    r.onerror = (e) => {
      const err = e && e.error;
      if (err === "not-allowed" || err === "service-not-allowed") toast?.("The microphone is not allowed. Allow it in the browser or phone settings.", true);
      else if (err && err !== "no-speech" && err !== "aborted") toast?.("Voice input stopped (" + err + ").", true);
    };
    r.onend = () => { if (rec === r) { rec = null; on = false; paint(); } };
    rec = r; on = true; paint();
    try { r.start(); } catch { rec = null; on = false; paint(); }
  };
  const real = (e) => e && e.isTrusted;
  btn.addEventListener("pointerdown", (e) => { if (!real(e) || e.button > 0) return; e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { /* fine */ } start(); });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) btn.addEventListener(t, stop);
  btn.addEventListener("contextmenu", (e) => e.preventDefault()); // a long press on iOS must not open the callout
  btn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat && real(e)) { e.preventDefault(); start(); } });
  btn.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") stop(); });
  btn.addEventListener("blur", stop);
  return btn;
}
