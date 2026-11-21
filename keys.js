// Desktop keyboard shortcuts: the DECISION is pure and tested here; app.js does the acting (focus, switch view, move).
// Goal (You, 7 Nov): start typing without the mouse. Typing in any other box (filter, "Other…" answers, dialogs) is never touched.
export const VIEW_KEYS = ["list", "all", "office", "map"]; // Alt+1..4

/** What the "?" overlay lists: [keys, what it does]. */
export const SHORTCUTS = [
  ["/   or   Ctrl/⌘ K", "Type without the mouse: jump into the message box"],
  ["any other letter", "In an open chat, just start typing: the box takes the key (H opens this list)"],
  ["Enter  /  Shift+Enter", "Send  /  new line"],
  ["Esc", "Leave the box (on a phone: back to the list)"],
  ["↑ ↓   or   J K", "Move between threads (in a chat, use ↑ ↓)"],
  ["Alt/⌥ 1 2 3 4", "Today · All threads · Office · Map"],
  ["Y  N  L", "Approve / decline / later, when a card is asking"],
  ["A", "Today ⇄ All threads (when no chat is open)"],
  ["Ctrl/\u2318 J", "Quick desk: instant answers about usage, next steps and running jobs (Esc closes)"],
  ["H   or   Ctrl/\u2318 /   or   ?", "This list (H needs no box focused; Ctrl/\u2318 + / works even while typing)"],
];

const DIGIT = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

/**
 * e: { key, code, metaKey, ctrlKey, altKey, shiftKey, isComposing }
 * ctx: { typing: a text box (input/textarea/select/contenteditable) has focus, dialogOpen, chatOpen, hover: a real keyboard-and-mouse device,
 *        needKind: kind of the card asking in the open chat ("permission" | "question" | null), hasSel: a thread is selected in the list }
 * Returns null (not ours) or { do, prevent?, ... }:
 *   blur | back | composer | help | desk | mode{mode} | move{dir} | open | toggleAll | answer{yes} | later
 */
export function keyAction(e, ctx) {
  if (!e || e.isComposing) return null;
  const k = String(e.key || ""), low = k.toLowerCase();
  const mod = e.metaKey || e.ctrlKey;
  // Esc: leave the box; on a phone with no box focused, back from a chat. (Dialogs close themselves.)
  if (k === "Escape") { if (ctx.typing) return { do: "blur" }; return ctx.chatOpen && !ctx.hover ? { do: "back" } : null; }
  // Ctrl/Cmd + "/" opens the list from anywhere, even while typing (no Shift needed, unlike "?").
  if (mod && !e.altKey && k === "/") return { do: "help", prevent: true };
  // Ctrl/Cmd + J toggles the quick desk from anywhere, even while typing (it is also how you leave the desk's own box).
  if (mod && !e.altKey && !e.shiftKey && low === "j") return { do: "desk", prevent: true };
  if (ctx.typing || ctx.dialogOpen) return null; // never steal keys from another box or a dialog
  // Alt/Option + 1..4: the four views (Cmd/Ctrl+digit is the browser's own tab switch and cannot be taken).
  if (e.altKey && !mod && e.code in DIGIT) return { do: "mode", mode: VIEW_KEYS[DIGIT[e.code]], prevent: true };
  if (mod && !e.altKey && low === "k") return { do: "composer", prevent: true };
  if (mod || e.altKey) return null;
  if (k === "?" || low === "h") return { do: "help", prevent: true }; // H (no Shift) wins over "start typing"; use any other letter to start a message
  if (k === "/") return { do: "composer", prevent: true };
  if (k === "ArrowDown") return { do: "move", dir: 1, prevent: true };
  if (k === "ArrowUp") return { do: "move", dir: -1, prevent: true };
  const printable = k.length === 1 && k !== " "; // Space keeps scrolling the chat
  // A card in the open chat that asks for Y / N / L keeps those three letters.
  const needKeys = ctx.needKind === "permission" ? "ynl" : ctx.needKind ? "l" : "";
  if (printable && ctx.chatOpen && ctx.hover && !needKeys.includes(low)) return { do: "composer" }; // focus only; the key then lands in the box
  if (low === "j") return { do: "move", dir: 1 };
  if (low === "k") return { do: "move", dir: -1 };
  if ((low === "y" || low === "n") && ctx.needKind === "permission") return { do: "answer", yes: low === "y", prevent: true };
  if (low === "l" && ctx.needKind) return { do: "later" };
  if (low === "a") return { do: "toggleAll" };
  if (k === "Enter" && ctx.hasSel && !ctx.chatOpen) return { do: "open" };
  return null;
}
