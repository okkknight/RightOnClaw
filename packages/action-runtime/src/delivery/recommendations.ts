import type { ActionRequest, DeliveryPlan, DeliveryMode } from "@rightonclaw/types";

export function createDeliveryPlan(preferredMode: DeliveryMode, fallbackModes: DeliveryMode[]): DeliveryPlan {
  return {
    preferred_mode: preferredMode,
    fallback_modes: fallbackModes
  };
}

export function rewriteDeliveryForRequest(request: ActionRequest): DeliveryPlan {
  const sourceAppSupported = Boolean(request.source.app_name || request.source.bundle_id);

  if (!request.options?.replace_selection || !sourceAppSupported) {
    return createDeliveryPlan("popup", ["clipboard"]);
  }

  return createDeliveryPlan("apply_selection", ["popup", "clipboard"]);
}

