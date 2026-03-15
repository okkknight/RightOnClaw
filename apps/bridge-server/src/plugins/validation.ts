import type { FastifyInstance, FastifyRequest } from "fastify";

import { AppError, ERROR_CODES, type BridgeConfig } from "@rightonclaw/core";

export function registerValidation(app: FastifyInstance, config: BridgeConfig): void {
  app.addHook("onRequest", async (request) => {
    enforceOriginPolicy(request, config);
    enforceLocalToken(request, config);
  });
}

function enforceOriginPolicy(request: FastifyRequest, config: BridgeConfig): void {
  const origin = readHeader(request, "origin");

  if (!origin) {
    return;
  }

  if (config.allowedOrigins.includes(origin)) {
    return;
  }

  throw new AppError({
    code: ERROR_CODES.UNAUTHORIZED_ORIGIN,
    message: "Origin is not allowed for the local bridge.",
    phase: "security",
    retryable: false,
    statusCode: 403,
    details: {
      origin
    }
  });
}

function enforceLocalToken(request: FastifyRequest, config: BridgeConfig): void {
  if (!config.localToken) {
    return;
  }

  const providedToken = readHeader(request, "x-rightonclaw-token");

  if (providedToken === config.localToken) {
    return;
  }

  throw new AppError({
    code: ERROR_CODES.INVALID_LOCAL_TOKEN,
    message: "Missing or invalid local token.",
    phase: "security",
    retryable: false,
    statusCode: 401
  });
}

function readHeader(request: FastifyRequest, key: string): string | undefined {
  const value = request.headers[key];

  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

