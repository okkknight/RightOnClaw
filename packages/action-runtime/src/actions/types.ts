import type { ActionRequest } from "@rightonclaw/types";

import type { ActionHandler } from "../types";
import type { ActionManifest } from "../manifests/types";

export type ExperimentalActionName = "summarize_fast" | "explain_fast";

export interface BuiltInActionDefinition {
  action: ActionRequest["action"];
  handler: ActionHandler;
  manifest: ActionManifest;
}

export interface ExperimentalActionDefinition {
  id: ExperimentalActionName;
  baseAction: ActionRequest["action"];
  handler: ActionHandler;
  manifest: ActionManifest;
}

export interface ActionDefinitionResolver {
  resolve(action: ActionRequest["action"]): BuiltInActionDefinition;
}

export interface ExperimentalActionDefinitionResolver {
  resolve(action: ExperimentalActionName): ExperimentalActionDefinition;
}
