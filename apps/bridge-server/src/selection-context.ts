import { normalizeSelectionContext } from "@rightonclaw/core";
import type { ActionRequest } from "@rightonclaw/types";

export async function withNormalizedSelectionContext(request: ActionRequest): Promise<ActionRequest> {
  return {
    ...request,
    selection_context: await normalizeSelectionContext(request)
  };
}
