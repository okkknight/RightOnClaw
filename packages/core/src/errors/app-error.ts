import type { ActionError, ErrorPhase } from "@rightonclaw/types";

import { ERROR_CODES, type ErrorCode } from "./error-codes";

export interface AppErrorInput {
  code: ErrorCode;
  message: string;
  phase: ErrorPhase;
  retryable?: boolean;
  statusCode?: number;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly phase: ErrorPhase;
  public readonly retryable: boolean;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  public constructor(input: AppErrorInput) {
    super(input.message);
    this.name = "AppError";
    this.code = input.code;
    this.phase = input.phase;
    this.retryable = input.retryable ?? false;
    this.statusCode = input.statusCode ?? 500;
    this.details = input.details;
  }

  public toActionError(): ActionError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      phase: this.phase,
      details: this.details
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function unsupportedSelectionError(action: string, selectionKind: string): AppError {
  return new AppError({
    code: ERROR_CODES.UNSUPPORTED_SELECTION_KIND,
    message: `Action ${action} does not support selection kind ${selectionKind}.`,
    phase: "validation",
    retryable: false,
    statusCode: 400,
    details: {
      action,
      selection_kind: selectionKind
    }
  });
}

