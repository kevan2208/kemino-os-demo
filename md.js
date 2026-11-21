// A small, safe Markdown renderer for assistant messages. It builds DOM nodes with createElement/textContent only:
// there is no innerHTML anywhere, so raw HTML in a message is shown as text and can never run. Links must be http(s).
const el = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) n.setAttribute(k, v === true ? "" : v);
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:" ? x.href : null; } catch { return null; } };
const link = (href, kids) => el("a", { href, target: "_blank", rel: "noopener noreferrer nofollow" }, kids);

// code | [text](url) | **bold** | __bold__ | *italic* | _italic_ | ~~strike~~ | bare url
const INLINE_SRC = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^\n]+?)\*\*|__([^\n]+?)__|~~([^\n]+?)~~|(?<![\w*])\*([^\s*](?:[^*\n]*?[^\s*])?)\*(?![\w*])|(?<!\w)_([^\s_](?:[^_\n]*?[^\s_])?)_(?!\w)|(https?:\/\/[^\s<>]*[^\s<>.,;:!?'")\]])/;

export function inline(text, depth = 0) {
  const out = [];
  let last = 0, m;
  const INLINE = new RegExp(INLINE_SRC.source, "g"); // own regex per call: nested calls must not share lastIndex
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2] != null) out.push(el("code", {}, m[2].trim() || m[2]));
    else if (m[3] != null) { const u = safeUrl(m[4]); out.push(u ? link(u, depth < 2 ? inline(m[3], depth + 1) : m[3]) : m[0]); }
    else if (m[5] != null || m[6] != null) out.push(el("strong", {}, depth < 3 ? inline(m[5] ?? m[6], depth + 1) : (m[5] ?? m[6])));
    else if (m[7] != null) out.push(el("del", {}, m[7]));
    else if (m[8] != null || m[9] != null) out.push(el("em", {}, depth < 3 ? inline(m[8] ?? m[9], depth + 1) : (m[8] ?? m[9])));
    else if (m[10] != null) { const u = safeUrl(m[10]); out.push(u ? link(u, m[10]) : m[10]); }
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
/** Text with line breaks kept as <br>, inline formatting applied. */
const lines = (arr) => arr.flatMap((l, i) => (i ? [el("br"), ...inline(l)] : inline(l)));

const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const startsBlock = (l, next) => !l.trim() || FENCE.test(l) || /^\s{0,3}#{1,6}\s/.test(l) || LIST.test(l) || /^\s{0,3}>/.test(l) || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l) || (l.includes("|") && next != null && TABLE_SEP.test(next));

function list(rows) {
  // rows: [{indent, ordered, text, start}] -> nested ul/ol by indent
  const root = { children: [], indent: -1 };
  const stack = [root];
  for (const r of rows) {
    while (stack.length > 1 && r.indent <= stack[stack.length - 1].indent) stack.pop();
    const node = { indent: r.indent, ordered: r.ordered, start: r.start, text: [r.text], children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  const build = (nodes) => {
    const first = nodes[0];
    return el(first.ordered ? "ol" : "ul", { start: first.ordered && first.start !== 1 ? first.start : null },
      nodes.map((n) => el("li", {}, lines(n.text), n.children.length ? build(n.children) : null)));
  };
  return build(root.children);
}

export function renderMarkdown(src) {
  const frag = document.createDocumentFragment();
  const L = String(src).replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < L.length) {
    const line = L[i];
    if (!line.trim()) { i++; continue; }
    let m = FENCE.exec(line);
    if (m) { // fenced code; an unclosed fence (still streaming) runs to the end
      const mark = m[1][0], len = m[1].length, body = [];
      i++;
      while (i < L.length && !(new RegExp("^\\s*" + (mark === "`" ? "`" : "~") + "{" + len + ",}\\s*$").test(L[i]))) body.push(L[i++]);
      i++;
      frag.append(el("pre", { class: "code", "data-lang": m[2] || null }, el("code", {}, body.join("\n"))));
      continue;
    }
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) { const lv = Math.min(m[1].length + 1, 6); frag.append(el("h" + lv, { class: "mh" }, inline(m[2]))); i++; continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { frag.append(el("hr")); i++; continue; }
    if (line.includes("|") && i + 1 < L.length && TABLE_SEP.test(L[i + 1]) && cells(line).length > 1) {
      const head = cells(line), al = cells(L[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : null));
      i += 2; const rows = [];
      while (i < L.length && L[i].includes("|") && L[i].trim()) rows.push(cells(L[i++]));
      const cell = (tag, t, k) => el(tag, { class: al[k] ? "al-" + al[k] : null }, inline(t || ""));
      frag.append(el("div", { class: "tablewrap" }, el("table", {}, el("thead", {}, el("tr", {}, head.map((t, k) => cell("th", t, k)))),
        el("tbody", {}, rows.map((r) => el("tr", {}, head.map((_, k) => cell("td", r[k], k))))))));
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      const q = [];
      while (i < L.length && /^\s{0,3}>/.test(L[i])) q.push(L[i++].replace(/^\s{0,3}>\s?/, ""));
      frag.append(el("blockquote", {}, renderMarkdown(q.join("\n"))));
      continue;
    }
    if ((m = LIST.exec(line))) {
      const rows = [];
      while (i < L.length) {
        const mm = LIST.exec(L[i]);
        if (mm) { rows.push({ indent: mm[1].replace(/\t/g, "    ").length, ordered: /\d/.test(mm[2]), start: parseInt(mm[2], 10) || 1, text: mm[3] }); i++; }
        else if (L[i].trim() && /^\s{2,}\S/.test(L[i]) && rows.length) { rows[rows.length - 1].text += " " + L[i++].trim(); }
        else break;
      }
      frag.append(list(rows));
      continue;
    }
    const para = [line];
    i++;
    while (i < L.length && !startsBlock(L[i], L[i + 1])) para.push(L[i++]);
    frag.append(el("p", {}, lines(para)));
  }
  return frag;
}
