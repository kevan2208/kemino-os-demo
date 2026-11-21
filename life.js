// The Life screen: your mail sorted into Needs you / FYI / Noise, the next 7 days, and a Drive search with pinned folders.
// READ-ONLY triage: Gmail, Calendar and Drive are only looked at. "Add to calendar" opens Google's own pre-filled screen (you tap Save there)
// or downloads an .ics file; "Reply", "Open" and "Unsubscribe" are plain links out. Later / Done / Snooze marks live in Kemino's own file on the
// server (shared by all your devices). All text goes in as text nodes (mail comes from outside): no innerHTML, no inline style or handler (CSP).
import { sortMail, groupMail, applyMarks, suggestAction, decodeEntities, nameOf, realAtt, age, gmailLink, driveSearchLink, templateLink, buildIcs, freeUntil, groupByDay, timeText, lifeLine, tonight, wall } from "./life-core.js";

const GROUPS = [["needs", "Needs you"], ["fyi", "FYI"], ["noise", "Noise"]];
const DRIVE_ICON = (mime) => (/folder$/.test(mime) ? "Folder" : /spreadsheet|excel|csv/.test(mime) ? "Sheet" : /document|word|text/.test(mime) ? "Doc" : /presentation|powerpoint/.test(mime) ? "Slides" : /pdf/.test(mime) ? "PDF" : /image/.test(mime) ? "Image" : "File");
const isFolder = (f) => f.mime === "application/vnd.google-apps.folder";

/** Everything the screen and the Today line need. `get(path)` returns { ok, status, j }. Each part fails alone. */
export async function loadLife(get) {
  const [mail, cal, marks] = await Promise.all([get("/api/google/mail?max=25&q=in%3Ainbox"), get("/api/google/calendar"), get("/api/google/life/marks")]);
  return {
    mail: mail.ok ? (mail.j.messages || []).map(clean) : null, mailErr: mail.ok ? "" : mail.j.error || "Mail could not be read.",
    events: cal.ok ? cal.j.events || [] : null, calErr: cal.ok ? "" : cal.j.error || "Calendar could not be read.",
    marks: marks.ok ? marks.j.marks || {} : {}, pins: marks.ok ? marks.j.pins || [] : [],
  };
}
/** The link goes to the SENDER's own page (not Gmail): say where, so a look-alike address is visible. */
export function unsubLabel(u) {
  if (u.https) { try { return "Unsubscribe (opens " + new URL(u.https).host + ") ↗"; } catch { /* falls through */ } }
  const a = String(u.mailto || "").replace(/^mailto:/i, "").split("?")[0];
  return a ? "Unsubscribe (by email to " + a + ") ↗" : "Unsubscribe ↗";
}
/** Entities decoded once, here; the result is only put in text nodes. */
function clean(m) { return { ...m, subject: decodeEntities(m.subject), snippet: decodeEntities(m.snippet), from: decodeEntities(m.from), attachments: (m.attachments || []).map((a) => ({ ...a, name: decodeEntities(a.name) })) }; }

/** Today's quiet line, or "". Reads the same sorter as the screen. */
export async function lifeSummary(get, now = Date.now()) {
  try {
    const st = await get("/api/google/status");
    if (!st.ok || !st.j.enabled || st.j.state === "off" || st.j.state === "not-connected" || st.j.state === "reconnect") return "";
    const d = await loadLife(get);
    return lifeLine(applyMarks(d.mail || [], d.marks, now), d.events || [], now);
  } catch { return ""; }
}

/** deps: { h, post, toast, toLogin }. */
export function openLife({ h, post, toast, toLogin, onClose, opener: from }) {
  if (document.querySelector(".lf-wrap")) return;
  let D = null, openNoise = false, openCal = {}, driveQ = "", driveRes = null, folder = null, busy = "";
  const opener = from || document.activeElement;
  const close = () => { onClose?.(); wrap.classList.remove("in"); setTimeout(() => wrap.remove(), 200); removeEventListener("keydown", onKey, true); const restore = () => { const back = opener?.isConnected ? opener : opener?.dataset?.act ? document.querySelector("[data-act=\"" + opener.dataset.act + "\"]") : null; if (back) { try { back.focus({ preventScroll: true }); } catch { /* gone */ } } }; for (const ms of [260, 900, 2000]) setTimeout(() => { if (document.activeElement === document.body || !document.activeElement) restore(); }, ms); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const status = h("p", { class: "lf-status", role: "status", "aria-live": "polite" }, "Loading…");
  const body = h("div", { class: "lf-body" }, status);
  const wrap = h("div", { class: "np-wrap lf-wrap", role: "dialog", "aria-modal": "true", "aria-label": "Life", onclick: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "np-card lf-card", tabindex: "-1" },
      h("div", { class: "np-head lf-head" }, h("button", { class: "lf-back", type: "button", "aria-label": "Back", title: "Back (Esc)", onclick: close }, "‹ Back"), h("strong", {}, "Life"), h("button", { class: "np-x", "aria-label": "Close", onclick: close }, "×")),
      body));
  addEventListener("keydown", onKey, true);
  document.body.append(wrap);
  requestAnimationFrame(() => { wrap.classList.add("in"); wrap.querySelector(".lf-card")?.focus({ preventScroll: true }); });

  async function get(path) {
    const r = await fetch(path);
    if (r.status === 401) { toLogin(); throw new Error("Logged out."); }
    return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
  }
  const say = (t) => { status.textContent = t || ""; };
  async function load() {
    try {
      const st = await get("/api/google/status");
      if (!st.ok || !st.j.enabled || st.j.state === "off") { body.replaceChildren(h("p", { class: "lf-status" }, "Google is off. Switch it on in Features first.")); return; }
      if (st.j.state === "not-connected" || st.j.state === "reconnect") { body.replaceChildren(h("p", { class: "lf-status" }, "Google is not connected. Connect it from More > Google.")); return; }
      D = await loadLife(get);
      say("");
      draw();
    } catch (err) { body.replaceChildren(h("p", { class: "lf-status err" }, err.message)); }
  }

  /** Sets a mark: the page changes at once, the server file follows; on a failure the old marks come back and a quiet line says why. */
  async function mark(m, kind, e, until) {
    const before = D.marks, cur = before[m.id]?.mark;
    const next = kind === cur ? "clear" : kind;
    const upd = { ...before }; if (next === "clear") delete upd[m.id]; else upd[m.id] = { mark: next, until, at: Date.now() };
    D.marks = upd; draw();
    try { const j = await post("/api/google/life/mark", { id: m.id, mark: next, until }, e); D.marks = j.marks; say(next === "done" ? "Marked done." : next === "later" ? "Kept for later." : next === "snooze" ? "Back tonight." : "Mark removed."); draw(); }
    catch (err) { D.marks = before; draw(); say(err.message); }
  }
  async function pin(f, on, e) {
    try { const j = await post("/api/google/life/pin", { id: f.id, name: f.name, on }, e); D.pins = j.pins; draw(); say(on ? "Pinned." : "Unpinned."); } catch (err) { say(err.message); }
  }
  function download(name, text) {
    const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/calendar" })), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const link = (cls, text, href, label) => h("a", { class: "lf-chip " + cls, href, target: "_blank", rel: "noopener", "aria-label": label || null }, text);
  const chip = (cls, text, fn, on) => h("button", { class: "lf-chip " + cls + (on ? " on" : ""), type: "button", "aria-pressed": on == null ? null : String(!!on), onclick: fn }, text);

  function mailRow(m, group) {
    const sug = group === "needs" ? suggestAction(m) : null, asked = openCal[m.id];
    const files = (m.attachments || []).filter(realAtt);
    const marked = D.marks[m.id]?.mark;
    const actions = [];
    if (group === "needs") {
      if (marked === "later") actions.push(chip("sug", "Snooze to tonight", (e) => mark(m, "snooze", e, tonight())));
      else if (sug.kind === "calendar") actions.push(chip("sug", "Add to calendar", () => { openCal = { ...openCal, [m.id]: !asked }; draw(); }, !!asked));
      else actions.push(link("sug", "Reply in Gmail ↗", gmailLink(m.id)));
    } else if (group === "noise" && m.unsub) actions.push(link("sug", unsubLabel(m.unsub), m.unsub.https || m.unsub.mailto, "Unsubscribe from " + nameOf(m.from)));
    else actions.push(link("", "Open in Gmail ↗", gmailLink(m.id)));
    actions.push(chip("", marked === "later" ? "Later ✓" : "Later", (e) => mark(m, "later", e), marked === "later"), chip("", "Done", (e) => mark(m, "done", e)));
    const detail = asked && sug?.kind === "calendar" ? (() => {
      const ev = { title: m.subject, when: sug.when, details: "From " + nameOf(m.from) + " (Gmail)" };
      return h("div", { class: "lf-cal-pick", role: "group", "aria-label": "Add to calendar" },
        h("span", { class: "lf-when" }, sug.when.label + (sug.when.allDay ? " · all day" : " · 1 hour")),
        link("", "Google Calendar ↗", templateLink(ev)),
        chip("", "Download .ics", () => download("kemino-event.ics", buildIcs({ ...ev, uid: "kemino-" + m.id + "@kemino" }))));
    })() : null;
    return h("li", { class: "lf-mail" + (marked === "later" ? " later" : ""), "data-id": m.id },
      h("div", { class: "lf-top" }, h("span", { class: "lf-who" }, nameOf(m.from)), h("span", { class: "lf-age" }, age(m.date))),
      h("div", { class: "lf-subj" }, m.subject),
      group === "needs" ? h("div", { class: "lf-why" }, m.sorted.why) : h("div", { class: "lf-snip" }, m.snippet),
      files.length ? h("div", { class: "lf-files" }, files.map((a) => h("span", { class: "lf-file", title: a.name }, a.name))) : null,
      h("div", { class: "lf-actions" }, actions), detail);
  }

  function mailSection() {
    if (!D.mail) return h("p", { class: "lf-status err" }, D.mailErr);
    const g = groupMail(applyMarks(D.mail, D.marks).map((m) => ({ ...m, sorted: sortMail(m) })));
    return [
      ...GROUPS.map(([k, label]) => {
        const rows = g[k], isNoise = k === "noise", shown = !isNoise || openNoise;
        const head = isNoise
          ? h("button", { class: "lf-gh", type: "button", "aria-expanded": String(openNoise), onclick: () => { openNoise = !openNoise; draw(); } }, h("span", {}, label), h("span", { class: "lf-n" }, rows.length), h("span", { class: "lf-caret" }, openNoise ? "▾" : "▸"))
          : h("div", { class: "lf-gh static" }, h("span", {}, label), h("span", { class: "lf-n" }, rows.length));
        return h("section", { class: "lf-group g-" + k, "data-group": k }, head,
          shown ? (rows.length ? h("ul", { class: "lf-list" }, rows.map((m) => mailRow(m, k))) : h("p", { class: "lf-empty" }, k === "needs" ? "Nothing needs you. " : "Nothing here.")) : null);
      }),
      h("p", { class: "lf-note" }, "Sorted by simple rules for now; a small AI pass may come later. Kemino only looks: nothing is sent or changed in Gmail."),
    ];
  }

  function calSection() {
    if (!D.events) return h("p", { class: "lf-status err" }, D.calErr);
    const now = Date.now(), days = groupByDay(D.events, now);
    return [
      h("div", { class: "lf-free", "data-free": "" }, "You are " + freeUntil(D.events, now)),
      days.map((d) => h("div", { class: "lf-day", "data-day": d.date }, h("div", { class: "lf-dayh" }, d.label),
        d.events.length ? d.events.map((e) => h("div", { class: "lf-ev" }, h("span", { class: "lf-evt" }, timeText(e)), h("span", { class: "lf-evn" }, e.title + (e.location ? " · " + e.location : "")))) : h("div", { class: "lf-ev none" }, "Nothing planned"))),
    ].flat();
  }

  async function runSearch(e) {
    e?.preventDefault?.();
    folder = null;
    if (driveQ.trim().length < 2) { driveRes = null; draw(); return; }
    busy = "Searching…"; draw();
    try { const r = await get("/api/google/drive/search?q=" + encodeURIComponent(driveQ.trim())); driveRes = r.ok ? r.j.files || [] : []; busy = r.ok ? "" : r.j.error || "Search failed."; } catch (err) { busy = err.message; }
    draw();
  }
  async function openFolder(f) {
    busy = "Opening…"; draw();
    try { const r = await get("/api/google/drive/folder/" + encodeURIComponent(f.id)); folder = { ...f, files: r.ok ? r.j.files || [] : [] }; busy = r.ok ? "" : r.j.error || "Could not open the folder."; } catch (err) { busy = err.message; }
    draw();
  }
  function driveRow(f) {
    const pinned = D.pins.some((p) => p.id === f.id);
    return h("li", { class: "lf-file-row" }, h("span", { class: "lf-ic", "aria-hidden": "true" }, DRIVE_ICON(f.mime)),
      h("div", { class: "lf-fn" }, isFolder(f) ? h("button", { class: "lf-linkbtn", type: "button", onclick: () => openFolder(f) }, f.name) : h("span", {}, f.name), h("small", {}, age(f.modified) + (f.size ? "" : ""))),
      f.link ? link("", "Open in Drive ↗", f.link, "Open " + f.name + " in Drive") : null,
      isFolder(f) ? chip("", pinned ? "Pinned ✓" : "Pin", (e) => pin(f, !pinned, e), pinned) : null);
  }
  function driveSection() {
    const input = h("input", { class: "lf-q", type: "search", value: driveQ, placeholder: "Search Drive by name or text", "aria-label": "Search Drive", autocomplete: "off", enterkeyhint: "search", oninput: (e) => { driveQ = e.target.value; } });
    const form = h("form", { class: "lf-search", onsubmit: runSearch }, input, h("button", { class: "lf-chip sug", type: "submit" }, "Search"));
    const pins = D.pins.length ? h("div", { class: "lf-pins", role: "group", "aria-label": "Pinned folders" }, D.pins.map((p) => h("button", { class: "lf-chip pin" + (folder?.id === p.id ? " on" : ""), type: "button", onclick: () => openFolder({ id: p.id, name: p.name, mime: "application/vnd.google-apps.folder", modified: "", link: "https://drive.google.com/drive/folders/" + encodeURIComponent(p.id) }) }, p.name))) : null;
    const list = folder ? [h("div", { class: "lf-fh" }, h("button", { class: "lf-linkbtn", type: "button", onclick: () => { folder = null; draw(); } }, "‹ Back"), h("b", {}, folder.name), folder.link ? link("", "Open in Drive ↗", folder.link) : null),
      folder.files.length ? h("ul", { class: "lf-list" }, folder.files.map(driveRow)) : h("p", { class: "lf-empty" }, "Nothing in this folder.")]
      : driveRes ? (driveRes.length ? h("ul", { class: "lf-list" }, driveRes.map(driveRow)) : h("p", { class: "lf-empty" }, "No files match “" + driveQ.trim() + "”.")) : null;
    return [form, pins, busy ? h("p", { class: "lf-status", role: "status" }, busy) : null, list].flat();
  }

  function draw() {
    const keep = document.activeElement?.classList?.contains("lf-q") ? { s: document.activeElement.selectionStart } : null;
    const sec = (t, ...k) => h("section", { class: "lf-sec" }, h("h3", {}, t), ...k);
    // Two columns from 900 px (mail | calendar + Drive); on the phone .lf-col is display:contents, so the order and look are unchanged.
    body.replaceChildren(status,
      h("div", { class: "lf-cols" },
        h("div", { class: "lf-col lf-col-mail" }, sec("Mail", mailSection())),
        h("div", { class: "lf-col lf-col-side" }, sec("Next 7 days", calSection()), sec("Drive", driveSection()),
          h("div", { class: "lf-out" }, link("", "Gmail ↗", "https://mail.google.com/mail/u/0/#inbox"), link("", "Calendar ↗", "https://calendar.google.com/"), link("", "Drive ↗", "https://drive.google.com/drive/recent")))));
    if (keep) { const q = body.querySelector(".lf-q"); q?.focus(); try { q.setSelectionRange(keep.s, keep.s); } catch { /* not a text field */ } }
  }
  load();
}
