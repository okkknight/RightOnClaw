import { buildExplainResult } from "../actions/explain-helpers";
import { createDeliveryPlan } from "../delivery/recommendations";
import type { ActionHandler } from "../types";

interface ExplainRawResult {
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

export const explainHandler: ActionHandler<ExplainRawResult> = {
  action: "explain",
  validate() {
    return undefined;
  },
  buildRawResult(execution, request) {
    return {
      title: "Explanation",
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
    return buildExplainResult(raw.content, {
      title: raw.title,
      sessionId: raw.sessionId,
      webuiUrl: raw.webuiUrl
    });
  },
  recommendedDelivery() {
    return createDeliveryPlan("popup", ["clipboard", "open_webui"]);
  }
};
