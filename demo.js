// Kemino OS DEMO layer. Replaces the live backend with sample data, so the page runs with no backend.
// Nothing here talks to any server. Buttons only change the sample state in memory.
(() => {
  // The public demo shows ONLY the sales-ok buddies (stand-ins); the build refuses to copy anything else, and a test keeps this map equal to DEMO_SET.
  window.KEMINO_BUDDY_FOLDERS = { kemino: "sparky", kbb: "sparky-kbb", codex: "termi", copilot: "navi", antigravity: "antigravity" };
  const now = Date.now(), min = 60_000;
  const M = (model, effort) => ({ instanceId: "claudeAgent", model, effort });
  const th = (id, title, project, status, ago, model, extra = {}) => ({ id, title, project, status, reason: null, held: false, activityAt: now - ago * min, model, branch: extra.branch || null, source: "web", parentId: extra.parentId || null, depth: extra.depth || 0, ...extra });
  const grp = (t, helpers = []) => { const counts = { "needs-you": 0, working: 0, stalled: 0, failed: 0, done: 0 }; helpers.forEach((k) => counts[k.status]++); return { ...t, helpers, counts }; };
  const sonnet = M("claude-sonnet-5-5", "medium"), opus = M("claude-opus-5-5", "high");

  const state = {
    scope: "day", now, lastHeard: now - 20_000, connected: true, hiddenRoots: 7,
    models: { byInstance: { claudeAgent: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"], claudeAgent_2: ["claude-sonnet-5-5"] }, efforts: ["low", "medium", "high"] },
    needs: [
      { id: "d-need-1", rootId: "d-w1", title: "Run the test suite", rootTitle: "Build the booking page", project: "Booking app", chain: [{ id: "d-w1", title: "Build the booking page" }, { id: "d-need-1", title: "Run the test suite" }], kind: "permission", provider: "claudeAgent", requestId: "r1", since: now - 4 * min, held: false, detail: "npm test -- --run booking", risky: false, riskKinds: [] },
      { id: "d-need-2", rootId: "d-w2", title: "Publish the release notes", rootTitle: "Weekly release", project: "Video tool", chain: [{ id: "d-w2", title: "Weekly release" }, { id: "d-need-2", title: "Publish the release notes" }], kind: "permission", provider: "claudeAgent", requestId: "r2", since: now - 11 * min, held: false, detail: "git push origin release/notes", risky: true, riskKinds: ["push"] },
    ],
    working: [
      grp(th("d-w1", "Build the booking page", "Booking app", "working", 1, sonnet, { branch: "feat/booking" }), [
        th("d-need-1", "Run the test suite", "Booking app", "needs-you", 4, sonnet, { parentId: "d-w1", depth: 1 }),
        th("d-h2", "Write calendar tests", "Booking app", "working", 2, sonnet, { parentId: "d-w1", depth: 1 }),
        th("d-h3", "Check phone layout", "Booking app", "done", 18, sonnet, { parentId: "d-w1", depth: 1 }),
      ]),
      grp(th("d-w2", "Weekly release", "Video tool", "working", 3, opus, { branch: "release/notes" }), [th("d-need-2", "Publish the release notes", "Video tool", "needs-you", 11, sonnet, { parentId: "d-w2", depth: 1 })]),
      grp(th("d-w3", "Tidy old drafts", "Notes", "stalled", 26, sonnet, { reason: "no progress for 26 min" })),
    ],
    done: [
      grp(th("d-d1", "Fix login redirect", "Booking app", "done", 95, sonnet, { branch: "fix/login" })),
      grp(th("d-d2", "Add dark theme colours", "Video tool", "done", 210, sonnet, { branch: "feat/dark" }), [th("d-d2a", "Contrast check", "Video tool", "done", 215, sonnet, { parentId: "d-d2", depth: 1 })]),
      grp(th("d-d3", "Summarise last week", "Notes", "done", 400, M("claude-haiku-5-5", "low"))),
    ],
  };
  const flat = () => [...state.working, ...state.done].flatMap((g) => [g, ...g.helpers]);
  const at = (m) => new Date(now - m * min).toISOString();
  const chatFor = (id) => {
    const t = flat().find((x) => x.id === id); if (!t) return null;
    const need = state.needs.find((n) => n.id === id);
    return {
      head: { id, title: t.title, status: t.status, reason: t.reason, project: t.project, branch: t.branch, model: t.model, chain: need ? need.chain : [{ id, title: t.title }] },
      total: 5, running: t.status === "working",
      items: [
        { id: id + "m1", role: "user", text: "Please do this and tell me when it is ready.", at: at(40) },
        { id: id + "t1", role: "tool", tool: "file", text: "Edited 3 files" },
        { id: id + "t2", role: "tool", tool: "command", text: "npm run build" },
        { id: id + "m2", role: "assistant", text: "Done with the first part. The build passes and the page looks right on a phone.\n\nNext I will run the tests. This is **sample text** in a demo.", at: at(12) },
        { id: id + "m3", role: "assistant", text: need ? "I need your OK to continue." : "Anything else you want changed?", at: at(5) },
      ],
      pending: need ? { requestId: need.requestId, kind: need.kind, detail: need.detail, risky: need.risky, riskKinds: need.riskKinds, createdAt: at(4) } : null,
    };
  };

  // Sample rows for the All threads view (same shape as GET /api/threads): three projects, helpers under parents, one archived thread.
  const R = (id, title, project, status, ago, model, o = {}) => ({ id, title, project, projectId: "p-" + project, status, activityAt: now - ago * min, parentId: o.parentId || null, model, archived: !!o.archived, branch: o.branch || null, worktree: null });
  const ALL = [
    R("d-w1", "Build the booking page", "Booking app", "working", 1, sonnet, { branch: "feat/booking" }), R("d-h2", "Write calendar tests", "Booking app", "working", 2, sonnet, { parentId: "d-w1" }), R("d-h3", "Check phone layout", "Booking app", "done", 18, sonnet, { parentId: "d-w1" }),
    R("d-d1", "Fix login redirect", "Booking app", "done", 95, M("claude-opus-5-5", "high"), { branch: "fix/login" }), R("d-old", "Throwaway: send test", "Booking app", "done", 3000, sonnet, { archived: true }),
    R("d-w2", "Weekly release", "Video tool", "needs-you", 3, opus, { branch: "release/notes" }), R("d-need-2", "Publish the release notes", "Video tool", "needs-you", 11, sonnet, { parentId: "d-w2" }), R("d-d2", "Add dark theme colours", "Video tool", "done", 210, { instanceId: "claudeAgent_2", model: "claude-sonnet-5-5", effort: "medium" }),
    R("d-w3", "Tidy old drafts", "Notes", "stalled", 26, sonnet), R("d-d3", "Summarise last week", "Notes", "done", 400, { instanceId: "codex", model: "gpt-6.1", effort: null }),
  ];
  const SNIPS = { "d-w1": "Booking page is half done, now wiring the calendar to the form…", "d-h2": "Added 12 tests for overlapping slots; two still failing on time zones.", "d-h3": "Looks right on a 390 px phone, no overflow.", "d-d1": "Fixed: the redirect kept the old path after login. Test added.", "d-w2": "I need your OK to publish the release notes.", "d-need-2": "Ready to publish; waiting for the go-ahead.", "d-d2": "Dark theme colours added, contrast checked.", "d-w3": "No progress for 26 minutes, last step was reading the drafts folder.", "d-d3": "Summary of last week is ready in the shared notes." };

  // ---- Life sample data (all invented; relative to now so it always looks current) ----
  const hr = 3600_000, ago = (h) => new Date(now - h * hr).toISOString();
  const LM = (id, h, from, subject, snippet, o = {}) => ({ id, threadId: "t-" + id, from, subject, date: ago(h), snippet, labels: o.labels || ["INBOX", "UNREAD"], hasAttachments: !!o.atts, attachments: (o.atts || []).map(([name, size], i) => ({ id: id + "a" + i, name, size, mime: "application/octet-stream" })), unsub: o.unsub || null });
  const wd = (n) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(now + 4 * hr + n * 86400_000).getUTCDay()];
  const LIFE_MAIL = [
    LM("L1", 1, "Maya Okafor <maya@example.org>", "Can you send the stall price list?", "Hi, could you send me the updated stall price list before the market? Thanks, Maya"),
    LM("L2", 3, "Dr Rao <rao@clinic.example>", "Your visit " + wd(2) + " 14:30 and forms", "Please confirm the appointment on " + wd(2) + " 14:30 if you can make it"),
    LM("L3", 5, "Sam Patel <sam@example.net>", "Photos from the shop", "Here are the photos, no rush", { atts: [["shop-front.jpg", 220000], ["image001.png", 90000]] }),
    LM("L4", 6, "Pay Service <noreply@payments.example>", "Receipt for your order #8812", "Thanks for your payment of $12.00", { labels: ["INBOX", "CATEGORY_UPDATES"] }),
    LM("L5", 8, "Garden Weekly <news@garden.example>", "This week: 7 plants for shade", "Newsletter. Unsubscribe any time", { labels: ["INBOX", "CATEGORY_PROMOTIONS"], unsub: { url: "https://garden.example/unsub", mailto: null } }),
    LM("L6", 10, "Lena Fischer <lena@example.org>", "Invoice for the October stall", "Invoice attached", { atts: [["Invoice-October.pdf", 48000]] }),
    LM("L7", 20, "Jobs Alert <jobs@board.example>", "5 new jobs for you", "Recommended jobs near you", { unsub: { url: "https://board.example/unsub", mailto: null } }),
    LM("L8", 26, "Tom Rivers <tom@example.com>", "Lunch this week?", "Are you free " + wd(3) + " at 1pm?", { labels: ["INBOX"] }),
  ];
  const dayStr = (d) => new Date(now + 4 * hr + d * 86400_000).toISOString().slice(0, 10);
  const EV = (id, d, h1, m1, h2, m2, title, location = "") => { const p = (n) => String(n).padStart(2, "0"); return { id, title, location, calendar: "primary", allDay: false, start: dayStr(d) + "T" + p(h1) + ":" + p(m1) + ":00+04:00", end: dayStr(d) + "T" + p(h2) + ":" + p(m2) + ":00+04:00" }; };
  const LIFE_EVENTS = [EV("x1", 0, 9, 0, 9, 30, "Standup"), EV("x2", 0, 15, 0, 16, 0, "Dentist", "Town clinic"), EV("x3", 1, 11, 0, 11, 45, "Supplier call"), EV("x4", 3, 8, 0, 13, 0, "Market day", "Main square"), EV("x5", 3, 17, 30, 18, 30, "Yoga"), EV("x6", 5, 9, 0, 12, 0, "Open day"), EV("x7", 6, 12, 30, 14, 0, "Family lunch")];
  const DRIVE = [{ id: "dr1", name: "Stall price list.pdf", mime: "application/pdf", modified: ago(26), link: "#" }, { id: "dr2", name: "Price planning 2027", mime: "application/vnd.google-apps.spreadsheet", modified: ago(120), link: "#" }, { id: "dr3", name: "Pricing notes", mime: "application/vnd.google-apps.document", modified: ago(216), link: "#" }, { id: "fo1", name: "Sample folder", mime: "application/vnd.google-apps.folder", modified: ago(48), link: "#" }];
  const lifeMarks = {}; let lifePins = [{ id: "fo1", name: "Sample folder" }];

  // ---- R23 sample data (all invented): bills, topics, decisions waiting for the Ready session ----
  const pad2 = (n) => String(n).padStart(2, "0");
  const dayKeyOf = (t) => { const d = new Date(t + 4 * hr); return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()); };
  const todayKey = () => dayKeyOf(Date.now());
  const dayNumOf = (s) => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400_000); };
  let billSeq = 10, lastDeleted = null;
  const BILLS = [
    { id: "bill1", name: "Water", amount: 300, due: dayKeyOf(now + 1 * 86400_000), repeat: "monthly", paid: false, paidAt: null, lastPaid: null },
    { id: "bill2", name: "Internet", amount: 500, due: dayKeyOf(now + 4 * 86400_000), repeat: "monthly", paid: false, paidAt: null, lastPaid: null },
    { id: "bill3", name: "Rent", amount: 5000, due: dayKeyOf(now + 9 * 86400_000), repeat: "monthly", paid: false, paidAt: null, lastPaid: null },
    { id: "bill4", name: "Phone", amount: 200, due: dayKeyOf(now + 13 * 86400_000), repeat: "none", paid: false, paidAt: null, lastPaid: null },
    { id: "bill5", name: "Gym", amount: 400, due: dayKeyOf(now - 3 * 86400_000), repeat: "none", paid: true, paidAt: dayKeyOf(now - 4 * 86400_000), lastPaid: null },
  ];
  const billsView = () => { const t = todayKey(); const v = BILLS.map((b) => { const days = dayNumOf(b.due) - dayNumOf(t); return { ...b, days, overdue: !b.paid && days < 0 }; }); v.sort((a, b) => (a.paid - b.paid) || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0)); return { bills: v, today: t }; };
  const TOPICS = [
    { id: "planner", name: "Planner", threadId: "d-w2", head: true, status: "Two decisions are ready for you.", updatedAt: now - 5 * min, unread: true },
    { id: "booking", name: "Booking app", threadId: "d-w1", head: false, status: "Calendar is wired to the form, tests running.", updatedAt: now - 12 * min, unread: true },
    { id: "video", name: "Video tool", threadId: "d-d2", head: false, status: "Dark theme colours added, contrast checked.", updatedAt: now - 3 * hr, unread: false },
    { id: "notes", name: "Notes", threadId: "d-d3", head: false, status: "Summary of last week is ready.", updatedAt: now - 7 * hr, unread: false },
  ];
  const PD = (id, topic, title, detail, options, def, mins) => ({ id, topicId: null, threadId: null, from: topic, topic, title, detail, options, default: def, createdAt: now - mins * min, status: "open", answer: null, how: null, laterUntil: 0, delivery: "none", undoUntil: 0 });
  const PENDING = [
    PD("pd1", "Booking app", "Which colour for the Book button?", "Both pass the contrast check on a phone.", ["Green", "Blue", "Keep the current one"], 0, 30),
    PD("pd2", "Video tool", "Publish the release notes today?", "They are ready and reviewed.", ["Publish today", "Wait until Monday"], 0, 20),
    PD("pd3", "Notes", "Archive drafts older than 30 days?", "12 drafts would move to the archive. Nothing is deleted.", ["Archive them", "Leave them", "Ask me again next week"], 0, 10),
  ];
  const pendingView = () => { const t = Date.now(), items = PENDING.filter((d) => d.status === "open" && d.laterUntil <= t), later = PENDING.filter((d) => d.status === "open" && d.laterUntil > t);
    return { items, later, recent: PENDING.filter((d) => d.status === "answered"), problems: [], counts: { ready: items.length, later: later.length, answered: PENDING.filter((d) => d.status === "answered").length, undo: 0, failed: 0 }, now: t, existing: { questions: 0, permissions: state.needs.length, secrets: 0, total: state.needs.length } }; };

  // Fake event streams
  const listeners = new Set();
  const push = () => listeners.forEach((f) => f());
  class FakeES {
    constructor(url) {
      this.url = url; this.h = {}; this.closed = false;
      const send = () => {
        if (this.closed) return;
        if (url.startsWith("/api/thread/events")) { const c = chatFor(decodeURIComponent(new URL(url, location.href).searchParams.get("id"))); if (c) this.h.chat?.({ data: JSON.stringify(c) }); }
        else this.h.state?.({ data: JSON.stringify(state) });
      };
      this.send = send; listeners.add(send);
      setTimeout(() => { this.onopen?.(); send(); }, 60);
    }
    addEventListener(n, f) { this.h[n] = f; }
    close() { this.closed = true; listeners.delete(this.send); }
  }
  window.EventSource = FakeES;
  // No service worker in the demo (no sw.js is shipped): registering would only produce a 404.
  try { if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {}); } catch {}

  // Fake fetch for /api/*: never reaches the network.
  const realFetch = window.fetch.bind(window);
  const json = (o, status = 200) => Promise.resolve(new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } }));
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("/api/")) return realFetch(input, init);
    if (url.startsWith("/api/usage") && !url.startsWith("/api/usage/")) return json({ plans: [
      { id: "claude", name: "Kemino", dot: "green", limited: false, limitedUntil: null, windows: [{ label: "5 hours", usedPct: 12, leftPct: 88 }, { label: "7 days", usedPct: 45, leftPct: 55 }] },
      { id: "claude_2", name: "kbb", dot: "green", limited: false, limitedUntil: null, windows: [{ label: "5 hours", usedPct: 0, leftPct: 100 }] },
      { id: "codex", name: "Codex", dot: "amber", limited: false, limitedUntil: null, windows: [{ label: "5 hours", usedPct: 82, leftPct: 18 }, { label: "Weekly", usedPct: 65, leftPct: 35 }] },
      { id: "copilot", name: "Copilot", dot: "green", limited: false, limitedUntil: null, windows: [{ label: "Premium interactions", usedPct: 53, leftPct: 47 }] },
      { id: "antigravity", name: "Antigravity", dot: "red", limited: true, limitedUntil: new Date(now + 3 * 3600_000).toISOString(), windows: [] },
    ] });
    // Life screen: INVENTED mail, calendar and Drive (example.org / example.net addresses only). Marks live in memory.
    if (url.startsWith("/api/google/status")) return json({ enabled: true, state: "connected", email: "demo@example.org", scopes: ["mail", "calendar", "drive"], allowed: { mail: true, calendar: true, drive: true }, clientConfigured: true });
    if (url.startsWith("/api/google/mail")) return json({ messages: LIFE_MAIL });
    if (url.startsWith("/api/google/calendar")) return json({ events: LIFE_EVENTS });
    if (url === "/api/google/life/marks") return json({ marks: lifeMarks, pins: lifePins });
    if (url === "/api/google/life/mark") { let b = {}; try { b = JSON.parse(init.body); } catch {} if (b.mark === "clear") delete lifeMarks[b.id]; else lifeMarks[b.id] = { mark: b.mark, until: b.until, at: Date.now() }; return json({ ok: true, marks: lifeMarks }); }
    if (url === "/api/google/life/pin") { let b = {}; try { b = JSON.parse(init.body); } catch {} lifePins = lifePins.filter((p) => p.id !== b.id); if (b.on) lifePins.push({ id: b.id, name: b.name }); return json({ ok: true, pins: lifePins }); }
    if (url.startsWith("/api/google/drive/search")) { const q = (new URL(url, location.href).searchParams.get("q") || "").toLowerCase(); return json({ files: DRIVE.filter((f) => f.name.toLowerCase().includes(q)) }); }
    if (url.startsWith("/api/google/drive/folder/")) return json({ files: [{ id: "df1", name: "Sample budget.xlsx", mime: "application/vnd.google-apps.spreadsheet", modified: at(3000), link: "#" }] });
    if (url.startsWith("/api/google/files")) return json({ files: [] });
    // Ask desk: a canned "Next" list (the real one reads the repo's plan files).
    if (url.startsWith("/api/desk/next")) return json({ available: true, asOf: now - 20 * min, next: ["Finish the booking page and run the tests.", "Publish the release notes once approved.", "Tidy the old drafts in Notes."], running: ["Build the booking page", "Weekly release"], waiting: 1 });
    if (url.startsWith("/api/t3/health")) return json({ banner: "", bad: false, version: "sample" });
    if (url.startsWith("/api/flags")) return json({ features: ["today", "chat", "approve", "brief", "office", "map", "automations", "queue", "insights", "decisions", "tidy", "stop-today", "apps", "skills", "weekly", "hours", "google"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), hint: "Sample feature", locked: ["today", "chat", "approve"].includes(k), main: ["today", "chat", "approve", "brief", "office", "notifications", "google"].includes(k), defaultMain: true, taps7: 0, taps30: 0 })), cap: { pct: 0, default: 0 } });
    // All threads (sample): the list and the last-message snippets. Registered before the /api/thread prefix below.
    if (url.startsWith("/api/search")) { const q = (new URL(url, location.href).searchParams.get("q") || "").toLowerCase(); const hits = ALL.filter((t) => !t.archived && (SNIPS[t.id] || "").toLowerCase().includes(q) && !t.title.toLowerCase().includes(q)).map((t) => { const x = SNIPS[t.id], i = x.toLowerCase().indexOf(q); return { id: t.id, field: "text", excerpt: x.slice(Math.max(0, i - 30), i + q.length + 60), at: i - Math.max(0, i - 30), len: q.length }; }); return json({ q, hits, searched: ALL.length, of: ALL.length, partial: false, ms: 5 }); }
    if (url.startsWith("/api/threads/snippets")) { const ids = decodeURIComponent(url.split("ids=")[1] || "").split(","); return json({ snippets: Object.fromEntries(ids.filter((i) => SNIPS[i]).map((i) => [i, { text: SNIPS[i], role: "assistant", at: at(5) }])) }); }
    if (url.startsWith("/api/threads")) { const arch = url.includes("archived=1"); return json({ projects: [], threads: ALL.filter((t) => arch || !t.archived), complete: true, source: "http", archivedIncluded: arch, at: now }); }
    if (url.startsWith("/api/thread")) { const c = chatFor(decodeURIComponent(new URL(url, location.href).searchParams.get("id"))); return c ? json(c) : json({ error: "not found" }, 404); }
    const method = (init?.method || "GET").toUpperCase();
    // ---- R23 screens: Bills, Topics board, Ready/Decision session. INVENTED data; every write only changes memory. ----
    if (url === "/api/bills" || url.startsWith("/api/bills/")) {
      let b = {}; try { b = JSON.parse(init?.body || "{}"); } catch {}
      const op = url.slice("/api/bills".length + 1);
      const bad = (m) => json({ error: m }, 400);
      const find = (id) => BILLS.find((x) => x.id === id);
      if (method === "POST") {
        if (op === "add" || op === "edit") {
          const name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 60); if (!name) return bad("Give the bill a name.");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.due || ""))) return bad("Pick a real due date.");
          const amount = b.amount === null || b.amount === "" || b.amount === undefined ? null : Number(b.amount); if (amount !== null && !(amount >= 0)) return bad("The amount should be a number, or left empty.");
          const repeat = b.repeat === "monthly" ? "monthly" : "none";
          if (op === "add") BILLS.push({ id: "bill" + (++billSeq), name, amount, due: b.due, repeat, paid: false, paidAt: null, lastPaid: null });
          else { const x = find(b.id); if (!x) return json({ error: "That bill is gone." }, 404); Object.assign(x, { name, amount, due: b.due, repeat }); }
        } else if (op === "paid") {
          const x = find(b.id); if (!x) return json({ error: "That bill is gone." }, 404);
          if (x.repeat === "monthly") { x.lastPaid = { due: x.due, at: todayKey() }; const [y, m, d] = x.due.split("-").map(Number); x.due = dayKeyOf(Date.UTC(y, m, d)); }
          else { x.paid = true; x.paidAt = todayKey(); }
        } else if (op === "unpaid") {
          const x = find(b.id); if (!x) return json({ error: "That bill is gone." }, 404);
          if (x.lastPaid) { x.due = x.lastPaid.due; x.lastPaid = null; } else { x.paid = false; x.paidAt = null; }
        } else if (op === "delete") { const i = BILLS.findIndex((x) => x.id === b.id); if (i >= 0) { lastDeleted = BILLS.splice(i, 1)[0]; } }
        else if (op === "restore") { if (lastDeleted && lastDeleted.id === b.id) { BILLS.push(lastDeleted); lastDeleted = null; } }
        else return json({ error: "unknown bills action" }, 404);
        return json({ ok: true, ...billsView() });
      }
      return json(billsView());
    }
    if (url.startsWith("/api/topics/seen")) { let b = {}; try { b = JSON.parse(init?.body || "{}"); } catch {} const t = TOPICS.find((x) => x.id === b.id); if (t) t.unread = false; return json({ ok: true }); }
    if (url.startsWith("/api/topics")) return json({ topics: TOPICS.map((t) => ({ ...t })) });
    if (url.startsWith("/api/decisions/pending")) return json(pendingView());
    if (url.startsWith("/api/decisions/answer") && method === "POST") {
      let b = {}; try { b = JSON.parse(init?.body || "{}"); } catch {}
      const ids = b.all ? (b.ids || []) : [b.id], until = Date.now() + 10_000, out = [];
      for (const id of ids) { const d = PENDING.find((x) => x.id === id && x.status === "open"); if (!d) continue; d.status = "answered"; d.answer = b.choice; d.prevLater = d.laterUntil; if (b.choice === "later") d.laterUntil = Date.now() + 3 * hr; out.push({ id, undoUntil: until }); }
      return json({ ok: true, decisions: out });
    }
    if (url.startsWith("/api/decisions/undo") && method === "POST") { let b = {}; try { b = JSON.parse(init?.body || "{}"); } catch {} for (const id of b.ids || []) { const d = PENDING.find((x) => x.id === id); if (d) { d.status = "open"; d.answer = null; d.laterUntil = 0; } } return json({ ok: true }); }
    if (url.startsWith("/api/decisions/resend")) return json({ ok: true });
    if ((init?.method || "GET") === "POST") {
      let b = {}; try { b = JSON.parse(init.body); } catch {}
      if (url === "/api/respond") {
        const i = state.needs.findIndex((n) => n.requestId === b.requestId);
        if (i >= 0) {
          const risky = state.needs[i].risky;
          if (risky && b.decision !== "decline" && !b.confirm) return json({ needsConfirm: true, kinds: state.needs[i].riskKinds }, 409);
          const id = state.needs[i].id; state.needs.splice(i, 1);
          const t = flat().find((x) => x.id === id); if (t) t.status = b.decision === "decline" ? "done" : "working";
          state.working.forEach((g) => { g.counts = { "needs-you": 0, working: 0, stalled: 0, failed: 0, done: 0 }; g.helpers.forEach((k) => g.counts[k.status]++); });
          setTimeout(push, 80);
        }
      }
      return json({ ok: true, queued: false });
    }
    if (url.startsWith("/api/state")) return json(state);
    // ---- R21 screens: invented sample data only. Writes (POST/DELETE) only touch memory or answer "ok". ----
    const qp = (k) => new URL(url, location.href).searchParams.get(k);
    if (url.startsWith("/api/auth/me")) return json({ ok: true, user: "demo", name: "Demo" });
    if (url.startsWith("/api/providers")) {
      const P = (instanceId, displayName, label, models, usage = { windows: [{ label: "5 hours", usedPct: 20, leftPct: 80 }, { label: "7 days", usedPct: 40, leftPct: 60 }], limited: false, limitedUntil: null }) => ({ instanceId, displayName, version: "1.0", auth: { label, email: "demo@example.org" }, status: { kind: "ready", word: "Ready" }, models, usage, t3Says: [] });
      const mm = (name, e) => ({ name, efforts: e ? [{ id: "reasoningEffort", values: ["Low", "Medium", "High"] }] : [] });
      return json({ readAt: new Date(now).toISOString(), stale: false, notEnabled: ["Sample extra AI"], notSetUp: [], providers: [
        P("claudeAgent", "Kemino", "Sample plan", [mm("Claude Sonnet 5.5", 1), mm("Claude Opus 5.5", 1), mm("Claude Haiku 5.5")]),
        P("claudeAgent_2", "kbb", "Sample plan", [mm("Claude Sonnet 5.5", 1)]),
        P("codex", "Codex", "Sample plan", [mm("GPT sample", 1)]),
        P("copilot", "Copilot", "Sample plan", [mm("Sample model")]),
        P("antigravity", "Antigravity", "Sample plan", [mm("Sample model")]),
      ] });
    }
    if (url.startsWith("/api/code")) {
      const br = (name, state, ahead, behind, ago, o = {}) => ({ name, state, ahead, behind, unread: false, tipAt: at(ago * 60), pr: o.pr || null, threads: o.threads || [], commits: (o.commits || []).map((c, i) => ({ msg: c, at: at((ago + i) * 60), by: "You" })) });
      return json({ now, configFile: "the demo", configError: null, repos: [
        { repo: "demo/booking-app", def: "main", ok: true, counts: { active: 2, merged: 1, stale: 1, all: 4 }, trunkTipAt: at(120), hidden: 0, truncated: false, branches: [
          br("feat/booking", "active", 6, 1, 1, { pr: { number: 12, title: "Booking page" }, threads: [{ id: "d-w1", title: "Build the booking page", status: "working" }], commits: ["Add calendar form", "Wire the slots list"] }),
          br("fix/login", "merged", 0, 0, 95, { commits: ["Fix redirect after login"] }),
          br("feat/reminders", "active", 2, 4, 30, { commits: ["Sketch reminder emails"] }),
          br("old/spike", "stale", 3, 40, 900, { commits: ["Try a different layout"] }),
        ] },
        { repo: "demo/video-tool", def: "main", ok: true, counts: { active: 1, merged: 1, stale: 0, all: 2 }, trunkTipAt: at(300), hidden: 0, truncated: false, branches: [
          br("release/notes", "active", 3, 0, 3, { threads: [{ id: "d-w2", title: "Weekly release", status: "needs-you" }], commits: ["Draft the release notes"] }),
          br("feat/dark", "merged", 0, 0, 210, { commits: ["Dark theme colours"] }),
        ] },
      ] });
    }
    if (url.startsWith("/api/decisions")) return json({ decisions: [
      { id: "dec1", thread: "Build the booking page", project: "Booking app", answer: "Allowed", ts: now - 40 * min, source: "you", asked: "npm run build" },
      { id: "dec2", thread: "Weekly release", project: "Video tool", answer: "Allowed", ts: now - 3 * 3600_000, source: "rule", rule: { id: "r1" }, asked: "git status" },
      { id: "dec3", thread: "Tidy old drafts", project: "Notes", answer: "Declined", ts: now - 26 * 3600_000, source: "you", asked: "rm -rf drafts/old" },
    ] });
    if (url.startsWith("/api/rules")) return json({ enabled: true, rules: [{ id: "r1", label: "Allow read-only git commands", kind: "command", pattern: "git status", project: "Video tool", createdAt: now - 5 * 86400_000, text: "git status" }] });
    if (url.startsWith("/api/queue")) return json({ jobs: [{ id: "q1", state: "queued", text: "Run the nightly checks and tell me what failed", project: { id: "p1", title: "Booking app" }, providerName: "Kemino", model: "claude-sonnet-5-5", effort: "medium", runtimeMode: "approval-required", waitText: "at 02:00", createdAt: now - 3600_000, startedAt: null, error: null }], limits: { perHour: 4, startedLastHour: 0, checkEveryMinutes: 5 }, projects: [{ id: "p1", title: "Booking app" }, { id: "p2", title: "Video tool" }], providers: [{ instanceId: "claudeAgent", name: "Kemino" }], note: "Demo: nothing is queued for real." });
    if (url.startsWith("/api/automations")) return json({ automations: [
      { id: "a1", name: "Morning tidy", project: "Notes", schedule: "Every day 07:00", enabled: true, blocked: null, nextRun: at(-480), lastRun: at(960), lastResult: "succeeded", fullAccess: false },
      { id: "a2", name: "Weekly summary", project: "Video tool", schedule: "Mondays 09:00", enabled: false, blocked: null, nextRun: null, lastRun: at(8640), lastResult: "succeeded", fullAccess: false },
    ] });
    if (url.startsWith("/api/skills")) return json({ skills: [{ name: "release-notes", description: "Draft the weekly release notes from merged work.", uses: 5, lastUsed: at(300) }, { name: "review", description: "Review a branch for bugs.", uses: 2, lastUsed: at(2000) }, { name: "tidy-drafts", description: "Archive old drafts.", uses: 0 }], scan: { available: true, days: 14 }, other: [] });
    if (url.startsWith("/api/usage/projects")) return json({ days: 7, projects: [{ name: "Booking app", active: 5, helpers: 3, started: 2, byProvider: [{ provider: "Kemino", models: [{ model: "claude-sonnet-5-5", count: 4 }] }] }, { name: "Video tool", active: 3, helpers: 1, started: 1, byProvider: [{ provider: "Kemino", models: [{ model: "claude-opus-5-5", count: 2 }] }] }, { name: "Notes", active: 1, helpers: 0, started: 1, byProvider: [] }], totals: { active: 9, helpers: 4, started: 4 }, tokens: { available: false, note: "Token counts are not part of the demo." } });
    if (url.startsWith("/api/ledger")) return json({ days: 7, today: { asks: 6, jobs: 12, pct: 12 }, rows: [], note: "Sample numbers." });
    if (url.startsWith("/api/apps")) return json({ now, note: "Read-only: nothing here changes a repo.", apps: [{ ok: true, name: "Booking app", branch: "main", ahead: 0, behind: 0, lastCommitAt: at(120), uncommitted: 0, worktrees: 1, ci: { state: "ok" } }, { ok: true, name: "Video tool", branch: "main", ahead: 2, behind: 0, lastCommitAt: at(300), uncommitted: 3, worktrees: 0, ci: { state: "running" } }] });
    if (url.startsWith("/api/leadfiles")) return json({ files: [], note: "No lead files in the demo." });
    if (url.startsWith("/api/hours")) return json({ days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({ day: d, date: dayStr(i - 6), hours: [2.5, 3, 1.5, 4, 2, 0.5, 1][i], minutes: [150, 180, 90, 240, 120, 30, 60][i] })), total: 14.5, note: "Sample hours." });
    if (url.startsWith("/api/stop-today")) return json({ on: false, paused: [], running: 2, count: 2, threads: [{ id: "d-w1", title: "Build the booking page" }, { id: "d-w2", title: "Weekly release" }] });
    if (url.startsWith("/api/tidy/auto")) return json({ enabled: false, last: null });
    if (url.startsWith("/api/tidy/recent")) return json({ batches: [], running: null });
    if (url.startsWith("/api/tidy")) return json({ candidates: [], total: 0, note: "Nothing to tidy in the demo." });
    if (url.startsWith("/api/brief")) { const weekly = qp("kind") === "weekly"; return json({ kind: weekly ? "weekly" : "morning", title: weekly ? "Week in review" : "Morning brief", at: now, lines: ["2 things wait on you.", "3 jobs are working, 1 looks stuck.", "Next: Standup at 09:00."], sections: [{ title: "Needs you", items: ["Run the test suite", "Publish the release notes"] }, { title: "Done", items: ["Fix login redirect", "Add dark theme colours"] }], done: ["Fix login redirect", "Add dark theme colours"], needs: ["Run the test suite", "Publish the release notes"], text: "Sample brief." }); }
    if (url.startsWith("/api/desk/head")) return json({ available: true, canSend: false, reason: "Demo: nothing is sent", head: null, threads: [] });
    if (url.startsWith("/api/newthread/options")) { const mo = (slug, name, eff) => ({ slug, name, isDefault: slug === "claude-sonnet-5-5", effort: eff ? { options: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium", isDefault: true }, { id: "high", label: "High" }] } : null }); return json({ projects: [{ id: "p1", title: "Booking app" }, { id: "p2", title: "Video tool" }, { id: "p3", title: "Notes" }], providers: [{ instanceId: "claudeAgent", name: "Kemino", state: "ready", runtimeModes: ["approval-required", "auto-accept-edits", "full-access"], models: [mo("claude-sonnet-5-5", "Claude Sonnet 5.5", 1), mo("claude-opus-5-5", "Claude Opus 5.5", 1), mo("claude-haiku-5-5", "Claude Haiku 5.5", 0)] }, { instanceId: "codex", name: "Codex", state: "ready", runtimeModes: ["approval-required"], models: [mo("gpt-sample", "GPT sample", 1)] }] }); }
    if (url.startsWith("/api/push/settings")) return json({ settings: {}, subscribed: false, supported: false });
    if (url.startsWith("/api/push/key")) return json({ key: "" });
    if (url.startsWith("/api/slash")) return json({ commands: [{ name: "review", description: "Review the branch" }, { name: "status", description: "Show what is running" }] });
    if (url.startsWith("/api/render")) return json({ ok: false, error: "Not part of the demo" }, 404);
    if (method !== "GET") return json({ ok: true, demo: true });
    (window.__demoMiss = window.__demoMiss || []).push(url);
    return json({});
  };

  // Every "Sent" toast becomes an honest demo message.
  addEventListener("DOMContentLoaded", () => {
    const toast = document.getElementById("toast");
    new MutationObserver(() => { if (/^(Sent|Queued|Model|Thread started|Started|Cancelled|Brought back|Archived|Remembered|Rule removed|Saved|Auto-tidy|Done|Answered|Stopped|Resumed)/.test(toast.textContent)) toast.textContent = "Demo: nothing was sent"; }).observe(toast, { childList: true, characterData: true, subtree: true });
    // Push notifications need a real server and service worker: not part of the look-only demo, so the Menu entry is hidden.
    new MutationObserver(() => document.querySelectorAll("button").forEach((x) => { if (/^Notifications/.test(x.textContent.trim()) && x.closest(".np-wrap")) x.remove(); })).observe(document.body, { childList: true, subtree: true });
    const b = document.createElement("div"); b.id = "demo-badge"; b.textContent = "DEMO · sample data"; document.body.append(b);
  });
})();
