import type { RewriteMode } from "@rightonclaw/types";

export function buildRewritePrompt(inputText: string, mode: RewriteMode): string {
  return [
    "Action: rewrite",
    `Rewrite mode: ${mode}`,
    "Instruction: Rewrite the selected text while preserving meaning unless the mode explicitly asks for a different emphasis.",
    "Return only the rewritten text.",
    "Do not add explanations, headings, labels, quote marks, or code fences.",
    "Keep the rewritten text close in length to the original unless a shorter version is clearly better.",
    "Preserve the original language of the selected text. Do not translate it into the system language or any other language.",
    "If the selected text mixes languages, keep the same language distribution and only improve clarity within those original languages.",
    "Preserve the original tone and formatting unless a better version requires a minimal fix.",
    "BEGIN_SELECTED_TEXT",
    truncateText(inputText),
    "END_SELECTED_TEXT"
  ].join("\n");
}

function truncateText(input: string, maxChars = 12_000): string {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars)}\n[truncated by RightOnClaw for V1 prompt safety]`;
}
