import { AppError, ERROR_CODES, type BackendSelectionSnapshot } from "@rightonclaw/core";
import type { ActionRequest } from "@rightonclaw/types";

import { getBuiltInActionDefinitionForRunner } from "../actions/builtins";
import type { BuiltInActionDefinition } from "../actions/types";
import type { ActionRunner } from "../manifests/types";

export interface BackendSelectionResolver {
  resolve(): Promise<BackendSelectionSnapshot>;
}

export type BackendSelectionRoutingReason =
  | "openclaw_selected"
  | "openclaw_full_path_selected"
  | "openai_compatible_selected";

export interface BackendSelectionRoutingDecision {
  definition: BuiltInActionDefinition;
  selectedBackend: BackendSelectionSnapshot["default_backend"];
  selectedRunner: ActionRunner;
  routingReason: BackendSelectionRoutingReason;
  selectionMode: BackendSelectionSnapshot["selection_mode"];
  requestedBackend: BackendSelectionSnapshot["requested_backend"];
  fastPathAvailable: boolean;
}

export interface BackendSelectionRouterOptions {
  backendSelectionResolver?: BackendSelectionResolver;
}

export class BackendSelectionRouter {
  private readonly backendSelectionResolver?: BackendSelectionResolver;

  public constructor(options: BackendSelectionRouterOptions = {}) {
    this.backendSelectionResolver = options.backendSelectionResolver;
  }

  public async route(
    request: ActionRequest,
    resolvedDefinition: BuiltInActionDefinition
  ): Promise<BackendSelectionRoutingDecision | null> {
    if (!this.backendSelectionResolver) {
      return null;
    }

    const snapshot = await this.backendSelectionResolver.resolve();

    if (!snapshot.default_backend) {
      throw new AppError({
        code: mapSelectionErrorCode(snapshot.selection_error?.code),
        message: snapshot.selection_error?.message ?? "No available backend is configured.",
        phase: "validation",
        retryable: false,
        statusCode: 503,
        details: {
          selection_mode: snapshot.selection_mode,
          requested_backend: snapshot.requested_backend,
          setup_required: snapshot.setup_required,
          backends: snapshot.backends
        }
      });
    }

    if (snapshot.default_backend === "openai_compatible") {
      if (request.action === "send_to_claw") {
        throw new AppError({
          code: ERROR_CODES.BACKEND_UNSUPPORTED_ACTION,
          message: "send_to_claw requires OpenClaw in this MVP.",
          phase: "validation",
          retryable: false,
          statusCode: 409,
          details: {
            action: request.action,
            backend_id: snapshot.default_backend,
            supported_backend: "openclaw"
          }
        });
      }

      const definition = getBuiltInActionDefinitionForRunner(request.action, "model");
      return {
        definition,
        selectedBackend: snapshot.default_backend,
        selectedRunner: definition.manifest.runner,
        routingReason: "openai_compatible_selected",
        selectionMode: snapshot.selection_mode,
        requestedBackend: snapshot.requested_backend,
        fastPathAvailable: false
      };
    }

    const runner =
      resolvedDefinition.manifest.runner === "openclaw_responses" && !snapshot.fast_path_available
        ? "openclaw"
        : resolvedDefinition.manifest.runner;
    const definition =
      runner === resolvedDefinition.manifest.runner
        ? resolvedDefinition
        : getBuiltInActionDefinitionForRunner(request.action, runner);

    return {
      definition,
      selectedBackend: snapshot.default_backend,
      selectedRunner: definition.manifest.runner,
      routingReason: definition.manifest.runner === "openclaw_responses" ? "openclaw_selected" : "openclaw_full_path_selected",
      selectionMode: snapshot.selection_mode,
      requestedBackend: snapshot.requested_backend,
      fastPathAvailable: snapshot.fast_path_available
    };
  }
}

function mapSelectionErrorCode(code: string | undefined): typeof ERROR_CODES[keyof typeof ERROR_CODES] {
  if (code === ERROR_CODES.BACKEND_UNAVAILABLE) {
    return ERROR_CODES.BACKEND_UNAVAILABLE;
  }

  return ERROR_CODES.BACKEND_SETUP_REQUIRED;
}
