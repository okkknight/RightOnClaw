import { AppError, ERROR_CODES, assertTextSelection } from "@rightonclaw/core";
import type { ActionRequest } from "@rightonclaw/types";

import { buildExplainPrompt } from "./explain-helpers";
import { askClawHandler } from "../handlers/ask-claw";
import { explainHandler } from "../handlers/explain";
import { rewriteHandler } from "../handlers/rewrite";
import { sendToClawHandler } from "../handlers/send-to-claw";
import { summarizeHandler } from "../handlers/summarize";
import { buildAskClawPrompt } from "../prompts/ask-claw";
import { buildRewritePrompt } from "../prompts/rewrite";
import { getRequestSelectionContext } from "../prompts/selection-context";
import { buildSendToClawPrompt } from "../prompts/send-to-claw";
import { buildSummarizePrompt } from "../prompts/summarize";
import type { ActionRunner } from "../manifests/types";
import type { BuiltInActionDefinition, ExperimentalActionDefinition, ExperimentalActionName } from "./types";

export interface BuiltInActionDefinitionOptions {
  summarizeFastPathEnabled?: boolean;
  explainFastPathEnabled?: boolean;
}

const builtInActionDefinitions = new Map<ActionRequest["action"], BuiltInActionDefinition>([
  [
    "send_to_claw",
    {
      action: "send_to_claw",
      handler: sendToClawHandler,
      manifest: {
        id: "send_to_claw",
        title: "Send to Claw",
        runner: "openclaw",
        sessionTitle: "Send to Claw",
        responseMode: "message_only",
        buildPrompt(request) {
          return buildSendToClawPrompt(request);
        }
      }
    }
  ],
  [
    "ask_claw",
    {
      action: "ask_claw",
      handler: askClawHandler,
      manifest: {
        id: "ask_claw",
        title: "Ask Claw",
        runner: "openclaw",
        sessionTitle: "Ask Claw",
        responseMode: "generate_text",
        buildPrompt(request) {
          return buildAskClawPrompt(request);
        }
      }
    }
  ],
  [
    "summarize",
    {
      action: "summarize",
      handler: summarizeHandler,
      manifest: {
        id: "summarize",
        title: "Summary",
        runner: "openclaw",
        sessionTitle: "Summarize",
        responseMode: "generate_text",
        buildPrompt(request) {
          return buildSummarizePrompt(getRequestSelectionContext(request));
        }
      }
    }
  ],
  [
    "rewrite",
    {
      action: "rewrite",
      handler: rewriteHandler,
      manifest: {
        id: "rewrite",
        title: "Rewrite",
        runner: "openclaw",
        sessionTitle: "Rewrite",
        responseMode: "generate_text",
        buildPrompt(request) {
          assertTextSelection(request.selection);
          return buildRewritePrompt(request.selection.text, request.options?.rewrite_mode ?? "rewrite");
        }
      }
    }
  ],
  [
    "explain",
    {
      action: "explain",
      handler: explainHandler,
      manifest: {
        id: "explain",
        title: "Explain",
        runner: "openclaw",
        sessionTitle: "Explain",
        responseMode: "generate_text",
        buildPrompt(request) {
          return buildExplainPrompt(getRequestSelectionContext(request));
        }
      }
    }
  ]
]);

const experimentalActionDefinitions = new Map<ExperimentalActionName, ExperimentalActionDefinition>([
  [
    "summarize_fast",
    {
      id: "summarize_fast",
      baseAction: "summarize",
      handler: summarizeHandler,
      manifest: {
        id: "summarize_fast",
        title: "Summary",
        runner: "model",
        sessionTitle: "Summarize Fast",
        responseMode: "generate_text",
        maxOutputTokens: 96,
        buildPrompt(request) {
          assertTextSelection(request.selection);
          return buildSummarizePrompt(request.selection.text);
        }
      }
    }
  ],
  [
    "explain_fast",
    {
      id: "explain_fast",
      baseAction: "explain",
      handler: explainHandler,
      manifest: {
        id: "explain_fast",
        title: "Explain (Fast)",
        runner: "model",
        sessionTitle: "Explain Fast",
        responseMode: "generate_text",
        maxOutputTokens: 192,
        buildPrompt(request) {
          assertTextSelection(request.selection);
          return buildExplainPrompt(request.selection.text);
        }
      }
    }
  ]
]);

export function getBuiltInActionDefinition(
  action: ActionRequest["action"],
  options: BuiltInActionDefinitionOptions = {}
): BuiltInActionDefinition {
  if (action === "summarize" && options.summarizeFastPathEnabled) {
    return buildOpenClawResponsesSummarizeActionDefinition();
  }

  if (action === "explain" && options.explainFastPathEnabled) {
    return buildOpenClawResponsesExplainActionDefinition();
  }

  const definition = builtInActionDefinitions.get(action);

  if (!definition) {
    throw new AppError({
      code: ERROR_CODES.UNSUPPORTED_ACTION,
      message: `Unsupported action ${action}.`,
      phase: "validation",
      retryable: false,
      statusCode: 400,
      details: {
        action
      }
    });
  }

  return definition;
}

export function getBuiltInActionDefinitions(options: BuiltInActionDefinitionOptions = {}): BuiltInActionDefinition[] {
  return [...builtInActionDefinitions.values()].map((definition) => {
    if (definition.action === "summarize" && options.summarizeFastPathEnabled) {
      return buildOpenClawResponsesSummarizeActionDefinition();
    }

    if (definition.action === "explain" && options.explainFastPathEnabled) {
      return buildOpenClawResponsesExplainActionDefinition();
    }

    return definition;
  });
}

export function getExperimentalActionDefinition(action: ExperimentalActionName): ExperimentalActionDefinition {
  const definition = experimentalActionDefinitions.get(action);

  if (!definition) {
    throw new AppError({
      code: ERROR_CODES.UNSUPPORTED_ACTION,
      message: `Unsupported experimental action ${action}.`,
      phase: "validation",
      retryable: false,
      statusCode: 400,
      details: {
        action
      }
    });
  }

  return definition;
}

export function getExperimentalActionDefinitions(): ExperimentalActionDefinition[] {
  return [...experimentalActionDefinitions.values()];
}

export function getBuiltInActionDefinitionForRunner(
  action: ActionRequest["action"],
  runner: ActionRunner
): BuiltInActionDefinition {
  if (runner === "openclaw") {
    return getBuiltInActionDefinition(action);
  }

  if (runner === "openclaw_responses") {
    if (action === "summarize") {
      return buildOpenClawResponsesSummarizeActionDefinition();
    }

    if (action === "explain") {
      return buildOpenClawResponsesExplainActionDefinition();
    }
  }

  if (runner === "model") {
    return buildModelActionDefinition(action);
  }

  throw new AppError({
    code: ERROR_CODES.UNSUPPORTED_ACTION,
    message: `Unsupported runner ${runner} for action ${action}.`,
    phase: "validation",
    retryable: false,
    statusCode: 400,
    details: {
      action,
      runner
    }
  });
}

function buildOpenClawResponsesSummarizeActionDefinition(): BuiltInActionDefinition {
  return {
    action: "summarize",
    handler: summarizeHandler,
    manifest: {
      id: "summarize",
      title: "Summary",
      runner: "openclaw_responses",
      sessionTitle: "Summarize",
      responseMode: "generate_text",
      maxOutputTokens: 96,
      buildPrompt(request) {
        return buildSummarizePrompt(getRequestSelectionContext(request));
      }
    }
  };
}

function buildOpenClawResponsesExplainActionDefinition(): BuiltInActionDefinition {
  return {
    action: "explain",
    handler: explainHandler,
    manifest: {
      id: "explain",
      title: "Explain",
      runner: "openclaw_responses",
      sessionTitle: "Explain",
      responseMode: "generate_text",
      maxOutputTokens: 192,
      buildPrompt(request) {
        return buildExplainPrompt(getRequestSelectionContext(request));
      }
    }
  };
}

function buildModelActionDefinition(action: ActionRequest["action"]): BuiltInActionDefinition {
  const preferredCredentialProviders = ["configured_api_key", "api_key"];

  switch (action) {
    case "ask_claw":
      return {
        action,
        handler: askClawHandler,
        manifest: {
          id: "ask_claw",
          title: "Ask Claw",
          runner: "model",
          sessionTitle: "Ask Claw",
          responseMode: "generate_text",
          preferredCredentialProviders,
          buildPrompt(request) {
            return buildAskClawPrompt(request);
          }
        }
      };
    case "summarize":
      return {
        action,
        handler: summarizeHandler,
        manifest: {
          id: "summarize",
          title: "Summary",
          runner: "model",
          sessionTitle: "Summarize",
          responseMode: "generate_text",
          preferredCredentialProviders,
          buildPrompt(request) {
            return buildSummarizePrompt(getRequestSelectionContext(request));
          }
        }
      };
    case "explain":
      return {
        action,
        handler: explainHandler,
        manifest: {
          id: "explain",
          title: "Explain",
          runner: "model",
          sessionTitle: "Explain",
          responseMode: "generate_text",
          preferredCredentialProviders,
          buildPrompt(request) {
            return buildExplainPrompt(getRequestSelectionContext(request));
          }
        }
      };
    case "rewrite":
      return {
        action,
        handler: rewriteHandler,
        manifest: {
          id: "rewrite",
          title: "Rewrite",
          runner: "model",
          sessionTitle: "Rewrite",
          responseMode: "generate_text",
          preferredCredentialProviders,
          buildPrompt(request) {
            assertTextSelection(request.selection);
            return buildRewritePrompt(request.selection.text, request.options?.rewrite_mode ?? "rewrite");
          }
        }
      };
    default:
      throw new AppError({
        code: ERROR_CODES.UNSUPPORTED_ACTION,
        message: `Action ${action} does not support model execution.`,
        phase: "validation",
        retryable: false,
        statusCode: 400,
        details: {
          action,
          runner: "model"
        }
      });
  }
}
