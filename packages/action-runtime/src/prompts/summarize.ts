import type { SelectionContext } from "@rightonclaw/types";

import { buildPreferredOutputLanguageInstruction } from "./language";
import { buildSelectionContextPromptBlock } from "./selection-context";

export function buildSummarizePrompt(inputText: string | SelectionContext): string {
  if (typeof inputText !== "string") {
    return buildObjectAwareSummarizePrompt(inputText);
  }

  return [
    "Action: summarize",
    "Instruction: Summarize clearly, preserve key meaning, and keep the result brief.",
    "Return plain text only.",
    buildPreferredOutputLanguageInstruction(),
    "Target 2-4 short sentences and stay under 80 words unless the source absolutely requires more.",
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

function buildObjectAwareSummarizePrompt(context: SelectionContext): string {
  return [
    "Action: summarize",
    "Instruction: Summarize the selected content clearly, preserve key meaning, and stay concise.",
    "If some selected objects cannot be fully inspected, say so and summarize based only on available metadata or inline text.",
    "Return plain text only.",
    buildPreferredOutputLanguageInstruction(),
    "Target 2-6 short sentences unless the selection needs a compact bullet list.",
    buildSelectionContextPromptBlock(context)
  ].join("\n");
}
