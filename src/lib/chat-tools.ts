// AI chat "Tools" (website and the AI app): Create PDF and Highlight. The plain-logic parts, tested in scripts/chat-tools.test.mjs.

/** The answer's inline marks: **bold**, ==highlight== and `code`. ==x== only when it hugs its words, so "a == b" in a sum
 * is left alone. Used by the chat screen and the PDF (the app's `rich` in flutter/lib/screens/ai_chat.dart has the same). */
export const INLINE = /(\*\*[^*]+\*\*|==[^=\s](?:(?:(?!==).)*?[^=\s])?==|`[^`]+`)/;

/** The tools a student switched on for a chat. */
export type ChatTools = { pdf?: true; highlight?: true };

/** `tools` as sent: missing is none; anything but { pdf?: boolean, highlight?: boolean } is refused (null). */
export function chatTools(raw: unknown): ChatTools | null {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: ChatTools = {};
  for (const [k, v] of Object.entries(raw)) {
    if ((k !== "pdf" && k !== "highlight") || typeof v !== "boolean") return null;
    if (v) out[k] = true;
  }
  return out;
}

/** The lines the tools add for the model (the wording lives here on the server, never in the apps). */
export const toolsRule = (tools: ChatTools) =>
  [
    tools.pdf
      ? "The student turned on Create PDF: this answer becomes a PDF they download for notes, a worksheet or a summary. Write it as a complete, well-structured document: a title line starting with '# ', then sections with '## ' headings, short paragraphs, lists ('- ' or '1. ') and **bold** key terms. No tables. No chatty opening or closing lines: only the document."
      : "",
    tools.highlight
      ? "The student turned on Highlight: wrap the key terms, definitions, formulas and exam points of your answer in double equals signs, like ==Newton's second law== or ==F = ma==, as a highlighter pen would. Mark only the important parts (a few per paragraph), never whole paragraphs, never inside code blocks, and don't put ** inside the marks."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

/** A PDF sent to be highlighted: at most 8 MB (under the 10 MB a request may carry through the proxy) and 30 pages. */
export const HIGHLIGHT_MAX_BYTES = 8 * 1024 * 1024;
export const HIGHLIGHT_MAX_PAGES = 30;

/** Why these bytes can't be highlighted ("empty", "too large", "not pdf"), or null when they look like a PDF. */
export function highlightInput(bytes: Uint8Array): "empty" | "too large" | "not pdf" | null {
  if (!bytes.byteLength) return "empty";
  if (bytes.byteLength > HIGHLIGHT_MAX_BYTES) return "too large";
  return new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-") ? null : "not pdf"; // the header may follow a little junk
}
