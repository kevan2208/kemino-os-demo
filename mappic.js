// "Save as picture": draws the CURRENT map layout (the same boxes and lines the page shows) onto a canvas at 2x and shares or downloads it as a PNG.
// Drawn straight onto the canvas, not by serializing the SVG: external images and CSS do not survive svg-as-image.
// picturePlan() is pure (tested in Node). The canvas part needs a browser. `h` = helpers handed over by map.js (avoids an import loop).

export const PIC_SCALE = 2, PIC_PAD = 24;
const FALLBACK = { bg: "#14121f", card: "#201d33", line: "#5b5778", ink: "#f4f2ff", mut: "#a9a5c4", work: "#47d983", ask: "#f5b942", fail: "#ff6b6b", done: "#8a86a8" };

/** What to write on each card: title lines, who line, status word, project. Pure. */
export function picturePlan(layout, h) {
  return layout.nodes.map((n) => {
    const thread = n.kind === "thread", word = h.wordOf ? h.wordOf(n) : n.status ? h.STATUS_WORD[n.status] || n.status : "";
    if (!thread) return { id: n.id, kind: n.kind, x: n.x, y: n.y, w: n.w, h: n.h, status: n.status, lines: [n.title], who: "", word: n.kind === "chip" ? "" : word, head: false };
    const dt = h.titleText(n.id, n.title), head = !!h.labelOf(n.id).isHead;
    return { id: n.id, kind: "thread", x: n.x, y: n.y, w: n.w, h: n.h, status: n.status || "done", lines: h.wrapTitle(dt, 14, n.w - 56 - (head ? 56 : 12)), who: h.whoLine(n.model) || "", word, head, model: n.model, project: n.project || "" };
  });
}

const cssVars = () => {
  const out = { ...FALLBACK };
  try {
    const cs = getComputedStyle(document.documentElement), get = (v) => cs.getPropertyValue(v).trim();
    const pick = { card: "--s1-solid", line: "--dim", ink: "--ink", mut: "--mut", work: "--map-work", ask: "--saf", fail: "--map-fail", done: "--map-done" };
    for (const [k, v] of Object.entries(pick)) if (get(v)) out[k] = get(v);
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") out.bg = bg;
  } catch { /* defaults */ }
  return out;
};
const loadImage = (url) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });
const rr = (c, x, y, w, hh, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };

/** Paints the layout on a new canvas (2x) and returns it. */
export async function renderPicture(layout, h, scale = PIC_SCALE) {
  const col = cssVars(), plan = picturePlan(layout, h);
  const W = Math.ceil(layout.width + PIC_PAD * 2), H = Math.ceil(layout.height + PIC_PAD * 2);
  const cv = document.createElement("canvas"); cv.width = W * scale; cv.height = H * scale;
  const c = cv.getContext("2d");
  c.scale(scale, scale); c.fillStyle = col.bg; c.fillRect(0, 0, W, H);
  c.translate(PIC_PAD, PIC_PAD); c.lineCap = "round"; c.lineJoin = "round";
  for (const e of layout.edges) {
    c.strokeStyle = e.hot ? col.ask : col.mut; c.lineWidth = 2.4; c.setLineDash(e.kind === "report" ? [8, 6] : []);
    c.stroke(new Path2D(e.d));
  }
  c.setLineDash([]);
  const imgs = new Map();
  await Promise.all([...new Set(plan.filter((p) => p.model).map((p) => (h.aiOf(p.model) || {}).idleUrl).filter(Boolean))].map(async (u) => imgs.set(u, await loadImage(u))));
  const shape = (st, cx, cy) => {
    c.lineWidth = 2; c.strokeStyle = col.mut; c.fillStyle = st === "working" ? col.work : st === "needs-you" ? col.ask : st === "failed" ? col.fail : col.done;
    c.beginPath();
    if (st === "needs-you") { c.moveTo(cx, cy - 7); c.lineTo(cx + 7, cy); c.lineTo(cx, cy + 7); c.lineTo(cx - 7, cy); c.closePath(); c.fill(); }
    else if (st === "failed") { rr(c, cx - 6, cy - 6, 12, 12, 2); c.fill(); }
    else if (st === "working") { c.arc(cx, cy, 6, 0, 7); c.fill(); }
    else { c.arc(cx, cy, st === "done" ? 7 : 6, 0, 7); c.stroke(); if (st === "done") { c.beginPath(); c.moveTo(cx - 3.5, cy); c.lineTo(cx - 1, cy + 3); c.lineTo(cx + 3.5, cy - 3); c.stroke(); } }
  };
  const text = (t, x, y, font, color, align = "left") => { c.font = font; c.fillStyle = color; c.textAlign = align; c.fillText(t, x, y); };
  const UI = "system-ui, -apple-system, 'Segoe UI', sans-serif";
  for (const p of plan) {
    c.save(); c.translate(p.x, p.y);
    rr(c, 0, 0, p.w, p.h, p.kind === "thread" ? 14 : 14);
    c.fillStyle = col.card; c.fill();
    c.lineWidth = p.status === "needs-you" ? 2.4 : p.status === "failed" ? 2 : 1.4;
    c.strokeStyle = p.status === "needs-you" ? col.ask : p.status === "failed" ? col.fail : col.line; c.stroke();
    if (p.kind === "kevan") text("You", p.w / 2, p.h / 2 + 5, `700 15px ${UI}`, col.ink, "center");
    else if (p.kind === "chip") { shape("done", 22, p.h / 2); text(p.lines[0], 40, p.h / 2 + 5, `700 14px ${UI}`, col.ink); }
    else if (p.kind === "project") { shape(p.status, 20, p.h / 2); text(p.lines[0], 38, p.h / 2 + 5, `700 14px ${UI}`, col.ink); }
    else {
      const img = imgs.get((h.aiOf(p.model) || {}).idleUrl);
      if (img) { c.imageSmoothingEnabled = false; c.drawImage(img, 10, 10, 36, 36); c.imageSmoothingEnabled = true; }
      else { c.beginPath(); c.arc(28, 28, 17, 0, 7); c.fillStyle = col.line; c.fill(); text((p.lines[0] || "?")[0].toUpperCase(), 28, 33, `700 14px ${UI}`, col.ink, "center"); }
      p.lines.forEach((t, i) => text(t, 54, 24 + i * 18, `700 14px ${UI}`, col.ink));
      if (p.head) text("Head", p.w - 46, 20, `600 12px ${UI}`, col.mut);
      if (p.who) text(h.fitText(p.who, 13, p.w - 24), 12, 66, `500 13px ${UI}`, col.mut);
      shape(p.status, 19, 84); text(p.word, 33, 89, `700 13px ${UI}`, p.status === "needs-you" ? col.ask : col.ink);
      if (p.project && layout.multiProject) { const t = h.fitText(p.project, 12, 84, true), w = Math.round(h.textWidth(t, 12, true) + 16); rr(c, p.w - 10 - w, 73, w, 20, 10); c.strokeStyle = col.line; c.lineWidth = 1.2; c.stroke(); text(t, p.w - 10 - w / 2, 87, `600 12px ${UI}`, col.mut, "center"); }
    }
    c.restore();
  }
  return cv;
}

/** Share sheet when the browser can share files (phones), else a download. Resolves "shared", "downloaded" or "cancelled". */
export async function savePicture(layout, h) {
  const cv = await renderPicture(layout, h);
  const blob = await new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("no image"))), "image/png"));
  const name = "kemino-map-" + new Date().toISOString().slice(0, 10) + ".png";
  const file = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], title: "Kemino map" }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; /* any other failure: fall through to the download */ }
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "downloaded";
}
