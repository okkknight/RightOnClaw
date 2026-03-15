import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  BACKEND_IDS,
  BACKEND_SELECTION_MODES,
  type BackendId,
  type BackendSelectionMode
} from "./types";

export interface OpenAICompatibleBackendConfig {
  enabled?: boolean;
  api_key?: string;
  base_url?: string;
  model?: string;
}

export interface BackendConfigFile {
  selection_mode?: BackendSelectionMode;
  selected_backend?: BackendId | null;
  backends?: {
    openai_compatible?: OpenAICompatibleBackendConfig;
  };
}

export interface LoadedBackendConfig extends BackendConfigFile {
  settings_path: string;
  settings_found: boolean;
}

export interface ConfigureOpenAICompatibleBackendInput {
  api_key: string;
  base_url?: string;
  model?: string;
}

export function loadBackendConfig(env: NodeJS.ProcessEnv = process.env): LoadedBackendConfig {
  const settingsPath = resolveBackendSettingsPath(env);
  const fileConfig = readBackendConfigFile(settingsPath);

  return {
    settings_path: settingsPath,
    settings_found: fileConfig !== null,
    selection_mode: readSelectionMode(env.RIGHTONCLAW_BACKEND_SELECTION_MODE) ?? fileConfig?.selection_mode ?? "auto",
    selected_backend: readBackendId(env.RIGHTONCLAW_SELECTED_BACKEND) ?? fileConfig?.selected_backend ?? null,
    backends: {
      openai_compatible: {
        ...(fileConfig?.backends?.openai_compatible ?? {})
      }
    }
  };
}

export function resolveBackendSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.RIGHTONCLAW_BACKEND_SETTINGS_PATH?.trim();
  if (explicit) {
    return explicit;
  }

  return path.join(os.homedir(), "Library", "Application Support", "RightOnClaw", "settings.json");
}

export function configureOpenAICompatibleBackend(
  config: LoadedBackendConfig,
  input: ConfigureOpenAICompatibleBackendInput
): LoadedBackendConfig {
  config.selection_mode = "manual";
  config.selected_backend = "openai_compatible";
  config.backends = {
    ...config.backends,
    openai_compatible: {
      enabled: true,
      api_key: normalizeRequiredString(input.api_key),
      base_url: normalizeString(input.base_url),
      model: normalizeString(input.model)
    }
  };
  config.settings_found = true;
  return config;
}

export function saveBackendConfig(config: LoadedBackendConfig): void {
  const output: BackendConfigFile = {
    selection_mode: config.selection_mode,
    selected_backend: config.selected_backend,
    backends: {
      openai_compatible: normalizeOpenAICompatibleConfig(config.backends?.openai_compatible)
    }
  };

  fs.mkdirSync(path.dirname(config.settings_path), { recursive: true });
  fs.writeFileSync(config.settings_path, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  config.settings_found = true;
}

function readBackendConfigFile(settingsPath: string): BackendConfigFile | null {
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as BackendConfigFile;
    return normalizeBackendConfigFile(parsed);
  } catch {
    return null;
  }
}

function normalizeBackendConfigFile(input: BackendConfigFile): BackendConfigFile {
  return {
    selection_mode: readSelectionMode(input.selection_mode),
    selected_backend: readBackendId(input.selected_backend),
    backends: {
      openai_compatible: normalizeOpenAICompatibleConfig(input.backends?.openai_compatible)
    }
  };
}

function normalizeOpenAICompatibleConfig(
  input: OpenAICompatibleBackendConfig | undefined
): OpenAICompatibleBackendConfig | undefined {
  if (!input) {
    return undefined;
  }

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    api_key: normalizeString(input.api_key),
    base_url: normalizeString(input.base_url),
    model: normalizeString(input.model)
  };
}

function readSelectionMode(value: string | null | undefined): BackendSelectionMode | undefined {
  return BACKEND_SELECTION_MODES.find((candidate) => candidate === value) ?? undefined;
}

function readBackendId(value: string | null | undefined): BackendId | null | undefined {
  if (value === null) {
    return null;
  }

  return BACKEND_IDS.find((candidate) => candidate === value) ?? undefined;
}

function normalizeString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRequiredString(value: string): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new Error("Expected a non-empty string value.");
  }

  return normalized;
}
