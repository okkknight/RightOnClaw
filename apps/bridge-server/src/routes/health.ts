import type { FastifyInstance } from "fastify";

import type { BridgeConfig } from "@rightonclaw/core";

export function registerHealthRoutes(app: FastifyInstance, config: BridgeConfig): void {
  app.get("/v1/health", async () => ({
    status: "ok",
    service: "rightonclaw-bridge",
    version: config.version
  }));
}

