import { normalizeError, type Logger } from "@rightonclaw/core";
import type { CredentialProviderRegistry } from "@rightonclaw/credential-layer";
import type { ActionRequest } from "@rightonclaw/types";

import { BuiltInActionDefinitionResolver, BuiltInExperimentalActionDefinitionResolver } from "./actions/resolver";
import type {
  ActionDefinitionResolver,
  BuiltInActionDefinition,
  ExperimentalActionDefinition,
  ExperimentalActionDefinitionResolver,
  ExperimentalActionName
} from "./actions/types";
import {
  BackendSelectionRouter,
  type BackendSelectionRoutingDecision
} from "./routing/backend-selection-router";
import { ObjectAwareActionRouter, type ObjectAwareRoutingDecision } from "./routing/object-aware-action-router";
import { PublicTextActionRouter, type PublicTextActionRoutingDecision } from "./routing/public-text-action-router";
import type { DispatchActionResult } from "./types";
import { ExecutorRegistry } from "./executors/registry";

export interface ActionRuntimeOptions {
  executorRegistry: ExecutorRegistry;
  definitionResolver?: ActionDefinitionResolver;
  experimentalDefinitionResolver?: ExperimentalActionDefinitionResolver;
  backendSelectionRouter?: BackendSelectionRouter;
  credentialProviderRegistry?: Pick<CredentialProviderRegistry, "resolve">;
  fastPathMaxInputLength?: number;
  objectAwareActionRouter?: ObjectAwareActionRouter;
  publicTextActionRouter?: PublicTextActionRouter;
  logger?: Logger;
}

export class ActionRuntime {
  private readonly executorRegistry: ExecutorRegistry;
  private readonly definitionResolver: ActionDefinitionResolver;
  private readonly experimentalDefinitionResolver: ExperimentalActionDefinitionResolver;
  private readonly backendSelectionRouter: BackendSelectionRouter;
  private readonly objectAwareActionRouter: ObjectAwareActionRouter;
  private readonly publicTextActionRouter: PublicTextActionRouter;
  private readonly logger?: Logger;

  public constructor(options: ActionRuntimeOptions) {
    this.executorRegistry = options.executorRegistry;
    this.definitionResolver = options.definitionResolver ?? new BuiltInActionDefinitionResolver();
    this.experimentalDefinitionResolver =
      options.experimentalDefinitionResolver ?? new BuiltInExperimentalActionDefinitionResolver();
    this.backendSelectionRouter = options.backendSelectionRouter ?? new BackendSelectionRouter();
    this.objectAwareActionRouter = options.objectAwareActionRouter ?? new ObjectAwareActionRouter();
    this.publicTextActionRouter =
      options.publicTextActionRouter ??
      new PublicTextActionRouter({
        credentialProviderRegistry: options.credentialProviderRegistry,
        maxInputLength: options.fastPathMaxInputLength
      });
    this.logger = options.logger;
  }

  public async execute(request: ActionRequest): Promise<DispatchActionResult> {
    const definition = await this.resolveDefinition(request);
    return this.executeDefinition(definition, request);
  }

  public async executeExperimental(action: ExperimentalActionName, request: ActionRequest): Promise<DispatchActionResult> {
    const definition = this.experimentalDefinitionResolver.resolve(action);
    return this.executeDefinition(definition, request);
  }

  private async resolveDefinition(request: ActionRequest): Promise<BuiltInActionDefinition> {
    const resolvedDefinition = this.definitionResolver.resolve(request.action);
    const backendSelectionRoutingDecision = await this.backendSelectionRouter.route(request, resolvedDefinition);
    const backendSelectedDefinition = backendSelectionRoutingDecision?.definition ?? resolvedDefinition;

    if (backendSelectionRoutingDecision) {
      this.logBackendSelectionRouting(request, backendSelectionRoutingDecision);
    }

    const objectAwareRoutingDecision = this.objectAwareActionRouter.route(request, backendSelectedDefinition);

    if (objectAwareRoutingDecision) {
      this.logObjectAwareActionRouting(request, objectAwareRoutingDecision);
      return objectAwareRoutingDecision.definition;
    }

    const routingDecision = await this.publicTextActionRouter.route(request, backendSelectedDefinition);

    if (routingDecision) {
      this.logPublicTextActionRouting(request, routingDecision);
      return routingDecision.definition;
    }

    return backendSelectedDefinition;
  }

  private async executeDefinition(
    definition: BuiltInActionDefinition | ExperimentalActionDefinition,
    request: ActionRequest
  ): Promise<DispatchActionResult> {
    const startedAt = Date.now();
    const { handler, manifest } = definition;
    const observationMessage = getRuntimeObservationMessage(request.action, manifest.id);
    const inputTextLength = request.selection.kind === "text" ? request.selection.text.length : null;

    try {
      handler.validate(request);
      const executor = this.executorRegistry.get(manifest.runner);
      const execution = await executor.execute({
        request,
        manifest,
        logger: this.logger
      });
      const raw = handler.buildRawResult(execution, request, this.logger);
      const result = handler.buildResult(raw, request);
      result.delivery = handler.recommendedDelivery(result, request, raw);

      if (observationMessage) {
        this.logger?.info(observationMessage, {
          action_id: request.action,
          runner_used: manifest.runner,
          credential_provider: execution.credentialProvider ?? null,
          input_text_length: inputTextLength,
          success: true,
          total_duration_ms: Date.now() - startedAt
        });
      }

      return {
        result,
        meta: raw.meta ?? {}
      };
    } catch (error) {
      if (observationMessage) {
        const normalized = normalizeError(error);
        this.logger?.error(observationMessage, {
          action_id: request.action,
          runner_used: manifest.runner,
          credential_provider: null,
          input_text_length: inputTextLength,
          success: false,
          total_duration_ms: Date.now() - startedAt,
          error_code: normalized.code
        });
      }

      throw error;
    }
  }

  private logPublicTextActionRouting(
    request: ActionRequest,
    routingDecision: PublicTextActionRoutingDecision
  ): void {
    this.logger?.info("public_text_action_routing", {
      action_id: request.action,
      requested_fast_path: routingDecision.requestedFastPath,
      selected_runner: routingDecision.selectedRunner,
      routing_reason: routingDecision.routingReason,
      credential_provider: routingDecision.credentialProvider,
      input_text_length: routingDecision.inputTextLength
    });
  }

  private logBackendSelectionRouting(
    request: ActionRequest,
    routingDecision: BackendSelectionRoutingDecision
  ): void {
    this.logger?.info("backend_selection_routing", {
      action_id: request.action,
      selected_backend: routingDecision.selectedBackend,
      selected_runner: routingDecision.selectedRunner,
      routing_reason: routingDecision.routingReason,
      selection_mode: routingDecision.selectionMode,
      requested_backend: routingDecision.requestedBackend,
      fast_path_available: routingDecision.fastPathAvailable
    });
  }

  private logObjectAwareActionRouting(request: ActionRequest, routingDecision: ObjectAwareRoutingDecision): void {
    this.logger?.info("object_aware_action_routing", {
      action_id: request.action,
      selected_runner: routingDecision.selectedRunner,
      object_aware_routing_reason: routingDecision.routingReason,
      selection_kind: routingDecision.selectionKind,
      selection_item_count: routingDecision.selectionItemCount,
      prompt_preset: routingDecision.promptPreset,
      capture_mode: routingDecision.captureMode
    });
  }
}

function getRuntimeObservationMessage(
  action: ActionRequest["action"],
  manifestId: string
): "summarize_runtime_observation" | "explain_runtime_observation" | null {
  if (action === "summarize" && manifestId === "summarize") {
    return "summarize_runtime_observation";
  }

  if (action === "explain" && manifestId === "explain") {
    return "explain_runtime_observation";
  }

  return null;
}
