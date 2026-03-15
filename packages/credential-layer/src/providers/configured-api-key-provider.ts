import type { LoadedBackendConfig } from "@rightonclaw/core";

import type { CredentialProvider, CredentialRequest, ResolvedCredential } from "../provider";
import type { ApiKeyCredentialValue } from "./api-key-provider";

export interface ConfiguredApiKeyCredentialProviderOptions {
  backendConfig: Pick<LoadedBackendConfig, "backends" | "settings_path">;
}

export class ConfiguredApiKeyCredentialProvider implements CredentialProvider<ApiKeyCredentialValue> {
  public readonly name = "configured_api_key";
  private readonly backendConfig: Pick<LoadedBackendConfig, "backends" | "settings_path">;

  public constructor(options: ConfiguredApiKeyCredentialProviderOptions) {
    this.backendConfig = options.backendConfig;
  }

  public canResolve(input: CredentialRequest): boolean {
    if (input.executor !== "model") {
      return false;
    }

    const config = this.backendConfig.backends?.openai_compatible;
    if (!config || config.enabled === false) {
      return false;
    }

    return hasValue(config.api_key);
  }

  public async resolve(_input: CredentialRequest): Promise<ResolvedCredential<ApiKeyCredentialValue>> {
    const config = this.backendConfig.backends?.openai_compatible ?? {};

    return {
      provider: this.name,
      kind: "api_key",
      value: {
        apiKey: config.api_key?.trim() ?? "",
        baseUrl: readValue(config.base_url),
        model: readValue(config.model)
      },
      meta: {
        source: "backend_config",
        settings_path: this.backendConfig.settings_path
      }
    };
  }
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function readValue(value: string | undefined): string | undefined {
  return hasValue(value) ? value?.trim() : undefined;
}
