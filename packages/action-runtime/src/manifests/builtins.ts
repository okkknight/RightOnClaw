import type { ActionRequest } from "@rightonclaw/types";

import { getBuiltInActionDefinition } from "../actions/builtins";
import type { ActionManifest } from "./types";

export function getBuiltInActionManifest(action: ActionRequest["action"]): ActionManifest {
  return getBuiltInActionDefinition(action).manifest;
}
