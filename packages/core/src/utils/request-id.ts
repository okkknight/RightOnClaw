import { randomUUID } from "node:crypto";

export function ensureRequestId(requestId?: string | null): string {
  if (requestId && requestId.trim().length > 0) {
    return requestId;
  }

  return randomUUID();
}

