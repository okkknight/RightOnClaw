import type { ActionResult, SelectionContext } from "@rightonclaw/types";

import { createDeliveryPlan } from "../delivery/recommendations";
import { buildPreferredOutputLanguageInstruction } from "../prompts/language";
import { buildSelectionContextPromptBlock } from "../prompts/selection-context";

export interface ExplainResultOptions {
  title?: string;
  sessionId?: string | null;
  webuiUrl?: string | null;
}

export function buildExplainPrompt(selection: string | SelectionContext): string {
  if (typeof selection !== "string") {
    return buildObjectAwareExplainPrompt(selection);
  }

  return [
    "Action: explain",
    "Instruction: Explain the selected content clearly so the user can understand what it does, means, or implies.",
    "If helpful, first identify the content type (for example: code, error, config, prose, command output, or log).",
    "Focus on understanding and interpretation, not just compression.",
    "Do not rewrite the content unless a small quoted example is necessary to explain it.",
    "Return plain text only.",
    buildPreferredOutputLanguageInstruction(),
    "Aim for a direct, practical explanation in 3-8 short paragraphs or bullets, depending on what the content needs.",
    "BEGIN_SELECTED_TEXT",
    truncateSelection(selection),
    "END_SELECTED_TEXT"
  ].join("\n");
}

export function buildExplainResult(rawText: string, options: ExplainResultOptions = {}): ActionResult {
  return {
    title: options.title ?? "Explanation",
    content: rawText,
    content_format: "plain_text",
    session_id: options.sessionId ?? null,
    webui_url: options.webuiUrl ?? null,
    delivery: createDeliveryPlan("popup", ["clipboard", "open_webui"])
  };
}

function truncateSelection(input: string, maxChars = 12_000): string {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars)}\n[truncated by RightOnClaw for V1 prompt safety]`;
}

function buildObjectAwareExplainPrompt(context: SelectionContext): string {
  return [
    "Action: explain",
    "Instruction: Explain the selected content clearly so the user can understand what it does, means, or implies.",
    "If helpful, first identify the content type or object type.",
    "If some selected objects cannot be fully inspected, say so and explain based only on available metadata or inline text.",
    "Return plain text only.",
    buildPreferredOutputLanguageInstruction(),
    "Aim for a direct, practical explanation in 3-8 short paragraphs or bullets, depending on what the selection needs.",
    buildSelectionContextPromptBlock(context)
  ].join("\n");
}
