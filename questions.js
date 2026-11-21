// The question card: an agent's structured question (T3 "user_input", e.g. Claude's AskUserQuestion) answered with taps.
// Pure helpers first (Node tests them), then the card builder. Text goes in only as text nodes, never as HTML.

const MINE = /\s*\(recommended\)\s*$/i;
/** "Yes, start now (Recommended)" -> { text: "Yes, start now", mine: true }. The full original label is what gets sent back. */
export function splitPick(label) {
  const s = String(label ?? "");
  return MINE.test(s) ? { text: s.replace(MINE, ""), mine: true } : { text: s, mine: false };
}
/** Add or remove a label in a multiSelect pick list (new array, order of tapping). */
export function togglePick(list, label) {
  const l = Array.isArray(list) ? list : [];
  return l.includes(label) ? l.filter((x) => x !== label) : [...l, label];
}
/** The pick of one question is a usable answer: a non-empty text, or a list for a multiSelect (an EMPTY list is a valid answer: "none"). */
export function pickDone(q, v) {
  return q.multiSelect ? Array.isArray(v) : typeof v === "string" && v.trim() !== "";
}
/** The agent's own choice: the option marked "(Recommended)", else the first option. A multiSelect starts with its recommended options ticked, else with nothing ticked. */
export function defaultPick(q) {
  const opts = Array.isArray(q?.options) ? q.options : [];
  if (q?.multiSelect) return opts.filter((o) => MINE.test(String(o.label))).map((o) => o.label);
  const rec = opts.find((o) => MINE.test(String(o.label))) || opts[0];
  return rec ? rec.label : "";
}
/** What a question will send right now: the person's tap if there was one, else the default. */
export const effectivePick = (q, picks) => (picks && Object.prototype.hasOwnProperty.call(picks, q.question) ? picks[q.question] : defaultPick(q));
/** True when nothing was tapped or typed on any question: Send then means "use the defaults". */
export const defaultsUsed = (questions, picks) => !(Array.isArray(questions) ? questions : []).some((q) => picks && Object.prototype.hasOwnProperty.call(picks, q.question));
/** { [question text]: answer }. Always complete: a question nobody touched gets its default; a multiSelect with zero ticks is []. Null only when there is nothing to answer. */
export function buildAnswers(questions, picks) {
  if (!Array.isArray(questions) || !questions.length) return null;
  const out = {};
  for (const q of questions) {
    const v = effectivePick(q, picks);
    if (!pickDone(q, v)) return null;
    out[q.question] = q.multiSelect ? [...v] : v.trim();
  }
  return out;
}
/** The receipt text after sending (the page puts "Sent: " in front): "Blue" (one question), "all 3 defaults" (every question left alone), "1 Large \u00b7 2 default \u00b7 3 default" (mixed). */
export function receiptLine(questions, picks, answers) {
  const qs = Array.isArray(questions) ? questions : [];
  const touched = (q) => !!picks && Object.prototype.hasOwnProperty.call(picks, q.question);
  const text = (q) => { const a = answers?.[q.question]; return Array.isArray(a) ? (a.length ? a.map((x) => splitPick(x).text).join(", ") : "none") : splitPick(a ?? "").text; };
  if (qs.length === 1) return (touched(qs[0]) ? text(qs[0]) : "default").slice(0, 140);
  if (qs.length > 1 && !qs.some(touched)) return "all " + qs.length + " defaults";
  return (qs.map((q, i) => (i + 1) + " " + (touched(q) ? text(q) : "default")).join(" \u00b7 ")).slice(0, 140);
}
/** What goes with an answer to ctx.send: the receipt text and whether only defaults were used. */
export const answerMeta = (questions, picks, answers) => ({ defaultsUsed: defaultsUsed(questions, picks), receipt: receiptLine(questions, picks, answers) });
/** Short question = ONE single-choice question with 2 to 4 options: its options become chips on the bar (the agent's pick first). */
export function chipOptions(questions) {
  if (!Array.isArray(questions) || questions.length !== 1 || questions[0].multiSelect) return null;
  const o = questions[0].options;
  if (!Array.isArray(o) || o.length < 2 || o.length > 4) return null;
  return [...o].sort((a, b) => Number(MINE.test(String(b.label))) - Number(MINE.test(String(a.label))));
}
/** One tap is the whole answer only for a single, single-choice question. Anything else collects picks and has a Send button. */
export const oneTap = (questions) => Array.isArray(questions) && questions.length === 1 && !questions[0].multiSelect;
/** Can this question be shown at all? (The server sends null when it could not read it.) */
export const readable = (questions) => Array.isArray(questions) && questions.length > 0;
/** Plain-words version of an answer set, for the "Sent: ..." toast. */
export function summary(answers) {
  return Object.values(answers || {}).map((v) => splitPick(Array.isArray(v) ? v.join(", ") : v).text).join(" · ").slice(0, 120);
}

/** What the page remembers per open question between redraws. `text` (the "Other" box) stays out of the redraw signature on purpose. */
export function newDraft() { return { picks: {}, otherOpen: {}, text: {}, more: {} }; }
export const draftSig = (d) => (d ? JSON.stringify([d.picks, d.otherOpen, d.more || {}]) : "");

/** The slim bar above the message box: "1 question" + the first question on one line (CSS adds the ellipsis). */
export function barText(questions) {
  const qs = Array.isArray(questions) ? questions : [];
  const first = String(qs[0]?.question ?? "").replace(/\s+/g, " ").trim();
  return { count: qs.length === 1 ? "1 question" : qs.length + " questions", first };
}
/** Does a question text need the more/less toggle? (More than about two lines on a phone, or explicit line breaks.) */
export const needsMore = (text) => { const t = String(text ?? ""); return t.length > 110 || t.split("\n").length > 2; };

/**
 * The card. ctx: { h, badge, questions, title, draft, busy, answered, confirm, send(answers, confirm, event), redraw(), cancelConfirm() }
 *  - busy: an answer is on its way; answered: it went out, waiting for the thread to move on; confirm: kinds of risk in the free text
 */
export function questionCard(ctx) {
  const { h, badge, draft, questions, busy, answered, confirm } = ctx;
  const tapOnce = oneTap(questions);
  const complete = buildAnswers(questions, draft.picks);
  const fire = (answers, ok, e) => { if (answers && !busy && !answered) ctx.send(answers, ok === true, e, answerMeta(questions, draft.picks, answers)); };
  const pickOpt = (q, label, e) => {
    if (busy || answered) return;
    draft.otherOpen[q.question] = false; delete draft.text[q.question];
    if (q.multiSelect) draft.picks[q.question] = togglePick(effectivePick(q, draft.picks), label);
    else draft.picks[q.question] = label;
    if (tapOnce) fire({ [q.question]: label }, false, e);
    else { const i = questions.indexOf(q); if (!q.multiSelect && i >= 0 && i < questions.length - 1) draft.adv = i + 1; ctx.redraw(); } // a single pick moves on to the next question
  };
  const optBtn = (q, o) => {
    const { text, mine } = splitPick(o.label);
    const v = effectivePick(q, draft.picks);
    const on = q.multiSelect ? Array.isArray(v) && v.includes(o.label) : v === o.label;
    return h("button", { class: "qopt" + (on ? " on" : "") + (mine ? " mine" : ""), type: "button", disabled: busy || answered, "aria-pressed": on ? "true" : "false", onclick: (e) => pickOpt(q, o.label, e) },
      h("span", { class: "qo-top" }, h("b", { class: "qo-l" }, text), mine ? h("em", { class: "qo-mine" }, "Recommended") : null),
      o.description ? h("span", { class: "qo-d" }, o.description) : null);
  };
  const otherBlock = (q) => {
    const open = draft.otherOpen[q.question] === true;
    const free = typeof draft.picks[q.question] === "string" && !q.options.some((o) => o.label === draft.picks[q.question]);
    const btn = h("button", { class: "qopt other" + (open ? " on" : ""), type: "button", disabled: busy || answered, "aria-expanded": open ? "true" : "false",
      onclick: () => { if (busy || answered) return; draft.otherOpen[q.question] = !open; ctx.redraw(); } },
      h("span", { class: "qo-top" }, h("b", { class: "qo-l" }, "Other…")), h("span", { class: "qo-d" }, "Write your own answer"));
    if (!open) return [btn];
    const go = (e) => {
      const v = (draft.text[q.question] || "").trim();
      if (!v) return;
      if (q.multiSelect) { draft.picks[q.question] = togglePick(effectivePick(q, draft.picks), v); draft.otherOpen[q.question] = false; delete draft.text[q.question]; ctx.redraw(); return; }
      draft.picks[q.question] = v;
      if (tapOnce) fire({ [q.question]: v }, false, e); else ctx.redraw();
    };
    const input = h("input", { class: "qother", type: "text", maxlength: "500", placeholder: "Your answer", "aria-label": "Your own answer", enterkeyhint: "send", value: draft.text[q.question] || (free ? draft.picks[q.question] : "") || "",
      oninput: (e) => { draft.text[q.question] = e.target.value; }, onkeydown: (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); go(e); } } });
    return [btn, h("div", { class: "qo-free" }, input, h("button", { class: "b y", type: "button", disabled: busy || answered, onclick: go }, tapOnce ? "Send" : q.multiSelect ? "Add" : "Use"))];
  };
  const body = questions.map((q, qi) => h("div", { class: "q", "data-i": String(qi) },
    q.header ? h("span", { class: "q-h" }, q.header) : null,
    h("p", { class: "q-t" + (needsMore(q.question) && !draft.more?.[q.question] ? " clamp" : "") }, q.question),
    needsMore(q.question) ? h("button", { class: "q-more", type: "button", "aria-expanded": draft.more?.[q.question] ? "true" : "false", onclick: () => { draft.more = draft.more || {}; draft.more[q.question] = !draft.more[q.question]; ctx.redraw(); } }, draft.more?.[q.question] ? "less" : "more") : null,
    q.multiSelect ? h("p", { class: "q-m" }, "Pick any that apply") : null,
    h("div", { class: "qopts", role: q.multiSelect ? "group" : "radiogroup", "aria-label": q.question }, q.options.map((o) => optBtn(q, o)), ...otherBlock(q))));
  // extra free-text picks of a multiSelect question show as chips so they can be seen and removed
  const extras = questions.flatMap((q) => (q.multiSelect ? (effectivePick(q, draft.picks) || []).filter((x) => !q.options.some((o) => o.label === x)).map((x) => ({ q, x })) : []));
  return h("div", { class: "need qcard" + (answered ? " held" : "") },
    h("h3", {}, badge("needs-you"), h("span", { class: "grow" }, ctx.title || "This thread asks a question"),
      ctx.onClose ? h("button", { class: "qclose", type: "button", "aria-label": "Fold the question away", onclick: () => ctx.onClose() }, "Close \u2715") : null),
    ...body,
    extras.length ? h("div", { class: "qchips" }, extras.map(({ q, x }) => h("button", { class: "qchip", type: "button", title: "Remove", disabled: busy || answered, onclick: () => { draft.picks[q.question] = togglePick(effectivePick(q, draft.picks), x); ctx.redraw(); } }, x + "  ×"))) : null,
    answered ? h("p", { class: "hint" }, "Answered, updating. Waiting for the agent to move on.")
      : confirm ? h("div", { class: "confirm" }, h("p", {}, "Your own answer mentions " + confirm.join(" and ") + ". Send it?"),
        h("div", { class: "acts" }, h("button", { class: "b danger y", type: "button", disabled: busy, onclick: (e) => fire(complete, true, e) }, "Yes, send"), h("button", { class: "b", type: "button", onclick: () => ctx.cancelConfirm() }, "Edit")))
      : tapOnce ? null
      : h("div", { class: "acts" },
        h("button", { class: "b y", type: "button", disabled: busy || !complete, onclick: (e) => fire(complete, false, e) }, busy ? "Sending" : defaultsUsed(questions, draft.picks) ? "Send defaults" : "Send answer"),
        defaultsUsed(questions, draft.picks) ? h("span", { class: "hint qdef" }, "Nothing changed: the highlighted choices are sent.") : null));
}

/**
 * The shared shell: one slim row (a tap area with label + one-line essence, then the primary action nodes), an optional second row
 * (`rowNodes`: answer chips / Send defaults) and, when open, the draggable sheet that sits ABOVE the bar (the composer under it stays live).
 * ctx: { h, open, pulse, held, label, essence, go:[closedText, openText], actions:[nodes], rowNodes:[nodes], setOpen(bool), sheet: node, sheetLabel }
 * The sheet is a dialog with a drag handle (sheetdrag.js moves it with transform only) and scrolls inside itself.
 */
export function needBar(ctx) {
  const { h, open, pulse } = ctx;
  const go = ctx.go || ["\u25B4", "\u25BE"];
  const row = ctx.rowNodes && ctx.rowNodes.length;
  const bar = h("div", { class: "qbar" + (pulse && !open ? " pulse" : "") + (ctx.held ? " held" : "") + (row ? " two" : "") },
    h("button", { class: "qb-main", type: "button", "aria-expanded": open ? "true" : "false", "aria-controls": "qsheet", onclick: () => ctx.setOpen(!open) },
      h("span", { class: "qb-n" }, ctx.label), h("span", { class: "qb-t" }, ctx.essence), h("span", { class: "qb-go" }, open ? go[1] : go[0])),
    ctx.actions && ctx.actions.length ? h("div", { class: "qb-acts" }, ctx.actions) : null,
    row ? h("div", { class: "qb-row" }, ctx.rowNodes) : null);
  const sheet = open ? h("div", { class: "qs-clip" }, h("div", { class: "qsheet", id: "qsheet", role: "dialog", "aria-label": ctx.sheetLabel || ctx.label },
    h("button", { class: "qs-grab", type: "button", "aria-label": "Drag to resize or fold. Arrow up makes it taller, arrow down shorter.", "aria-expanded": "true" }, h("span", { class: "qs-pill", "aria-hidden": "true" })),
    h("div", { class: "qs-in" }, ctx.sheet))) : null;
  return h("div", { class: "qdock" }, sheet, bar);
}

/** One line of a longer text (command, label): whitespace folded, first non-empty line, so the bar never grows. */
export function oneLine(text, max = 160) {
  const first = String(text ?? "").split("\n").map((x) => x.replace(/\s+/g, " ").trim()).find(Boolean) || "";
  return first.length > max ? first.slice(0, max) + "\u2026" : first;
}

/** The sheet's top row for permission/secret cards (the question card puts its Close inside its own heading). */
export function sheetTop(h, title, onClose) {
  return h("div", { class: "qs-top" }, h("b", {}, title), h("button", { class: "qclose", type: "button", "aria-label": "Fold this away", onclick: () => onClose() }, "Close \u2715"));
}

/**
 * Permission request in the dock: bar = "Permission · <first line of the command>  [Yes] [No]", sheet = the full card (needCard, built by the caller).
 * ctx: { h, open, pulse, detail, risky, busy, canAct, answered, onYes(e), onNo(e), setOpen, card }
 * A risky command's Yes opens the sheet (the second confirmation lives in the card); a safe one is answered straight from the bar.
 */
export function permissionBar(ctx) {
  const { h } = ctx;
  const off = ctx.busy || ctx.answered || !ctx.canAct;
  const acts = [
    h("button", { class: "b y", type: "button", disabled: off, onclick: (e) => { e.stopPropagation(); if (ctx.risky) ctx.setOpen(true); else ctx.onYes(e); } }, ctx.busy ? "Sending" : ctx.risky ? "Review" : "Yes"),
    h("button", { class: "b", type: "button", disabled: off, onclick: (e) => { e.stopPropagation(); ctx.onNo(e); } }, "No")];
  return needBar({ h, open: ctx.open, pulse: ctx.pulse, held: ctx.answered, label: ctx.risky ? "Risky" : "Permission", essence: oneLine(ctx.detail) || "wants to run something",
    setOpen: ctx.setOpen, actions: acts, sheetLabel: "Permission request",
    sheet: [sheetTop(h, "Permission request", () => ctx.setOpen(false)), ctx.card] });
}

/** Secret request in the dock: bar = "Secret · <label>  [Open in T3]", sheet = the explanation. There is never an input: the value is typed in T3 only. */
export function secretBar(ctx) {
  const { h } = ctx;
  return needBar({ h, open: ctx.open, pulse: ctx.pulse, held: false, label: "Secret", essence: oneLine(ctx.secretLabel) || "a secret",
    setOpen: ctx.setOpen, sheetLabel: "Secret needed",
    actions: ctx.link ? [h("a", { class: "b y", href: ctx.link }, "Open T3")] : [],
    sheet: [sheetTop(h, "Secret request", () => ctx.setOpen(false)), ctx.card] });
}

/**
 * The question bar. Short question (one single-choice, 2 to 4 options): the options are CHIPS on the bar, the agent's pick first, one tap answers.
 * Longer sets: "Send defaults" (one tap sends every default) + "Answer" (opens the sheet). It never opens by itself.
 * ctx = questionCard's ctx plus { open, pulse, setOpen(bool) }.
 */
export function questionBar(ctx) {
  const { h, open, busy, answered } = ctx;
  const { count, first } = barText(ctx.questions);
  const off = busy || answered, chips = chipOptions(ctx.questions), q0 = ctx.questions[0];
  const send = (e, picked) => {
    if (off) return;
    const picks = picked ? { [q0.question]: picked } : { ...(ctx.draft?.picks || {}) }; // the bar's Send sends what the sheet already ticked (defaults for the rest)
    const answers = buildAnswers(ctx.questions, picks);
    if (answers) ctx.send(answers, false, e, answerMeta(ctx.questions, picks, answers));
  };
  const rowNodes = chips
    ? chips.map((o) => { const { text, mine } = splitPick(o.label);
        return h("button", { class: "qchipbtn" + (mine ? " mine" : ""), type: "button", disabled: off, "aria-label": text + (mine ? ", recommended" : ""), onclick: (e) => { e.stopPropagation(); send(e, o.label); } }, mine ? h("span", { class: "qc-star", "aria-hidden": "true" }, "\u2605") : null, text); })
    : [h("button", { class: "b y qsend", type: "button", disabled: off, onclick: (e) => { e.stopPropagation(); send(e, null); } }, busy ? "Sending" : defaultsUsed(ctx.questions, ctx.draft?.picks || {}) ? "Send defaults" : "Send answer"),
       h("button", { class: "b qopen", type: "button", disabled: answered, onclick: (e) => { e.stopPropagation(); ctx.setOpen(!open); } }, open ? "Fold" : "Answer")];
  return needBar({ h, open, pulse: ctx.pulse, held: answered, label: count, essence: first, go: ["\u25B4", "\u25BE"], setOpen: ctx.setOpen, sheetLabel: "Question", rowNodes,
    sheet: questionCard({ ...ctx, title: ctx.title || "Question", onClose: () => ctx.setOpen(false) }) });
}
