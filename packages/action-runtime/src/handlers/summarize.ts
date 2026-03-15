import { createDeliveryPlan } from "../delivery/recommendations";
import type { ActionHandler } from "../types";

interface SummarizeRawResult {
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

export const summarizeHandler: ActionHandler<SummarizeRawResult> = {
  action: "summarize",
  validate() {
    return undefined;
  },
  buildRawResult(execution, request) {
    return {
      title: "Summary",
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
