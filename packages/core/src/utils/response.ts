import type { ActionName, ActionResponse, ActionResponseMeta, ActionResult, ResponseStatus } from "@rightonclaw/types";

import { ERROR_CODES } from "../errors/error-codes";
import { AppError, isAppError } from "../errors/app-error";

export function createActionResponse(input: {
  requestId: string;
  action: ActionName;
  status: ResponseStatus;
  result: ActionResult | null;
  error: ActionResponse["error"];
  meta: ActionResponseMeta;
}): ActionResponse {
  return {
    request_id: input.requestId,
    action: input.action,
    status: input.status,
    result: input.result,
    error: input.error,
    meta: input.meta
  };
}

export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError({
      code: ERROR_CODES.GENERATION_FAILED,
      message: error.message,
      phase: "generation",
      retryable: true
    });
  }

  return new AppError({
    code: ERROR_CODES.GENERATION_FAILED,
    message: "Unknown runtime error.",
    phase: "generation",
    retryable: true
  });
}

