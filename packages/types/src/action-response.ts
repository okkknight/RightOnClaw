import type { ActionError } from "./error-model";
import type { ActionName, ContentFormat, DeliveryMode, ResponseStatus } from "./enums";

export interface DeliveryPlan {
  preferred_mode: DeliveryMode;
  fallback_modes: DeliveryMode[];
}

export interface ActionResult {
  title?: string;
  content?: string | null;
  content_format?: ContentFormat;
  session_id?: string | null;
  webui_url?: string | null;
  delivery: DeliveryPlan;
}

export interface ActionResponseMeta {
  duration_ms: number;
  fallback_used: boolean;
  model?: string;
  source_app_supported?: boolean;
  delivery_mode?: DeliveryMode;
}

export interface ActionResponse<TResult extends ActionResult = ActionResult> {
  request_id: string;
  status: ResponseStatus;
  action: ActionName;
  result: TResult | null;
  error: ActionError | null;
  meta: ActionResponseMeta;
}

