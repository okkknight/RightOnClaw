import type { ActionResponse, PromptPreset } from "@rightonclaw/types";

export interface WorkflowInvocation {
  action: "send_to_claw" | "summarize" | "rewrite" | "explain" | "ask_claw";
  inputMode: "text" | "paths" | "manual" | "auto";
}

export interface ActionFailure {
  response?: ActionResponse;
  code?: string;
  retryable?: boolean;
  message: string;
  detail?: string;
  details?: Record<string, unknown> | null;
}

export interface WorkflowRunResult {
  replacementText?: string;
}

export interface AskClawDialogResult {
  outcome: "cancel" | "submit";
  preset: PromptPreset;
  prompt?: string;
}

export interface ActionStreamEvent {
  type: "start" | "delta" | "complete" | "error";
  request_id: string;
  action?: WorkflowInvocation["action"];
  delta?: string;
  delta_kind?: "status" | "content";
  content?: string;
  result?: ActionResponse["result"];
  meta?: ActionResponse["meta"];
  error_code?: string;
  message?: string;
  phase?: string;
  retryable?: boolean;
  details?: Record<string, unknown> | null;
}
