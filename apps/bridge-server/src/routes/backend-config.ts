import type { FastifyInstance } from "fastify";

import {
  AppError,
  ERROR_CODES,
  configureOpenAICompatibleBackend,
  saveBackendConfig,
  type BackendSelectionSnapshot,
  type LoadedBackendConfig
} from "@rightonclaw/core";

export interface BackendConfigRoutesDependencies {
  backendConfig: LoadedBackendConfig;
  refreshBackendSnapshot: () => Promise<BackendSelectionSnapshot>;
}

interface ConfigureBackendRequestBody {
  backend?: unknown;
  api_key?: unknown;
  base_url?: unknown;
  model?: unknown;
}

export function registerBackendConfigRoutes(
  app: FastifyInstance,
  dependencies: BackendConfigRoutesDependencies
): void {
  app.post("/v1/backends/configure", async (request) => {
    const body = normalizeConfigureBackendBody(request.body ?? {});

    if (body.backend !== "openai_compatible") {
      throw invalidRequestError("Only the openai_compatible backend can be configured in this setup flow.", {
        backend: body.backend ?? null
      });
    }

    configureOpenAICompatibleBackend(dependencies.backendConfig, {
      api_key: body.api_key,
      base_url: body.base_url,
      model: body.model
    });
    saveBackendConfig(dependencies.backendConfig);

    const snapshot = await dependencies.refreshBackendSnapshot();

    return {
      success: true,
      backends: {
        status: "ok",
        ...snapshot
      }
    };
  });
}

function normalizeConfigureBackendBody(input: unknown): {
  backend: string;
  api_key: string;
  base_url?: string;
  model?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalidRequestError("Backend configuration payload must be a JSON object.");
  }

  const body = input as ConfigureBackendRequestBody;
  const backend = readRequiredString(body.backend, "backend");
  const apiKey = readRequiredString(body.api_key, "api_key");
  const baseUrl = readOptionalString(body.base_url, "base_url");
  const model = readOptionalString(body.model, "model");

  if (baseUrl) {
    validateBaseUrl(baseUrl);
  }

  return {
    backend,
    api_key: apiKey,
    base_url: baseUrl,
    model
  };
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidRequestError(`Field ${field} must be a non-empty string.`, {
      field
    });
  }

  return value.trim();
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw invalidRequestError(`Field ${field} must be a string when provided.`, {
      field
    });
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function validateBaseUrl(value: string): void {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw invalidRequestError("Field base_url must be a valid URL.", {
      field: "base_url"
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw invalidRequestError("Field base_url must use http or https.", {
      field: "base_url"
    });
  }
}

function invalidRequestError(message: string, details?: Record<string, unknown>): AppError {
  return new AppError({
    code: ERROR_CODES.INVALID_REQUEST,
    message,
    phase: "validation",
    retryable: false,
    statusCode: 400,
    details
  });
}
