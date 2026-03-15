import type { FastifyInstance } from "fastify";

import type { BackendSelectionResolver } from "../backends/types";

export interface BackendRoutesDependencies {
  backendSelectionResolver: BackendSelectionResolver;
}

export function registerBackendRoutes(app: FastifyInstance, dependencies: BackendRoutesDependencies): void {
  app.get("/v1/backends", async () => {
    const snapshot = await dependencies.backendSelectionResolver.resolve();

    return {
      status: "ok",
      ...snapshot
    };
  });
}
