// Bills section of the Life screen (mock A: one bill in front, the rest below with a tick switch). You ticks bills off himself:
// nothing here talks to a bank. All text goes in as text nodes; no innerHTML, no inline style or handler (CSP).
import { rs, dayText, whenText, urgency, groupBills, summaryText, formBody, billsLine, todayMU } from "./bills-core.js";

/** Today's quiet line source: the bills list, or null when it can't be read. */
export async function loadBills(get) { const r = await get("/api/bills"); return r.ok ? { bills: r.j.bills || [], today: r.j.today || "" } : null; }

/** deps: { h, post, say, redraw }. Returns { load(get), node(), openAdd(e) }. */
export function createBills({ h, post, say, redraw }) {
  let data = null, err = "", paying = {}, undo = null, lastGet = null;
  const clearUndo = () => { if (undo) clearTimeout(undo.t); undo = null; };
  const setUndo = (text, fn) => { clearUndo(); undo = { text, fn, t: setTimeout(() => { undo = null; redraw(); }, 15000) }; };
  const adopt = (j) => { data = { bills: j.bills || [], today: j.today || data?.today || "" }; };

  async function load(get) { lastGet = get; try { const d = await loadBills(get); if (d) { data = d; err = ""; } else err = "Bills could not be read."; } catch (e) { err = e.message; } }

  async function act(op, id, e, after, extra) {
    try { const j = await post("/api/bills/" + op, { id, ...extra }, e); adopt(j); after?.(j); }
    catch (x) { say(x.message); if (/Already updated/.test(x.message) && lastGet) await load(lastGet); }
    delete paying[id]; redraw();
  }
  function pay(b, e) {
    if (paying[b.id]) return; // a request for this bill is already out: ignore the second tap
    paying[b.id] = true; redraw(); // instant: the row ticks at once, the server follows
    act("paid", b.id, e, () => { say(""); setUndo(b.name + " marked paid.", (ev) => act("unpaid", b.id, ev, () => clearUndo())); redraw(); }, { due: b.due });
  }
  const unpay = (b, e) => { if (paying[b.id]) return; paying[b.id] = "off"; redraw(); act("unpaid", b.id, e, () => say("Back on the list.")); };
  async function remove(b, e) {
    try { const j = await post("/api/bills/delete", { id: b.id }, e); adopt(j); setUndo(b.name + " deleted.", async (ev) => { try { adopt(await post("/api/bills/restore", { id: b.id }, ev)); clearUndo(); } catch (x) { say(x.message); } redraw(); }); } catch (x) { say(x.message); }
    closeSheet(); redraw();
  }

  // ---- add / edit sheet ----
  let sheet = null, sheetOpener = null;
  function closeSheet() { if (!sheet) return; const s = sheet; sheet = null; s.wrap.classList.remove("in"); removeEventListener("keydown", s.onKey, true); setTimeout(() => s.wrap.remove(), 200); (sheetOpener?.isConnected ? sheetOpener : document.querySelector("[data-bills-add]"))?.focus?.({ preventScroll: true }); }
  function openSheet(bill, opener) {
    if (sheet) return;
    sheetOpener = opener || document.activeElement;
    const f = { name: bill?.name || "", amount: bill?.amount != null ? String(bill.amount) : "", due: bill?.due || data?.today || todayMU(), repeat: bill?.repeat || "none" };
    const msg = h("p", { class: "bl-msg", role: "alert", "aria-live": "polite" });
    const name = h("input", { class: "bl-in", type: "text", maxlength: "60", value: f.name, placeholder: "Electricity", autocomplete: "off", "aria-label": "Name", id: "bl-name", oninput: (e) => { f.name = e.target.value; } });
    const amount = h("input", { class: "bl-in", type: "text", inputmode: "decimal", value: f.amount, placeholder: "Optional", autocomplete: "off", "aria-label": "Amount in Rs", id: "bl-amount", oninput: (e) => { f.amount = e.target.value; } });
    const due = h("input", { class: "bl-in", type: "date", value: f.due, "aria-label": "Due date", id: "bl-due", oninput: (e) => { f.due = e.target.value; } });
    const seg = (v, t) => h("button", { class: "bl-seg" + (f.repeat === v ? " on" : ""), type: "button", role: "radio", "aria-checked": String(f.repeat === v), "data-v": v, onclick: () => { f.repeat = v; for (const b of segs.querySelectorAll(".bl-seg")) { const on = b.dataset.v === v; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); } } }, t);
    const segs = h("div", { class: "bl-segs", role: "radiogroup", "aria-label": "Repeat" }, seg("none", "Just once"), seg("monthly", "Every month"));
    const saveBtn = h("button", { class: "lf-chip sug bl-save", type: "submit" }, bill ? "Save" : "Add bill");
    const save = async (e) => {
      e.preventDefault();
      if (save.busy) return;
      const r = formBody(f); if (r.error) { msg.textContent = r.error; return; }
      save.busy = true; msg.textContent = ""; saveBtn.disabled = true;
      try { const j = await post(bill ? "/api/bills/edit" : "/api/bills/add", bill ? { ...r.body, id: bill.id } : r.body, e); adopt(j); closeSheet(); say(bill ? "Saved." : "Added."); redraw(); } catch (x) { msg.textContent = x.message; }
      save.busy = false; saveBtn.disabled = false;
    };
    const field = (label, id, ctl) => h("label", { class: "bl-f", for: id }, h("span", {}, label), ctl);
    const form = h("form", { class: "bl-form", onsubmit: save, novalidate: "" },
      field("Name", "bl-name", name), field("Amount (Rs)", "bl-amount", amount), field("Due date", "bl-due", due), h("div", { class: "bl-f" }, h("span", {}, "Repeat"), segs), msg,
      h("div", { class: "bl-btns" }, saveBtn, h("button", { class: "lf-chip", type: "button", onclick: closeSheet }, "Cancel"),
        bill ? h("button", { class: "lf-chip bl-del", type: "button", onclick: (e) => remove(bill, e) }, "Delete") : null));
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeSheet(); return; }
      if (e.key !== "Tab") return;
      const els = [...wrap.querySelectorAll("button, input, select, textarea, [href]")].filter((x) => !x.disabled && x.offsetParent !== null || x === document.activeElement);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1], a = document.activeElement;
      if (!wrap.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    const wrap = h("div", { class: "np-wrap bl-wrap", role: "dialog", "aria-modal": "true", "aria-label": bill ? "Edit bill" : "Add a bill", onclick: (e) => { if (e.target === wrap) closeSheet(); } },
      h("div", { class: "np-card bl-card" }, h("div", { class: "np-head" }, h("strong", {}, bill ? "Edit bill" : "Add a bill"), h("button", { class: "np-x", type: "button", "aria-label": "Close", onclick: closeSheet }, "×")), form));
    sheet = { wrap, onKey };
    addEventListener("keydown", onKey, true);
    document.body.append(wrap);
    requestAnimationFrame(() => { wrap.classList.add("in"); (bill ? amount : name).focus({ preventScroll: true }); });
  }

  // ---- the section ----
  const tag = (b) => h("span", { class: "bl-due " + urgency(b) }, whenText(b.days));
  function row(b) {
    const state = paying[b.id], paid = state === "off" ? false : b.paid || state === true;
    return h("li", { class: "bl-row" + (paid ? " paid" : ""), "data-bill": b.id },
      h("button", { class: "bl-main", type: "button", "aria-label": "Edit " + b.name, onclick: (e) => openSheet(b, e.currentTarget) },
        h("span", { class: "bl-n" }, b.name),
        h("span", { class: "bl-d" }, dayText(b.due) + (b.repeat === "monthly" ? " · every month" : "") + (b.paid ? " · paid " + dayText(b.paidAt) : b.overdue ? " · " + whenText(b.days) : ""))),
      h("span", { class: "bl-amt" }, b.amount != null ? rs(b.amount) : ""),
      h("button", { class: "bl-tg" + (paid ? " on" : ""), type: "button", role: "switch", "aria-checked": String(paid), "aria-label": (paid ? "Paid: " : "Mark paid: ") + b.name, "data-bill": b.id, onclick: (e) => (b.paid ? unpay(b, e) : pay(b, e)) }, h("i", {})));
  }
  function nextCard(b) {
    const ticking = !!paying[b.id];
    return h("div", { class: "bl-next", "data-next": b.id },
      h("div", { class: "bl-nt" }, h("span", { class: "bl-due " + urgency(b) }, b.overdue ? "Late · " + whenText(b.days).replace(" late", "") : "Next · " + (b.days > 1 ? "due " : "") + whenText(b.days)), h("span", { class: "bl-nd" }, dayText(b.due) + (b.repeat === "monthly" ? " · every month" : ""))),
      h("div", { class: "bl-nname" }, b.name),
      b.amount != null ? h("div", { class: "bl-fig" }, rs(b.amount)) : null,
      h("div", { class: "bl-nb" }, h("button", { class: "lf-chip sug bl-pay", type: "button", disabled: ticking ? "" : null, onclick: (e) => pay(b, e) }, ticking ? "Paid ✓" : "Mark paid"), h("button", { class: "lf-chip", type: "button", onclick: (e) => openSheet(b, e.currentTarget) }, "Edit")));
  }
  function node() {
    const add = h("button", { class: "lf-chip bl-add", type: "button", "data-bills-add": "", onclick: (e) => openSheet(null, e.currentTarget) }, "+ Add");
    const head = (g) => h("div", { class: "bl-head" }, h("h3", {}, "Bills"), g ? h("span", { class: "bl-sum" }, summaryText(g)) : null, add);
    if (!data) return h("section", { class: "lf-sec lf-sec-bills", "data-bills": "" }, head(null), h("p", { class: err ? "lf-status err" : "lf-status" }, err || "Loading…"));
    const g = groupBills(data.bills);
    const undoBar = undo ? h("div", { class: "bl-undo", role: "status" }, h("span", {}, undo.text), h("button", { class: "lf-linkbtn", type: "button", onclick: (e) => undo.fn(e) }, "Undo")) : null;
    return h("section", { class: "lf-sec lf-sec-bills", "data-bills": "" }, head(g), undoBar,
      !data.bills.length ? h("p", { class: "lf-empty" }, "No bills yet. Add the first one and tick it off when you pay it.") : null,
      g.next ? nextCard(g.next) : null,
      g.after.length ? [h("div", { class: "bl-sec" }, "After that", h("span", { class: "lf-n" }, g.after.length)), h("ul", { class: "lf-list bl-list" }, g.after.map(row))] : null,
      g.paid.length ? [h("div", { class: "bl-sec" }, "Paid", h("span", { class: "lf-n" }, g.paid.length)), h("ul", { class: "lf-list bl-list" }, g.paid.slice(0, 8).map(row))] : null);
  }
  return { load, node, openAdd: (e) => openSheet(null, e?.currentTarget) };
}

/** The quiet Today line ("Rent is due in 3 days · 2 more this week"); hidden when no bill is open. Refreshes at most every 5 minutes. Tap opens Life. */
export function createTodayLine({ h, get, open, rerender }) {
  let line = "", at = 0, busy = false;
  return {
    /** Forget the cache so the next draw re-reads (Life closed: a bill may have been ticked). */
    stale() { at = 0; },
    node() {
      if (!busy && Date.now() - at > 5 * 60_000) {
        busy = true;
        loadBills(get).then((d) => { const l = d ? billsLine(d.bills) : ""; const changed = l !== line; line = l; at = Date.now(); busy = false; if (changed) rerender(); }).catch(() => { busy = false; at = Date.now(); });
      }
      return line ? h("button", { class: "lifeline billsline", type: "button", "data-act": "bills-line", title: "Open bills", onclick: open }, h("span", {}, line), h("span", { class: "lifeline-go", "aria-hidden": "true" }, "›")) : null;
    },
  };
}
