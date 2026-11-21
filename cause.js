// Raw failure text from T3 turned into a plain cause (same rules as server/cause.ts; a test keeps the two in step).
// Raw text shows only inside one thread's own view.
const LIMIT = /usage limit|subscription sharing|chatgpt user|rate.?limit|quota|too many requests|usage_limit/i;
const CONNECTION = /disconnect|connection|network|timed? ?out|econn|socket|stream/i;
const STALLED = /^no new activity|stalled/i;
function provider(r) {
  if (/chatgpt|subscription sharing|codex|openai/i.test(r)) return "Codex";
  if (/anthropic|claude/i.test(r)) return "Claude";
  if (/gemini|antigravity/i.test(r)) return "Antigravity";
  if (/copilot/i.test(r)) return "Copilot";
  return null;
}
export function plainCause(reason) {
  const r = String(reason == null ? "" : reason);
  if (STALLED.test(r)) return { key: "stalled", text: "no progress" };
  if (LIMIT.test(r)) { const p = provider(r); return { key: "limit", text: p ? p + " hitting its usage limit" : "an AI hitting its usage limit" }; }
  if (CONNECTION.test(r)) return { key: "connection", text: "a dropped connection" };
  return { key: "other", text: "an error (open the thread for details)" };
}
