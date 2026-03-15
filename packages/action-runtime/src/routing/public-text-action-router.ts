import { isPureTextSelectionContext, resolveSelectionContext } from "@rightonclaw/core";
import type { CredentialProviderRegistry } from "@rightonclaw/credential-layer";
import type { ActionRequest } from "@rightonclaw/types";

import { getBuiltInActionDefinition } from "../actions/builtins";
import type { BuiltInActionDefinition } from "../actions/types";
import type { ActionRunner } from "../manifests/types";

export type PublicTextActionRoutingReason =
  | "fast_path_disabled"
  | "no_fast_path_credential"
  | "input_too_large"
  | "object_selection_requires_openclaw"
  | "openclaw_responses_selected";

export interface PublicTextActionRoutingDecision {
  definition: BuiltInActionDefinition;
  requestedFastPath: boolean;
  selectedRunner: ActionRunner;
  routingReason: PublicTextActionRoutingReason;
  credentialProvider: string | null;
  inputTextLength: number | null;
}

export interface PublicTextActionRouterOptions {
  credentialProviderRegistry?: Pick<CredentialProviderRegistry, "resolve">;
  maxInputLength?: number;
}

const DEFAULT_FAST_PATH_MAX_INPUT_LENGTH = 1200;

export class PublicTextActionRouter {
  private readonly credentialProviderRegistry?: Pick<CredentialProviderRegistry, "resolve">;
  private readonly maxInputLength: number;

  public constructor(options: PublicTextActionRouterOptions = {}) {
    this.credentialProviderRegistry = options.credentialProviderRegistry;
    this.maxInputLength = options.maxInputLength ?? DEFAULT_FAST_PATH_MAX_INPUT_LENGTH;
  }

  public async route(
    request: ActionRequest,
    resolvedDefinition: BuiltInActionDefinition
  ): Promise<PublicTextActionRoutingDecision | null> {
    if (!isSupportedPublicTextAction(request, resolvedDefinition)) {
      return null;
    }

    const requestedFastPath = resolvedDefinition.manifest.runner === "openclaw_responses";
    const selectionContext = resolveSelectionContext(request);
    const inputTextLength = selectionContext.text?.char_count ?? (request.selection.kind === "text" ? request.selection.text.length : null);

    if (!requestedFastPath) {
      return {
        definition: resolvedDefinition,
        requestedFastPath,
        selectedRunner: resolvedDefinition.manifest.runner,
        routingReason: "fast_path_disabled",
        credentialProvider: null,
        inputTextLength
      };
    }

    if (!isPureTextSelectionContext(selectionContext)) {
      return this.buildFallbackDecision(request, resolvedDefinition, "object_selection_requires_openclaw", {
        inputTextLength
      });
    }

    let credentialProvider: string | null = null;

    try {
      const credential = await this.credentialProviderRegistry?.resolve({
        executor: "openclaw",
        target: "openclaw",
        purpose: "generation"
      });

      credentialProvider = credential?.provider ?? null;
    } catch {
      return this.buildFallbackDecision(request, resolvedDefinition, "no_fast_path_credential", {
        inputTextLength
      });
    }

    if (!credentialProvider) {
      return this.buildFallbackDecision(request, resolvedDefinition, "no_fast_path_credential", {
        inputTextLength
      });
    }

    if (credentialProvider !== "shared" && credentialProvider !== "chatgpt_auth") {
      return this.buildFallbackDecision(request, resolvedDefinition, "no_fast_path_credential", {
        credentialProvider,
        inputTextLength
      });
    }

    if (typeof inputTextLength === "number" && inputTextLength > this.maxInputLength) {
      return this.buildFallbackDecision(request, resolvedDefinition, "input_too_large", {
        credentialProvider,
        inputTextLength
      });
    }

    return {
      definition: resolvedDefinition,
      requestedFastPath,
      selectedRunner: "openclaw_responses",
      routingReason: "openclaw_responses_selected",
      credentialProvider,
      inputTextLength
    };
  }

  private buildFallbackDecision(
    request: ActionRequest,
    resolvedDefinition: BuiltInActionDefinition,
    routingReason: Exclude<PublicTextActionRoutingReason, "fast_path_disabled" | "openclaw_responses_selected">,
    input: {
      credentialProvider?: string | null;
      inputTextLength: number | null;
    }
  ): PublicTextActionRoutingDecision {
    return {
      definition: getBuiltInActionDefinition(request.action),
      requestedFastPath: resolvedDefinition.manifest.runner === "openclaw_responses",
      selectedRunner: "openclaw",
      routingReason,
      credentialProvider: input.credentialProvider ?? null,
      inputTextLength: input.inputTextLength
    };
  }
}

function isSupportedPublicTextAction(request: ActionRequest, definition: BuiltInActionDefinition): boolean {
  return (
    (request.action === "summarize" || request.action === "explain") &&
    definition.manifest.id === request.action
  );
}
