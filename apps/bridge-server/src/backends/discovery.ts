import type { BackendStatus } from "@rightonclaw/core";

import type { BackendDiscovery, BackendPluginContext } from "./types";
import { BackendPluginRegistry } from "./registry";

export interface BackendDiscoveryServiceOptions {
  registry: BackendPluginRegistry;
  context: BackendPluginContext;
  cacheTtlMs?: number;
}

export class BackendDiscoveryService implements BackendDiscovery {
  private readonly registry: BackendPluginRegistry;
  private readonly context: BackendPluginContext;
  private readonly cacheTtlMs: number;
  private cache:
    | {
        discoveredAt: number;
        statuses: BackendStatus[];
      }
    | undefined;

  public constructor(options: BackendDiscoveryServiceOptions) {
    this.registry = options.registry;
    this.context = options.context;
    this.cacheTtlMs = options.cacheTtlMs ?? 3_000;
  }

  public async discover(): Promise<BackendStatus[]> {
    if (this.cache && Date.now() - this.cache.discoveredAt < this.cacheTtlMs) {
      return this.cache.statuses.map((status) => ({ ...status }));
    }

    const statuses = await Promise.all(this.registry.list().map((plugin) => plugin.detect(this.context)));
    this.cache = {
      discoveredAt: Date.now(),
      statuses
    };

    return statuses.map((status) => ({ ...status }));
  }

  public invalidate(): void {
    this.cache = undefined;
  }
}
