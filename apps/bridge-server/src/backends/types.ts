import type {
  BackendConfigFile,
  BackendId,
  BackendSelectionSnapshot,
  BackendStatus,
  LoadedBackendConfig
} from "@rightonclaw/core";
import type { CredentialProviderRegistry } from "@rightonclaw/credential-layer";
import type { BridgeConfig } from "@rightonclaw/core";

export interface BackendPluginContext {
  config: BridgeConfig;
  backendConfig: LoadedBackendConfig;
  credentialProviderRegistry: Pick<CredentialProviderRegistry, "resolve">;
  env: NodeJS.ProcessEnv;
}

export interface BackendPlugin {
  readonly id: BackendId;
  readonly displayName: string;
  detect(context: BackendPluginContext): Promise<BackendStatus>;
}

export interface BackendDiscovery {
  discover(): Promise<BackendStatus[]>;
}

export interface BackendSelectionResolver {
  resolve(): Promise<BackendSelectionSnapshot>;
}

export interface StaticBackendSelectionInput {
  selection_mode?: "auto" | "manual";
  requested_backend?: BackendId | null;
  default_backend: BackendId | null;
  fast_path_backend?: BackendId | null;
  fast_path_available?: boolean;
  setup_required?: boolean;
  backends?: BackendStatus[];
  selection_error?: BackendSelectionSnapshot["selection_error"];
}

export interface BackendConfigStore extends BackendConfigFile {}
