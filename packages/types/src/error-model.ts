import type { ActionName, ErrorPhase } from "./enums";

export interface ActionError {
  code: string;
  message: string;
  retryable: boolean;
  phase: ErrorPhase;
  details?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  request_id: string;
  status: "error" | "partial";
  action: ActionName;
  result: null;
  error: ActionError;
  meta: {
    duration_ms: number;
    fallback_used: boolean;
    model?: string;
    source_app_supported?: boolean;
    delivery_mode?: string;
  };
}

