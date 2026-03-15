import {
  ACTION_NAMES,
  PROMPT_PRESETS,
  SELECTION_CAPTURE_MODES,
  SELECTION_CONTEXT_KINDS,
  SELECTION_ITEM_KINDS,
  REWRITE_MODES,
  SELECTION_KINDS,
  SESSION_STRATEGIES,
  type ActionRequest,
  type ActionSelection
} from "@rightonclaw/types";
import { z } from "zod";

import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";
import { ensureRequestId } from "../utils/request-id";

const sourceSchema = z.object({
  platform: z.string().min(1),
  entry: z.string().min(1),
  app_name: z.string().min(1).optional(),
  window_title: z.string().min(1).optional(),
  bundle_id: z.string().min(1).optional()
});

const fileSelectionSchema = z.object({
  kind: z.literal(SELECTION_KINDS[0]),
  text: z.null(),
  paths: z.array(z.string().min(1)).min(1),
  mime: z.string().min(1).nullable().optional(),
  encoding: z.string().min(1).nullable().optional(),
  char_count: z.null().optional()
});

const directorySelectionSchema = z.object({
  kind: z.literal(SELECTION_KINDS[1]),
  text: z.null(),
  paths: z.array(z.string().min(1)).min(1),
  mime: z.string().min(1).nullable().optional(),
  encoding: z.string().min(1).nullable().optional(),
  char_count: z.null().optional()
});

const textSelectionSchema = z.object({
  kind: z.literal(SELECTION_KINDS[2]),
  text: z.string().min(1),
  paths: z.array(z.string().min(1)).default([]),
  mime: z.string().min(1).nullable().optional(),
  encoding: z.string().min(1).nullable().optional(),
  char_count: z.number().int().nonnegative().nullable().optional()
});

const manualSelectionSchema = z.object({
  kind: z.literal(SELECTION_KINDS[3]),
  text: z.null(),
  paths: z.tuple([]),
  mime: z.string().min(1).nullable().optional(),
  encoding: z.string().min(1).nullable().optional(),
  char_count: z.null().optional()
});

const optionsSchema = z.object({
  open_webui: z.boolean().optional(),
  show_popup: z.boolean().optional(),
  replace_selection: z.boolean().optional(),
  session_strategy: z.enum(SESSION_STRATEGIES).optional(),
  rewrite_mode: z.enum(REWRITE_MODES).optional(),
  prompt_preset: z.enum(PROMPT_PRESETS).optional(),
  timeout_ms: z.number().int().positive().optional()
});

const selectionContextTextSchema = z.object({
  value: z.string(),
  char_count: z.number().int().nonnegative()
});

const selectionContextItemSchema = z.object({
  item_kind: z.enum(SELECTION_ITEM_KINDS),
  path: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  mime_type: z.string().min(1).nullable().optional(),
  size_bytes: z.number().int().nonnegative().nullable().optional(),
  extension: z.string().nullable().optional(),
  inline_text_preview: z.string().nullable().optional()
});

const selectionCaptureSchema = z.object({
  mode: z.enum(SELECTION_CAPTURE_MODES),
  created_at: z.string().min(1)
});

const selectionContextSchema = z.object({
  kind: z.enum(SELECTION_CONTEXT_KINDS),
  text: selectionContextTextSchema.nullable().optional(),
  items: z.array(selectionContextItemSchema).optional(),
  source_app: z.string().min(1).optional(),
  capture: selectionCaptureSchema.nullable().optional(),
  summary: z.string().optional()
});

export const actionRequestSchema = z.object({
  version: z.string().min(1).default("1.0"),
  request_id: z.string().uuid().optional(),
  action: z.enum(ACTION_NAMES),
  source: sourceSchema,
  selection: z.discriminatedUnion("kind", [
    fileSelectionSchema,
    directorySelectionSchema,
    textSelectionSchema,
    manualSelectionSchema
  ]),
  selection_context: selectionContextSchema.optional(),
  prompt: z.string().optional(),
  stream: z.boolean().optional(),
  options: optionsSchema.optional()
});

export function parseActionRequest(input: unknown, expectedAction?: ActionRequest["action"]): ActionRequest {
  const parsed = actionRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new AppError({
      code: ERROR_CODES.INVALID_REQUEST,
      message: "Request body failed schema validation.",
      phase: "validation",
      retryable: false,
      statusCode: 400,
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      }
    });
  }

  const request: ActionRequest = {
    ...parsed.data,
    request_id: ensureRequestId(parsed.data.request_id)
  };

  if (expectedAction && request.action !== expectedAction) {
    throw new AppError({
      code: ERROR_CODES.INVALID_REQUEST,
      message: `Expected action ${expectedAction} but received ${request.action}.`,
      phase: "validation",
      retryable: false,
      statusCode: 400,
      details: {
        expected_action: expectedAction,
        received_action: request.action
      }
    });
  }

  return request;
}

export function assertTextSelection(selection: ActionSelection): asserts selection is Extract<ActionSelection, { kind: "text" }> {
  if (selection.kind !== "text") {
    throw new AppError({
      code: ERROR_CODES.UNSUPPORTED_SELECTION_KIND,
      message: "This action only supports text selections.",
      phase: "validation",
      retryable: false,
      statusCode: 400,
      details: {
        selection_kind: selection.kind
      }
    });
  }
}
