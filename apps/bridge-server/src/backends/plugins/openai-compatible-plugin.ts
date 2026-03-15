import type { BackendStatus } from "@rightonclaw/core";
import { CredentialResolutionError } from "@rightonclaw/credential-layer";

import type { BackendPlugin, BackendPluginContext } from "../types";

export class OpenAICompatibleBackendPlugin implements BackendPlugin {
  public readonly id = "openai_compatible" as const;
  public readonly displayName = "API Key";

  public async detect(context: BackendPluginContext): Promise<BackendStatus> {
    const preferredProviders = ["configured_api_key", "api_key"];

    for (const provider of preferredProviders) {
      try {
        await context.credentialProviderRegistry.resolve({
          executor: "model",
          purpose: "generation",
          preferredProvider: provider
        });

        return {
          id: this.id,
          display_name: this.displayName,
          configured: true,
          healthy: true,
          available: true,
          preferred: false,
          source: "manual",
          reason: `${provider}_resolved`,
          supported_actions: ["ask_claw", "summarize", "explain", "rewrite"],
          supports_fast_path: false,
          default_runner: "model",
          fast_path_runner: null
        };
      } catch (error) {
        if (!(error instanceof CredentialResolutionError)) {
          throw error;
        }
      }
    }

    return {
      id: this.id,
      display_name: this.displayName,
      configured: false,
      healthy: false,
      available: false,
      preferred: false,
      source: "manual",
      reason: "no_api_backend_credential",
      supported_actions: ["ask_claw", "summarize", "explain", "rewrite"],
      supports_fast_path: false,
      default_runner: "model",
      fast_path_runner: null
    };
  }
}
