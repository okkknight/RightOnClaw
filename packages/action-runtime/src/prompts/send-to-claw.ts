import type { ActionRequest } from "@rightonclaw/types";

import { buildSelectionContextPromptBlock, getRequestSelectionContext } from "./selection-context";

export function buildSendToClawPrompt(request: ActionRequest): string {
  const context = getRequestSelectionContext(request);

  return [
    "Action: send_to_claw",
    "Instruction:",
    "The user invoked Send to Claw from an OS context menu. Use the provided selection as the primary context.",
    `Source platform: ${request.source.platform}`,
    buildSelectionContextPromptBlock(context)
  ].join("\n");
}
