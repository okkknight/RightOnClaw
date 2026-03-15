import type { BackendId } from "@rightonclaw/core";

import type { BackendPlugin } from "./types";

export class BackendPluginRegistry {
  private readonly plugins = new Map<BackendId, BackendPlugin>();

  public constructor(plugins: BackendPlugin[] = []) {
    plugins.forEach((plugin) => this.register(plugin));
  }

  public register(plugin: BackendPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  public list(): BackendPlugin[] {
    return [...this.plugins.values()];
  }
}
