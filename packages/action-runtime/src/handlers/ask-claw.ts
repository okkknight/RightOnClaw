import { AppError, ERROR_CODES } from "@rightonclaw/core";

import { createDeliveryPlan } from "../delivery/recommendations";
import { getPromptPreset, resolveAskClawPrompt } from "../prompts/ask-claw";
import type { ActionHandler } from "../types";

interface AskClawRawResult {
  title: string;
  content: string;
  sessionId: string;
  webuiUrl: string | null;
  meta: {
    fallback_used: false;
    model?: string;
    source_app_supported: boolean;
    delivery_mode: "popup";
  };
}

export const askClawHandler: ActionHandler<AskClawRawResult> = {
  action: "ask_claw",
  validate(request) {
    const preset = getPromptPreset(request);
    const prompt = resolveAskClawPrompt(request);

    if (preset === "freeform" && prompt.trim().length === 0) {
      throw new AppError({
        code: ERROR_CODES.PROMPT_REQUIRED,
        message: "Ask Claw requires a prompt.",
        phase: "validation",
        retryable: false,
        statusCode: 400,
        details: {
          action: request.action,
          prompt_preset: preset
        }
      });
    }
  },
  buildRawResult(execution, request) {
    return {
      title: getAskClawTitle(request),
      content: execution.generatedText ?? "No response from OpenClaw.",
      sessionId: execution.sessionId,
      webuiUrl: execution.webuiUrl,
      meta: {
        fallback_used: false,
        model: execution.model,
        source_app_supported: Boolean(request.source.app_name || request.source.bundle_id),
        delivery_mode: "popup"
      }
    };
  },
  buildResult(raw) {
    return {
      title: raw.title,
      content: raw.content,
      content_format: "plain_text",
      session_id: raw.sessionId,
      webui_url: raw.webuiUrl,
      delivery: createDeliveryPlan("popup", ["clipboard", "open_webui"])
    };
  },
  recommendedDelivery() {
    return createDeliveryPlan("popup", ["clipboard", "open_webui"]);
  }
};

function getAskClawTitle(request: Parameters<typeof askClawHandler.buildRawResult>[1]): string {
  switch (getPromptPreset(request)) {
    case "summarize":
      return "Summary";
    case "explain":
      return "Explanation";
    default:
      return "Ask Claw";
  }
}
