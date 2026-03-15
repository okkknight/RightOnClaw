import { getSelectionItemCount, isPureTextSelectionContext, resolveSelectionContext } from "@rightonclaw/core";
import type { ActionRequest } from "@rightonclaw/types";

import { getBuiltInActionDefinitionForRunner } from "../actions/builtins";
import type { BuiltInActionDefinition } from "../actions/types";
import type { ActionRunner } from "../manifests/types";

export type ObjectAwareRoutingReason =
  | "ask_claw_uses_selected_backend_full_path"
  | "object_selection_uses_selected_backend_full_path";

export interface ObjectAwareRoutingDecision {
  definition: BuiltInActionDefinition;
  selectedRunner: ActionRunner;
  routingReason: ObjectAwareRoutingReason;
  selectionKind: ReturnType<typeof resolveSelectionContext>["kind"];
  selectionItemCount: number;
  promptPreset: string | null;
  captureMode: string | null;
}

export class ObjectAwareActionRouter {
  public route(
    request: ActionRequest,
    resolvedDefinition: BuiltInActionDefinition
  ): ObjectAwareRoutingDecision | null {
    const selectionContext = resolveSelectionContext(request);
    const fullPathRunner = resolveFullPathRunner(resolvedDefinition.manifest.runner);

    if (request.action === "ask_claw") {
      return {
        definition: getBuiltInActionDefinitionForRunner("ask_claw", fullPathRunner),
        selectedRunner: fullPathRunner,
        routingReason: "ask_claw_uses_selected_backend_full_path",
        selectionKind: selectionContext.kind,
        selectionItemCount: getSelectionItemCount(selectionContext),
        promptPreset: request.options?.prompt_preset ?? null,
        captureMode: selectionContext.capture?.mode ?? null
      };
    }

    if ((request.action === "summarize" || request.action === "explain") && !isPureTextSelectionContext(selectionContext)) {
      return {
        definition: getBuiltInActionDefinitionForRunner(request.action, fullPathRunner),
        selectedRunner: fullPathRunner,
        routingReason: "object_selection_uses_selected_backend_full_path",
        selectionKind: selectionContext.kind,
        selectionItemCount: getSelectionItemCount(selectionContext),
        promptPreset: request.options?.prompt_preset ?? null,
        captureMode: selectionContext.capture?.mode ?? null
      };
    }

    return null;
  }
}

function resolveFullPathRunner(runner: ActionRunner): ActionRunner {
  if (runner === "openclaw_responses") {
    return "openclaw";
  }

  return runner;
}
