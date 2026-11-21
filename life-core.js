// Life screen, pure part: the mail sorter, entity decoding, date/time detection, "free until", the Today line, and the
// Google Calendar TEMPLATE link + .ics builders. No DOM, no network: the page (life.js) and the tests both import this.
// Everything here is read-only triage: nothing is ever written to Google. Times are local (UTC+4, no daylight saving).

export const TZ = "Etc/GMT-4", OFFSET_H = 4;
const DAY = 86_400_000;
const pad = (n) => String(n).padStart(2, "0");
/** local wall clock of a timestamp: { y, m, d, wd (0=Sun), hh, mm, date: "YYYY-MM-DD" }. */
export function wall(ms) {
  const t = new Date(ms + OFFSET_H * 3_600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay(), hh: t.getUTCHours(), mm: t.getUTCMinutes(), date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` };
}
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
/** Epoch ms of a local wall-clock date ("YYYY-MM-DD") and time ("HH:MM"). */
export const toMs = (date, time = "00:00") => { const [y, m, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number); return Date.UTC(y, m - 1, d, h - OFFSET_H, mi); };

// ---------- entities ----------
const NE = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", copy: "©", reg: "®", euro: "€", pound: "£", middot: "·", bull: "•", laquo: "«", raquo: "»", trade: "™" };
/** Decodes HTML entities (a few passes, for double-encoded text). The result is only ever put in text nodes. */
/** The server's own strip pattern (mail.ts clean): control chars, zero-width and bidi marks. Re-applied after decoding, so &#13; and friends cannot bring them back. */
const STRIP = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]+/g;
export function decodeEntities(s) {
  if (typeof s !== "string") return s;
  for (let i = 0; i < 3 && /&(#|[a-z])/i.test(s); i++) {
    const t = s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (a, d, h, n) => {
      if (n) return NE[n.toLowerCase()] ?? a;
      try { return String.fromCodePoint(d ? +d : parseInt(h, 16)); } catch { return ""; }
    });
    if (t === s) break;
    s = t;
  }
  return s.replace(STRIP, " ");
}

// ---------- attachments ----------
const DOC = /\.(pdf|docx?|xlsx?|csv|zip|pptx?)$/i, IMG = /\.(jpe?g|png|gif|heic|webp|bmp)$/i, JUNK = /^(embed\d*|image\d+|outlook-)|logo|signature|banner|spacer/i;
/** A real file: pdf/doc/xls/zip, or a named picture of at least 50 KB. Inline and signature images are not. */
export function realAtt(a) {
  const n = a?.name || "";
  if (DOC.test(n)) return true;
  return IMG.test(n) && !JUNK.test(n) && (a.size || 0) >= 51200;
}

// ---------- sender ----------
export const addrOf = (from) => { const m = /<([^>]+)>/.exec(from || ""); return (m ? m[1] : String(from || "")).trim().toLowerCase(); };
export const nameOf = (from) => { const f = String(from || ""); const m = /^"?([^"<]+?)"?\s*</.exec(f); return decodeEntities((m ? m[1] : f.replace(/<.*>/, "") || addrOf(f)).trim()) || addrOf(f); };

// ---------- date/time in text ----------
const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const wdIndex = (s) => WD.indexOf(s.slice(0, 3).toLowerCase());
const monIndex = (s) => MON.indexOf(s.slice(0, 3).toLowerCase());
/** "9am" "2:30pm" "14:30" "14h30" -> "HH:MM", or null when it is not a time. */
function timeOf(s) {
  const m = /^(\d{1,2})(?:[:h.](\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = +m[1]; const mi = m[2] ? +m[2] : 0, ap = (m[3] || "").toLowerCase();
  if (mi > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === "pm" ? 12 : 0); }
  else if (h > 23 || (!m[2] && !m[3])) return null; // a bare number is not a time
  return `${pad(h)}:${pad(mi)}`;
}
const WDRE = "(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)", MONRE = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)", TIMERE = "\\d{1,2}(?:[:h.]\\d{2})?\\s*(?:am|pm)|\\d{1,2}[:h]\\d{2}";
/**
 * The ONE date (and maybe time) a mail text points at, relative to `now`; null when there is none or it is ambiguous.
 * Returns { date: "YYYY-MM-DD", time: "HH:MM" | null, allDay: bool, label }. Only a day found = all-day. Different dates in one text = null (do not guess).
 */
export function parseWhen(text, now = Date.now()) {
  const t = String(text || ""), today = wall(now), found = new Map();
  const put = (date, time) => { const k = date + "|" + (time || ""); if (!found.has(k)) found.set(k, { date, time: time || null }); };
  const nextWd = (idx, time) => { let n = (idx - today.wd + 7) % 7; if (n === 0 && time && time <= `${pad(today.hh)}:${pad(today.mm)}`) n = 7; return addDays(today.date, n); };
  // "12 Nov 9am", "12 November 2026 09:00", "12 Nov"
  for (const r of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONRE})\\b\\.?(?:,?\\s+(\\d{4}))?(?:\\s*(?:,|at|@|-)?\\s*(${TIMERE}))?`, "gi"))) {
    const mo = monIndex(r[2]); if (mo < 0 || +r[1] < 1 || +r[1] > 31) continue;
    let y = r[3] ? +r[3] : today.y; let date = `${y}-${pad(mo + 1)}-${pad(+r[1])}`;
    if (!r[3] && date < today.date) date = `${y + 1}-${pad(mo + 1)}-${pad(+r[1])}`;
    put(date, r[4] ? timeOf(r[4]) : null);
  }
  // "Nov 12", "November 12th 3pm"
  for (const r of t.matchAll(new RegExp(`(?<!\\d\\s)\\b(${MONRE})\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:h.]\\d)(?:,?\\s+(\\d{4}))?(?:\\s*(?:,|at|@|-)?\\s*(${TIMERE}))?`, "gi"))) {
    const mo = monIndex(r[1]); if (mo < 0 || +r[2] < 1 || +r[2] > 31) continue;
    const y = r[3] ? +r[3] : today.y; let date = `${y}-${pad(mo + 1)}-${pad(+r[2])}`;
    if (!r[3] && date < today.date) date = `${y + 1}-${pad(mo + 1)}-${pad(+r[2])}`;
    put(date, r[4] ? timeOf(r[4]) : null);
  }
  // "Thu 14:30", "Thursday at 2:30pm", "by Friday", "on Monday"
  for (const r of t.matchAll(new RegExp(`\\b(${WDRE})\\b(?:\\s*(?:,|at|@|-)?\\s*(${TIMERE}))?`, "gi"))) {
    const idx = wdIndex(r[1]); if (idx < 0) continue;
    const time = r[2] ? timeOf(r[2]) : null;
    put(nextWd(idx, time), time);
  }
  for (const r of t.matchAll(new RegExp(`\\btomorrow\\b(?:\\s*(?:,|at|@|-)?\\s*(${TIMERE}))?`, "gi"))) put(addDays(today.date, 1), r[1] ? timeOf(r[1]) : null);
  if (found.size === 0) return null;
  // The same day with and without a time is one date: keep the one with the time.
  const all = [...found.values()], dates = new Set(all.map((x) => x.date));
  if (dates.size > 1) return null;
  const withTime = all.filter((x) => x.time), times = new Set(withTime.map((x) => x.time));
  if (times.size > 1) return null;
  const date = all[0].date, time = withTime[0]?.time ?? null;
  if (date < today.date) return null;
  const wdName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][wall(toMs(date)).wd];
  return { date, time, allDay: !time, label: `${wdName} ${date.slice(8)}/${date.slice(5, 7)}${time ? " " + time : ""}` };
}

// ---------- the sorter ----------
/** Names of the weekday/time deadline in a text, for the "why" phrase: "by Friday" / "by tomorrow". */
const deadlineIn = (text) => { const r = /\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|eod|end of (?:day|week))\b/i.exec(text); return r ? "by " + r[1][0].toUpperCase() + r[1].slice(1).toLowerCase() : ""; };
/**
 * Rules only (a small AI pass may come later). Returns { group: "needs" | "fyi" | "noise", why }.
 * Robots, receipts, security notices, newsletters, greetings -> FYI/Noise. A real person asking something -> needs.
 * A person with ONLY an attachment and no ask -> FYI. When in doubt -> FYI.
 */
export function sortMail(m) {
  const L = m.labels || [], has = (r) => L.some((l) => r.test(l)), addr = addrOf(m.from), local = addr.split("@")[0] || "";
  const text = decodeEntities((m.subject || "") + " " + (m.snippet || ""));
  const robot = /(^|[^a-z])(no-?reply|donotreply|notifications?|alerts?|security|billing|receipts?|news|newsletter|marketing|deals|promo|mailer|digest|support|info|hello|team|admin|system)([^a-z]|$)/.test(local);
  if (has(/^(PROMOTIONS|SOCIAL|FORUMS)$|CATEGORY_(PROMOTIONS|SOCIAL|FORUMS)/)) return { group: "noise", why: "promo or social label" };
  if (m.unsub) return { group: "noise", why: "has an unsubscribe link" };
  if (/newsletter|unsubscribe|job alert|new jobs?|jobs? (for you|you may like)|recommended jobs|\bdigest\b|happy (diwali|eid|new year|birthday|holi|christmas)|season'?s greetings|best wishes|warm wishes|greetings|merry christmas|eid mubarak/i.test(text)) return { group: "noise", why: "newsletter, job alert or greeting" };
  if (robot) return /news|marketing|deals|promo|mailer|digest/.test(local) ? { group: "noise", why: "marketing sender" } : { group: "fyi", why: "automatic sender" };
  if (has(/^UPDATES$|CATEGORY_UPDATES/) || /receipt|invoice paid|payment received|security alert|sign-?in|verify|password/i.test(text)) return { group: "fyi", why: "receipt, security notice or update" };
  const dl = deadlineIn(text);
  const asks = /\?|\bplease\b|can you|could you|would you|let me know|need you|confirm|\bdeadline\b|\bdue\b/i.test(text) || !!dl;
  if (asks) return { group: "needs", why: dl ? "has a deadline: " + dl : /\?|can you|could you|would you|let me know/i.test(text) ? "asks you something" : "asks for something" };
  if ((m.attachments || []).some(realAtt)) return { group: "fyi", why: "a file with no question" };
  return { group: "fyi", why: "not sure, kept quiet" };
}

/** One suggested action for a needs-you row: "calendar" when a date was found, else "reply". */
export function suggestAction(m, now = Date.now()) {
  const when = parseWhen(decodeEntities((m.subject || "") + " " + (m.snippet || "")), now);
  return when ? { kind: "calendar", when } : { kind: "reply" };
}

// ---------- marks (Later / Done / Snooze) ----------
/** marks: { [mailId]: { mark: "later" | "done" | "snooze", until?: ms } }. Done and still-snoozed mail is hidden; Later stays, flagged. */
/** Your own sent mail and drafts are never "Needs you". */
const isOwn = (m) => (m.labels || []).some((l) => l === "SENT" || l === "DRAFT");
export function applyMarks(mail, marks, now = Date.now()) {
  const out = [];
  for (const m of mail) {
    const k = marks?.[m.id];
    if (isOwn(m)) continue;
    if (k?.mark === "done") continue;
    if (k?.mark === "snooze" && (k.until || 0) > now) continue;
    out.push({ ...m, later: k?.mark === "later" });
  }
  return out;
}
/** Groups sorted mail: later ones sink to the bottom of each group. */
export function groupMail(mail) {
  const g = { needs: [], fyi: [], noise: [] };
  for (const m of mail) { if (isOwn(m)) continue; const s = m.sorted || sortMail(m); (g[s.group] || g.fyi).push({ ...m, sorted: s }); }
  for (const k of Object.keys(g)) g[k].sort((a, b) => (a.later ? 1 : 0) - (b.later ? 1 : 0));
  return g;
}
/** Tonight at 20:00 local (tomorrow's if it is past). */
export function tonight(now = Date.now()) { const w = wall(now); const t = toMs(w.date, "20:00"); return t > now ? t : t + DAY; }

// ---------- calendar ----------
const evStart = (e) => (e.allDay ? toMs(e.start) : Date.parse(e.start));
const evEnd = (e) => (e.allDay ? toMs(e.end) : Date.parse(e.end));
/** "free until 15:00" / "busy until 11:00" / "free for the rest of the day" / "free all day". All-day events (holidays) do not block. */
export function freeUntil(events, now = Date.now()) {
  const today = wall(now).date, endOfDay = toMs(addDays(today, 1));
  const timed = (events || []).filter((e) => !e.allDay).map((e) => [evStart(e), evEnd(e)]).filter(([s, e]) => e > now && s < endOfDay).sort((a, b) => a[0] - b[0]);
  const hm = (ms) => { const w = wall(ms); return `${pad(w.hh)}:${pad(w.mm)}`; };
  if (!timed.length) return (events || []).some((e) => !e.allDay && wall(evStart(e)).date === today) ? "free for the rest of the day" : "free all day";
  if (timed[0][0] <= now) { let end = timed[0][1]; for (const [s, e] of timed) if (s <= end) end = Math.max(end, e); return "busy until " + hm(end); }
  return "free until " + hm(timed[0][0]);
}
/** Next 7 days (today + 6... the server gives 8 days) as [{ date, label, events }], empty days left out except today. */
export function groupByDay(events, now = Date.now()) {
  const today = wall(now).date, byDay = new Map();
  for (const e of events || []) {
    const d = e.allDay ? e.start : wall(Date.parse(e.start)).date;
    if (d < today) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
  if (!byDay.has(today)) byDay.set(today, []);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [...byDay.keys()].sort().map((d) => {
    const w = wall(toMs(d)), diff = Math.round((toMs(d) - toMs(today)) / DAY);
    return { date: d, label: diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `${names[w.wd]} ${w.d}/${pad(w.m)}`, events: byDay.get(d).sort((a, b) => evStart(a) - evStart(b)) };
  });
}
export const timeText = (e) => (e.allDay ? "All day" : (() => { const w = wall(Date.parse(e.start)); return `${pad(w.hh)}:${pad(w.mm)}`; })());
/** The next timed event that has not started, within `days`; null when none. */
export function nextEvent(events, now = Date.now()) {
  return (events || []).filter((e) => !e.allDay && Date.parse(e.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] || null;
}
/** Today's quiet line: "2 need you · next: Sat 09:00 Dentist". "" when there is nothing to say. */
export function lifeLine(mail, events, now = Date.now()) {
  const n = (mail || []).filter((m) => (m.sorted || sortMail(m)).group === "needs").length;
  const ev = nextEvent(events, now), names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const next = ev ? (() => { const w = wall(Date.parse(ev.start)); const day = w.date === wall(now).date ? "" : names[w.wd] + " "; return `next: ${day}${pad(w.hh)}:${pad(w.mm)} ${String(ev.title).slice(0, 40)}`; })() : "";
  const left = n ? `${n} need${n === 1 ? "s" : ""} you` : "";
  return [left, next].filter(Boolean).join(" · ");
}

// ---------- add to calendar ----------
/** Start/end of the event a `when` describes. Timed = 1 hour; all-day end is the next day (exclusive), as both Google and .ics expect. */
export function eventSpan(when) {
  if (when.allDay) return { allDay: true, start: when.date.replace(/-/g, ""), end: addDays(when.date, 1).replace(/-/g, "") };
  const s = toMs(when.date, when.time), e = s + 3_600_000, f = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return { allDay: false, start: f(s), end: f(e) };
}
/** Google Calendar's own "new event" screen, pre-filled. The person taps Save there. Every value is URL-encoded. */
export function templateLink({ title, when, details = "" }) {
  const sp = eventSpan(when), u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE"); u.searchParams.set("text", String(title).slice(0, 200));
  u.searchParams.set("dates", sp.start + "/" + sp.end); u.searchParams.set("details", String(details).slice(0, 500)); u.searchParams.set("ctz", TZ);
  return u.toString();
}
const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/;/g, "\\;").replace(/,/g, "\\,");
/** RFC 5545 line folding at 75 octets (by characters here: the text is mostly ASCII; folds never split a surrogate pair). */
const fold = (line) => { const out = []; let cur = ""; for (const ch of line) { if ((cur + ch).length > 74) { out.push(cur); cur = " " + ch; } else cur += ch; } out.push(cur); return out.join("\r\n"); };
/** A one-event .ics for iPhone Calendar. `uid` and `stamp` are passed in so the output is deterministic in tests. */
export function buildIcs({ title, when, details = "", uid, stamp }) {
  const sp = eventSpan(when), st = (stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kemino OS//Life//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    "UID:" + (uid || "kemino-" + Math.random().toString(36).slice(2) + "@kemino"), "DTSTAMP:" + st,
    sp.allDay ? "DTSTART;VALUE=DATE:" + sp.start : "DTSTART:" + sp.start, sp.allDay ? "DTEND;VALUE=DATE:" + sp.end : "DTEND:" + sp.end,
    "SUMMARY:" + icsEsc(String(title).slice(0, 200)), ...(details ? ["DESCRIPTION:" + icsEsc(String(details).slice(0, 500))] : []), "END:VEVENT", "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
}
export const gmailLink = (id) => "https://mail.google.com/mail/u/0/#all/" + encodeURIComponent(id);
export const driveSearchLink = (q) => "https://drive.google.com/drive/search?q=" + encodeURIComponent(q);

/** Age as "3h", "2d", "now". */
export function age(iso, now = Date.now()) {
  const ms = now - Date.parse(iso); if (!Number.isFinite(ms)) return "";
  const m = Math.round(ms / 60_000);
  return m < 2 ? "now" : m < 60 ? m + "m" : m < 2880 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d";
}
