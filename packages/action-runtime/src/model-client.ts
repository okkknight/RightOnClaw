import { AppError, ERROR_CODES } from "@rightonclaw/core";
import type { ResolvedCredential } from "@rightonclaw/credential-layer";
import type { ApiKeyCredentialValue, SharedCredentialValue } from "@rightonclaw/credential-layer";

export interface ModelClientGenerateInput {
  prompt: string;
  credential: ResolvedCredential;
  target?: string;
  requestId?: string;
  maxOutputTokens?: number;
}

export interface ModelClientGenerateResult {
  text: string;
  model?: string;
}

export interface ModelClient {
  generateText(input: ModelClientGenerateInput): Promise<ModelClientGenerateResult>;
}

export interface HttpModelClientOptions {
  defaultBaseUrl?: string;
  defaultModel?: string;
  requestTimeoutMs?: number;
  responsesPath?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL_NAME = "gpt-4.1-mini";
const DEFAULT_RESPONSES_PATH = "/v1/responses";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class HttpModelClient implements ModelClient {
  private readonly defaultBaseUrl: string;
  private readonly defaultModel: string;
  private readonly requestTimeoutMs: number;
  private readonly responsesPath: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: HttpModelClientOptions = {}) {
    this.defaultBaseUrl = normalizeBaseUrl(options.defaultBaseUrl ?? DEFAULT_MODEL_BASE_URL);
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL_NAME;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.responsesPath = normalizeResponsesPath(options.responsesPath ?? DEFAULT_RESPONSES_PATH);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async generateText(input: ModelClientGenerateInput): Promise<ModelClientGenerateResult> {
    const resolved = resolveTransport(input.credential, {
      defaultBaseUrl: this.defaultBaseUrl,
      defaultModel: this.defaultModel
    });
    const requestUrl = `${resolved.baseUrl}${this.responsesPath}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(requestUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...resolved.headers
        },
        body: JSON.stringify({
          model: resolved.model,
          input: input.prompt,
          stream: false,
          ...(typeof input.maxOutputTokens === "number"
            ? {
                max_output_tokens: input.maxOutputTokens
              }
            : {})
        }),
        signal: controller.signal
      });

      const rawText = await response.text();
      const payload = parsePayload(rawText);

      if (!response.ok) {
        throw new AppError({
          code: ERROR_CODES.GENERATION_FAILED,
          message: extractUpstreamMessage(payload) ?? `Model upstream request failed with HTTP ${response.status}.`,
          phase: "generation",
          retryable: response.status >= 500 || response.status === 429,
          statusCode: response.status >= 500 || response.status === 429 ? 502 : 500,
          details: {
            target: input.target,
            request_id: input.requestId,
            upstream_status: response.status
          }
        });
      }

      return {
        text: extractResponseText(payload),
        model: readString(payload, "model") ?? resolved.model
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError({
        code: isAbortError(error) ? ERROR_CODES.OPENCLAW_TIMEOUT : ERROR_CODES.GENERATION_FAILED,
        message: isAbortError(error)
          ? "Timed out while contacting the model executor upstream."
          : `Model executor request failed: ${error instanceof Error ? error.message : String(error)}`,
        phase: "generation",
        retryable: isAbortError(error),
        statusCode: isAbortError(error) ? 504 : 502,
        details: {
          target: input.target,
          request_id: input.requestId,
          request_url: requestUrl
        }
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function resolveTransport(
  credential: ResolvedCredential,
  defaults: {
    defaultBaseUrl: string;
    defaultModel: string;
  }
): {
  baseUrl: string;
  model: string;
  headers: Record<string, string>;
} {
  if (credential.kind === "api_key") {
    const value = (credential.value ?? {}) as ApiKeyCredentialValue;
    return {
      baseUrl: normalizeBaseUrl(value.baseUrl ?? defaults.defaultBaseUrl),
      model: value.model ?? defaults.defaultModel,
      headers: {
        authorization: `Bearer ${value.apiKey}`
      }
    };
  }

  if (credential.kind === "shared_reference") {
    const value = (credential.value ?? {}) as SharedCredentialValue;
    const headers: Record<string, string> = {};

    if (value.gatewayToken) {
      headers.authorization = `Bearer ${value.gatewayToken}`;
    } else if (value.gatewayPassword) {
      headers["x-api-key"] = value.gatewayPassword;
    }

    return {
      baseUrl: normalizeBaseUrl(value.gatewayUrl ?? value.baseUrl ?? defaults.defaultBaseUrl),
      model: value.agentId ? `openclaw:${value.agentId}` : defaults.defaultModel,
      headers
    };
  }

  throw new AppError({
    code: ERROR_CODES.GENERATION_FAILED,
    message: `Unsupported credential kind ${credential.kind} for model execution.`,
    phase: "generation",
    retryable: false,
    statusCode: 500,
    details: {
      credential_kind: credential.kind
    }
  });
}

function parsePayload(rawText: string): unknown {
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return null;
  }
}

function extractUpstreamMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  return typeof payload.message === "string" ? payload.message : null;
}

function extractResponseText(payload: unknown): string {
  if (!payload) {
    throw emptyResponseError();
  }

  const outputText = readString(payload, "output_text");
  if (outputText) {
    return outputText;
  }

  const output = readArray(payload, "output");
  for (const item of output) {
    if (!isRecord(item) || readString(item, "type") !== "message") {
      continue;
    }

    const content = readArray(item, "content");
    const text = content
      .filter(isRecord)
      .filter((entry) => readString(entry, "type") === "output_text")
      .map((entry) => readString(entry, "text") ?? "")
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (text) {
      return text;
    }
  }

  const choices = readArray(payload, "choices");
  const choiceMessageContent = choices
    .filter(isRecord)
    .map((choice) => choice.message)
    .filter(isRecord)
    .map((message) => readString(message, "content"))
    .find(Boolean);

  if (choiceMessageContent) {
    return choiceMessageContent;
  }

  throw emptyResponseError();
}

function emptyResponseError(): AppError {
  return new AppError({
    code: ERROR_CODES.GENERATION_FAILED,
    message: "Model upstream completed the request but returned no assistant text.",
    phase: "generation",
    retryable: false,
    statusCode: 502
  });
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeResponsesPath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const candidate = value[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function readArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : [];
}
