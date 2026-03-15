import { randomUUID } from "node:crypto";

import type { ActionRequest, ActionResponse, ActionSelection, SelectionContext } from "@rightonclaw/types";

import type { ActionStreamEvent } from "./types";

const BASE_URL = "http://127.0.0.1:48765/v1";
const REQUEST_TIMEOUT_MS = 75_000;

export interface BridgeActionInput {
  action: ActionRequest["action"];
  source: ActionRequest["source"];
  selection: ActionSelection;
  selection_context?: SelectionContext;
  prompt?: string;
  stream?: boolean;
  options?: ActionRequest["options"];
}

export interface BackendSelectionError {
  code: string;
  message: string;
  backend_id?: "openclaw" | "openai_compatible" | null;
}

export interface BackendStatus {
  id: "openclaw" | "openai_compatible";
  display_name: string;
  configured: boolean;
  healthy: boolean;
  available: boolean;
  preferred: boolean;
  source: "auto" | "manual";
  reason?: string;
  supported_actions: string[];
  supports_fast_path: boolean;
  default_runner: string;
  fast_path_runner?: string | null;
}

export interface BackendsResponse {
  status: "ok";
  selection_mode: "auto" | "manual";
  requested_backend: "openclaw" | "openai_compatible" | null;
  default_backend: "openclaw" | "openai_compatible" | null;
  fast_path_backend: "openclaw" | null;
  fast_path_available: boolean;
  setup_required: boolean;
  selection_error?: BackendSelectionError;
  backends: BackendStatus[];
}

export interface ConfigureBackendInput {
  backend: "openai_compatible";
  api_key: string;
  base_url?: string;
  model?: string;
}

export interface ConfigureBackendsResponse {
  success: true;
  backends: BackendsResponse;
}

export class BridgeRequestError extends Error {
  public readonly code?: string;
  public readonly retryable?: boolean;
  public readonly details?: Record<string, unknown> | null;
  public readonly response?: ActionResponse;

  public constructor(input: {
    message: string;
    code?: string;
    retryable?: boolean;
    details?: Record<string, unknown> | null;
    response?: ActionResponse;
  }) {
    super(input.message);
    this.name = "BridgeRequestError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.details = input.details;
    this.response = input.response;
  }
}

export async function postAction(input: BridgeActionInput): Promise<ActionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(getActionUrl(input.action), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        version: "1.0",
        request_id: randomUUID(),
        action: input.action,
        source: input.source,
        selection: input.selection,
        selection_context: input.selection_context,
        prompt: input.prompt,
        stream: input.stream,
        options: input.options
      }),
      signal: controller.signal
    });

    const payload = (await response.json()) as ActionResponse;

    if (!response.ok) {
      return payload;
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function* streamAction(input: BridgeActionInput): AsyncGenerator<ActionStreamEvent> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(getStreamActionUrl(input.action), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        version: "1.0",
        request_id: randomUUID(),
        action: input.action,
        source: input.source,
        selection: input.selection,
        selection_context: input.selection_context,
        prompt: input.prompt,
        stream: true,
        options: input.options
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = (await response.json().catch(async () => ({ error: { message: await response.text() } }))) as ActionResponse;
      throw new BridgeRequestError({
        message: payload.error?.message ?? `Streaming request failed with HTTP ${response.status}.`,
        code: payload.error?.code,
        retryable: payload.error?.retryable,
        details:
          payload.error?.details && typeof payload.error.details === "object"
            ? (payload.error.details as Record<string, unknown>)
            : null,
        response: payload
      });
    }

    if (!response.body) {
      throw new Error("Streaming endpoint did not return a readable body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const normalizedBuffer = buffer.replace(/\r/g, "");
      const events = normalizedBuffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        const dataLine = rawEvent
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.startsWith("data:"));

        if (!dataLine) {
          continue;
        }

        const payload = dataLine.slice("data:".length).trim();
        if (!payload) {
          continue;
        }

        yield JSON.parse(payload) as ActionStreamEvent;
      }

      if (done) {
        break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function getBackends(): Promise<BackendsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/backends`, {
      method: "GET",
      signal: controller.signal
    });

    const payload = (await response.json()) as BackendsResponse;

    if (!response.ok) {
      throw new BridgeRequestError({
        message: `Backend status request failed with HTTP ${response.status}.`,
        details: {
          response_status: response.status
        }
      });
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function configureBackend(input: ConfigureBackendInput): Promise<ConfigureBackendsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/backends/configure`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(input),
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => ({}))) as
      | ConfigureBackendsResponse
      | {
          error?: {
            code?: string;
            message?: string;
            retryable?: boolean;
            details?: Record<string, unknown> | null;
          };
        };

    if (!response.ok) {
      const errorPayload = "error" in payload ? payload.error : undefined;

      throw new BridgeRequestError({
        message: errorPayload?.message ?? `Backend configuration request failed with HTTP ${response.status}.`,
        code: errorPayload?.code,
        retryable: errorPayload?.retryable,
        details: errorPayload?.details ?? {
          response_status: response.status
        }
      });
    }

    return payload as ConfigureBackendsResponse;
  } finally {
    clearTimeout(timer);
  }
}

function getActionUrl(action: ActionRequest["action"]): string {
  switch (action) {
    case "ask_claw":
      return `${BASE_URL}/actions/ask-claw`;
    case "send_to_claw":
      return `${BASE_URL}/actions/send-to-claw`;
    case "summarize":
      return `${BASE_URL}/actions/summarize`;
    case "rewrite":
      return `${BASE_URL}/actions/rewrite`;
    case "explain":
      return `${BASE_URL}/actions/explain`;
  }

  throw new Error(`Unsupported action URL mapping for ${String(action)}.`);
}

function getStreamActionUrl(action: ActionRequest["action"]): string {
  switch (action) {
    case "ask_claw":
      return `${BASE_URL}/actions/ask-claw/stream`;
    case "summarize":
      return `${BASE_URL}/actions/summarize/stream`;
    case "explain":
      return `${BASE_URL}/actions/explain/stream`;
    default:
      throw new Error(`Streaming is not supported for ${String(action)}.`);
  }
}
