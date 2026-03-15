import type { FastifyInstance, FastifyRequest } from "fastify";

import { ensureRequestId } from "@rightonclaw/core";

declare module "fastify" {
  interface FastifyRequest {
    rocRequestId: string;
    rocStartedAt: number;
  }
}

export function registerTracing(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const requestId = ensureRequestId(readHeader(request, "x-request-id"));

    request.rocRequestId = requestId;
    request.rocStartedAt = Date.now();
    reply.header("x-request-id", requestId);
  });
}

function readHeader(request: FastifyRequest, key: string): string | undefined {
  const value = request.headers[key];

  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

