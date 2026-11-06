// Kemino OS DEMO layer. Replaces the live backend with sample data, so the page runs with no backend.
// Nothing here talks to any server. Buttons only change the sample state in memory.
(() => {
  const now = Date.now(), min = 60_000;
  const M = (model, effort) => ({ instanceId: "claudeAgent", model, effort });
  const th = (id, title, project, status, ago, model, extra = {}) => ({ id, title, project, status, reason: null, held: false, activityAt: now - ago * min, model, branch: extra.branch || null, source: "web", parentId: extra.parentId || null, depth: extra.depth || 0, ...extra });
  const grp = (t, helpers = []) => { const counts = { "needs-you": 0, working: 0, stalled: 0, failed: 0, done: 0 }; helpers.forEach((k) => counts[k.status]++); return { ...t, helpers, counts }; };
  const sonnet = M("claude-sonnet-5-5", "medium"), opus = M("claude-opus-5-5", "high");

  const state = {
    scope: "day", now, connected: true, hiddenRoots: 7,
    models: { byInstance: { claudeAgent: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"], claudeAgent_2: ["claude-sonnet-5-5"] }, efforts: ["low", "medium", "high"] },
    needs: [
      { id: "d-need-1", rootId: "d-w1", title: "Run the test suite", rootTitle: "Build the booking page", project: "Salon app", chain: [{ id: "d-w1", title: "Build the booking page" }, { id: "d-need-1", title: "Run the test suite" }], kind: "permission", requestId: "r1", since: now - 4 * min, held: false, detail: "npm test -- --run booking", risky: false, riskKinds: [] },
      { id: "d-need-2", rootId: "d-w2", title: "Publish the release notes", rootTitle: "Weekly release", project: "Video tool", chain: [{ id: "d-w2", title: "Weekly release" }, { id: "d-need-2", title: "Publish the release notes" }], kind: "permission", requestId: "r2", since: now - 11 * min, held: false, detail: "git push origin release/notes", risky: true, riskKinds: ["push"] },
    ],
    working: [
      grp(th("d-w1", "Build the booking page", "Salon app", "working", 1, sonnet, { branch: "feat/booking" }), [
        th("d-need-1", "Run the test suite", "Salon app", "needs-you", 4, sonnet, { parentId: "d-w1", depth: 1 }),
        th("d-h2", "Write calendar tests", "Salon app", "working", 2, sonnet, { parentId: "d-w1", depth: 1 }),
        th("d-h3", "Check phone layout", "Salon app", "done", 18, sonnet, { parentId: "d-w1", depth: 1 }),
      ]),
      grp(th("d-w2", "Weekly release", "Video tool", "working", 3, opus, { branch: "release/notes" }), [th("d-need-2", "Publish the release notes", "Video tool", "needs-you", 11, sonnet, { parentId: "d-w2", depth: 1 })]),
      grp(th("d-w3", "Tidy old drafts", "Notes", "stalled", 26, sonnet, { reason: "no progress for 26 min" })),
    ],
    done: [
      grp(th("d-d1", "Fix login redirect", "Salon app", "done", 95, sonnet, { branch: "fix/login" })),
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

  // Fake fetch for /api/*: never reaches the network.
  const realFetch = window.fetch.bind(window);
  const json = (o, status = 200) => Promise.resolve(new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } }));
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("/api/")) return realFetch(input, init);
    if (url.startsWith("/api/thread")) { const c = chatFor(decodeURIComponent(new URL(url, location.href).searchParams.get("id"))); return c ? json(c) : json({ error: "not found" }, 404); }
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
    return json(state);
  };

  // Every "Sent" toast becomes an honest demo message.
  addEventListener("DOMContentLoaded", () => {
    const toast = document.getElementById("toast");
    new MutationObserver(() => { if (/^(Sent|Queued|Model)/.test(toast.textContent)) toast.textContent = "Demo: nothing was sent"; }).observe(toast, { childList: true, characterData: true, subtree: true });
    const b = document.createElement("div"); b.id = "demo-badge"; b.textContent = "DEMO · sample data"; document.body.append(b);
  });
})();
