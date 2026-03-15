import type { ActionRequest } from "@rightonclaw/types";

import { getBuiltInActionDefinition } from "../actions/builtins";
import type { ActionHandler } from "../types";

export function getActionHandler(action: ActionRequest["action"]): ActionHandler {
  return getBuiltInActionDefinition(action).handler;
}
