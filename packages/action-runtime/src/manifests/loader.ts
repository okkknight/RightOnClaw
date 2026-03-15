import type { ActionRequest } from "@rightonclaw/types";

import { getBuiltInActionDefinition } from "../actions/builtins";
import type { ActionManifest, ActionManifestLoader } from "./types";

export class BuiltInActionManifestLoader implements ActionManifestLoader {
  public load(action: ActionRequest["action"]): ActionManifest {
    return getBuiltInActionDefinition(action).manifest;
  }
}
