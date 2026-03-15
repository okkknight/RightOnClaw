import type { FastifyInstance } from "fastify";

import { dispatchAction, type ActionRuntime } from "@rightonclaw/action-runtime";
import {
  AppError,
  ERROR_CODES,
  createActionResponse,
  normalizeError,
  parseActionRequest,
  type BridgeConfig,
  type Logger
} from "@rightonclaw/core";
import type { ActionName, ActionRequest, ActionResponse } from "@rightonclaw/types";

import { withNormalizedSelectionContext } from "../selection-context";

interface ActionRouteDependencies {
  runtime: ActionRuntime;
  logger: Logger;
  config: BridgeConfig;
}

export function registerActionRoutes(app: FastifyInstance, dependencies: ActionRouteDependencies): void {
  registerActionRoute(app, "/v1/actions/ask-claw", "ask_claw", dependencies);
  registerActionRoute(app, "/v1/actions/send-to-claw", "send_to_claw", dependencies);
  registerActionRoute(app, "/v1/actions/summarize", "summarize", dependencies);
  registerActionRoute(app, "/v1/actions/rewrite", "rewrite", dependencies);
  registerActionRoute(app, "/v1/actions/explain", "explain", dependencies);
  registerActionStreamRoute(app, "/v1/actions/ask-claw/stream", "ask_claw", dependencies);
  registerActionStreamRoute(app, "/v1/actions/summarize/stream", "summarize", dependencies);
  registerActionStreamRoute(app, "/v1/actions/explain/stream", "explain", dependencies);
}

const STREAM_CONTENT_CHUNK_SIZE = 96;
const STREAM_CONTENT_CHUNK_DELAY_MS = 25;

function registerActionRoute(
  app: FastifyInstance,
  url: string,
  action: ActionName,
  dependencies: ActionRouteDependencies
): void {
  app.post(url, async (request, reply) => {
    const requestBody = request.body ?? {};
    const payloadSizeBytes = validatePayloadSize(requestBody, dependencies.config);
    const parsedRequest = await prepareActionRequest(requestBody, action);
    const outcome = await dispatchAction(parsedRequest, {
      runtime: dependencies.runtime,
      logger: dependencies.logger
    });
    const durationMs = Date.now() - request.rocStartedAt;
    const response = createSuccessResponse(parsedRequest, outcome.result, durationMs, outcome.meta);

    request.log.info({
      request_id: parsedRequest.request_id,
      action: parsedRequest.action,
      source_app: parsedRequest.source.app_name ?? null,
      selection_kind: parsedRequest.selection_context?.kind ?? parsedRequest.selection.kind,
      selection_item_count: parsedRequest.selection_context?.items?.length ?? (parsedRequest.selection_context?.text ? 1 : 0),
      capture_mode: parsedRequest.selection_context?.capture?.mode ?? null,
      prompt_preset: parsedRequest.options?.prompt_preset ?? "freeform",
      stream_requested: Boolean(parsedRequest.stream),
      stream_used: false,
      payload_size_bytes: payloadSizeBytes,
      char_count: getSelectionCharCount(parsedRequest),
      delivery_mode: response.meta.delivery_mode,
      fallback_used: response.meta.fallback_used
    });

    reply.status(200).send(response);
  });
}

function registerActionStreamRoute(
  app: FastifyInstance,
  url: string,
  action: Extract<ActionName, "ask_claw" | "summarize" | "explain">,
  dependencies: ActionRouteDependencies
): void {
  app.post(url, async (request, reply) => {
    const requestBody = request.body ?? {};
    const payloadSizeBytes = validatePayloadSize(requestBody, dependencies.config);
    const parsedRequest = await prepareActionRequest(
      typeof requestBody === "object" && requestBody !== null
        ? {
            ...requestBody,
            stream: true
          }
        : requestBody,
      action
    );

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    request.log.info({
      request_id: parsedRequest.request_id,
      action: parsedRequest.action,
      source_app: parsedRequest.source.app_name ?? null,
      selection_kind: parsedRequest.selection_context?.kind ?? parsedRequest.selection.kind,
      selection_item_count: parsedRequest.selection_context?.items?.length ?? (parsedRequest.selection_context?.text ? 1 : 0),
      capture_mode: parsedRequest.selection_context?.capture?.mode ?? null,
      prompt_preset: parsedRequest.options?.prompt_preset ?? "freeform",
      stream_requested: true,
      stream_used: true,
      payload_size_bytes: payloadSizeBytes
    });

    sendEvent({
      type: "start",
      request_id: parsedRequest.request_id,
      action: parsedRequest.action
    });
    sendStatusDelta(sendEvent, parsedRequest.request_id, "Preparing request...");
    sendStatusDelta(sendEvent, parsedRequest.request_id, "Analyzing selection...");

    try {
      const outcome = await dispatchAction(parsedRequest, {
        runtime: dependencies.runtime,
        logger: dependencies.logger
      });
      const durationMs = Date.now() - request.rocStartedAt;
      const response = createSuccessResponse(parsedRequest, outcome.result, durationMs, outcome.meta);
      const content = response.result?.content ?? "";

      sendStatusDelta(sendEvent, parsedRequest.request_id, "Generating response...");
      await streamContentDeltas(sendEvent, parsedRequest.request_id, content);
      sendEvent({
        type: "complete",
        request_id: parsedRequest.request_id,
        content,
        result: response.result,
        meta: response.meta
      });
    } catch (error) {
      const normalized = normalizeError(error);
      sendEvent({
        type: "error",
        request_id: parsedRequest.request_id,
        error_code: normalized.code,
        message: normalized.message,
        phase: normalized.phase,
        retryable: normalized.retryable,
        details: normalized.details ?? null
      });
    } finally {
      reply.raw.end();
    }
  });
}

function createSuccessResponse(
  request: ActionRequest,
  result: ActionResponse["result"],
  durationMs: number,
  meta: Partial<ActionResponse["meta"]>
): ActionResponse {
  return createActionResponse({
    requestId: request.request_id,
    action: request.action,
    status: "ok",
    result,
    error: null,
    meta: {
      duration_ms: durationMs,
      fallback_used: meta.fallback_used ?? false,
      model: meta.model,
      source_app_supported: meta.source_app_supported,
      delivery_mode: result?.delivery.preferred_mode ?? meta.delivery_mode
    }
  });
}

function getSelectionCharCount(request: ActionRequest): number | null {
  if (request.selection.kind !== "text") {
    return null;
  }

  return request.selection.char_count ?? request.selection.text.length;
}

async function prepareActionRequest(input: unknown, action: ActionName): Promise<ActionRequest> {
  const parsedRequest = parseActionRequest(input, action);
  return withNormalizedSelectionContext(parsedRequest);
}

function validatePayloadSize(requestBody: unknown, config: BridgeConfig): number {
  const payloadSizeBytes = Buffer.byteLength(JSON.stringify(requestBody));

  if (payloadSizeBytes > config.bodyLimitBytes) {
    throw new AppError({
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      message: "Request body exceeds the configured payload limit.",
      phase: "validation",
      retryable: false,
      statusCode: 413,
      details: {
        payload_size_bytes: payloadSizeBytes,
        body_limit_bytes: config.bodyLimitBytes
      }
    });
  }

  return payloadSizeBytes;
}

function sendStatusDelta(
  sendEvent: (payload: Record<string, unknown>) => void,
  requestId: string,
  delta: string
): void {
  sendEvent({
    type: "delta",
    request_id: requestId,
    delta,
    delta_kind: "status"
  });
}

async function streamContentDeltas(
  sendEvent: (payload: Record<string, unknown>) => void,
  requestId: string,
  content: string
): Promise<void> {
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return;
  }

  const chunks = splitIntoChunks(content, STREAM_CONTENT_CHUNK_SIZE);
  for (const chunk of chunks) {
    sendEvent({
      type: "delta",
      request_id: requestId,
      delta: chunk,
      delta_kind: "content"
    });
    await sleep(STREAM_CONTENT_CHUNK_DELAY_MS);
  }
}

function splitIntoChunks(input: string, chunkSize: number): string[] {
  if (input.length <= chunkSize) {
    return [input];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    let nextCursor = Math.min(cursor + chunkSize, input.length);
    const boundary = input.lastIndexOf(" ", nextCursor);

    if (boundary > cursor + Math.floor(chunkSize / 2) && boundary < input.length) {
      nextCursor = boundary + 1;
    }

    chunks.push(input.slice(cursor, nextCursor));
    cursor = nextCursor;
  }

  return chunks.filter(Boolean);
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
