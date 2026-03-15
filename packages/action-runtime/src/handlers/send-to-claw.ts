import { createDeliveryPlan } from "../delivery/recommendations";
import type { ActionHandler } from "../types";

interface SendToClawRawResult {
  sessionId: string;
  webuiUrl: string | null;
  meta: {
    fallback_used: boolean;
    source_app_supported: boolean;
    delivery_mode: "open_webui";
  };
}

export const sendToClawHandler: ActionHandler<SendToClawRawResult> = {
  action: "send_to_claw",
  validate() {
    return undefined;
  },
  buildRawResult(execution, request) {
    return {
      sessionId: execution.sessionId,
      webuiUrl: execution.webuiUrl,
      meta: {
        fallback_used: execution.webuiUrl === null,
        source_app_supported: Boolean(request.source.app_name || request.source.bundle_id),
        delivery_mode: "open_webui"
      }
    };
  },
  buildResult(raw) {
    return {
      content:
        raw.webuiUrl === null
          ? "The message was sent to Claw, but RightOnClaw could not build a session URL automatically."
          : null,
      session_id: raw.sessionId,
      webui_url: raw.webuiUrl,
      delivery: createDeliveryPlan("open_webui", ["popup", "clipboard"])
    };
  },
  recommendedDelivery() {
    return createDeliveryPlan("open_webui", ["popup", "clipboard"]);
  }
};
