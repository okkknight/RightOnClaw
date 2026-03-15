import { assertTextSelection } from "@rightonclaw/core";
import type { ActionResponseMeta } from "@rightonclaw/types";

import { rewriteDeliveryForRequest } from "../delivery/recommendations";
import type { ActionHandler } from "../types";

interface RewriteRawResult {
  title: string;
  content: string;
  sessionId: string;
  webuiUrl: string | null;
  meta: {
    fallback_used: boolean;
    model?: string;
    source_app_supported: boolean;
    delivery_mode: ActionResponseMeta["delivery_mode"];
  };
}

export const rewriteHandler: ActionHandler<RewriteRawResult> = {
  action: "rewrite",
  validate(request) {
    assertTextSelection(request.selection);
  },
  buildRawResult(execution, request) {
    const delivery = rewriteDeliveryForRequest(request);

    return {
      title: "Rewrite",
      content: execution.generatedText ?? "No response from OpenClaw.",
      sessionId: execution.sessionId,
      webuiUrl: execution.webuiUrl,
      meta: {
        fallback_used: false,
        model: execution.model,
        source_app_supported: Boolean(request.source.app_name || request.source.bundle_id),
        delivery_mode: delivery.preferred_mode
      }
    };
  },
  buildResult(raw, request) {
    return {
      title: raw.title,
      content: raw.content,
      content_format: "plain_text",
      session_id: raw.sessionId,
      webui_url: raw.webuiUrl,
      delivery: rewriteDeliveryForRequest(request)
    };
  },
  recommendedDelivery(_result, request) {
    return rewriteDeliveryForRequest(request);
  }
};
