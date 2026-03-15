import type { ActionRequest, PromptPreset } from "@rightonclaw/types";

import { buildPreferredOutputLanguageInstruction } from "./language";
import { buildSelectionContextPromptBlock, getRequestSelectionContext } from "./selection-context";

export function buildAskClawPrompt(request: ActionRequest): string {
  const preset = getPromptPreset(request);
  const context = getRequestSelectionContext(request);
  const userPrompt = resolveAskClawPrompt(request);

  return [
    "Action: ask_claw",
    `Prompt preset: ${preset}`,
    "Instruction: Answer the user's request using the provided selection context.",
    "If the selected objects cannot be fully inspected, say so clearly and rely only on available metadata or inline text.",
    "Do not invent file contents or image details that were not provided.",
    "Return plain text only.",
    buildPreferredOutputLanguageInstruction(),
    buildSelectionContextPromptBlock(context),
    "User request:",
    userPrompt
  ].join("\n");
}

export function resolveAskClawPrompt(request: Pick<ActionRequest, "prompt" | "options">): string {
  const explicitPrompt = request.prompt?.trim();
  if (explicitPrompt) {
    return explicitPrompt;
  }

  switch (getPromptPreset(request)) {
    case "summarize":
      return "Summarize the selected content clearly and briefly.";
    case "explain":
      return "Explain the selected content clearly and practically.";
    case "send_to_claw":
      return "Use the selected content as the primary context and prepare a concise Claw-ready handoff.";
    case "freeform":
    default:
      return "";
  }
}

export function getPromptPreset(request: Pick<ActionRequest, "options">): PromptPreset {
  return request.options?.prompt_preset ?? "freeform";
}
