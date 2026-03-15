import { AppError, ERROR_CODES } from "@rightonclaw/core";
import type { ResolvedCredential } from "@rightonclaw/credential-layer";
import type { SharedCredentialValue } from "@rightonclaw/credential-layer";

export interface OpenClawResponsesGenerateInput {
  prompt: string;
  credential: ResolvedCredential;
  requestId?: string;
  sessionId?: string;
  maxOutputTokens?: number;
}

export interface OpenClawResponsesGenerateResult {
  text: string;
  model?: string;
}

export interface OpenClawResponsesClient {
  generateText(input: OpenClawResponsesGenerateInput): Promise<OpenClawResponsesGenerateResult>;
}

export interface HttpOpenClawResponsesClientOptions {
  requestTimeoutMs?: number;
  responsesPath?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_RESPONSES_PATH = "/v1/responses";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class HttpOpenClawResponsesClient implements OpenClawResponsesClient {
  private readonly requestTimeoutMs: number;
  private readonly responsesPath: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: HttpOpenClawResponsesClientOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.responsesPath = normalizeResponsesPath(options.responsesPath ?? DEFAULT_RESPONSES_PATH);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async generateText(input: OpenClawResponsesGenerateInput): Promise<OpenClawResponsesGenerateResult> {
    const transport = resolveTransport(input.credential);
    const requestUrl = `${transport.baseUrl}${this.responsesPath}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(requestUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...transport.headers,
          ...(input.sessionId
            ? {
                "x-openclaw-session-key": input.sessionId
              }
            : {})
        },
        body: JSON.stringify({
          input: input.prompt,
          stream: false,
          ...(transport.model
            ? {
                model: transport.model
              }
            : {}),
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
          message: extractUpstreamMessage(payload) ?? `OpenClaw responses request failed with HTTP ${response.status}.`,
          phase: "generation",
          retryable: response.status >= 500 || response.status === 429,
          statusCode: response.status >= 500 || response.status === 429 ? 502 : 500,
          details: {
            request_id: input.requestId,
            upstream_status: response.status,
            request_url: requestUrl
          }
        });
      }

      return {
        text: extractResponseText(payload),
        model: readString(payload, "model") ?? transport.model ?? undefined
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError({
        code: isAbortError(error) ? ERROR_CODES.OPENCLAW_TIMEOUT : ERROR_CODES.GENERATION_FAILED,
        message: isAbortError(error)
          ? "Timed out while contacting the OpenClaw responses fast path."
          : `OpenClaw responses fast-path request failed: ${error instanceof Error ? error.message : String(error)}`,
        phase: "generation",
        retryable: isAbortError(error),
        statusCode: isAbortError(error) ? 504 : 502,
        details: {
          request_id: input.requestId,
          request_url: requestUrl
        }
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function resolveTransport(credential: ResolvedCredential): {
  baseUrl: string;
  model?: string;
  headers: Record<string, string>;
} {
  if (credential.kind === "shared_reference") {
    const value = (credential.value ?? {}) as SharedCredentialValue;
    const headers: Record<string, string> = {};

    if (value.gatewayToken) {
      headers.authorization = `Bearer ${value.gatewayToken}`;
    } else if (value.gatewayPassword) {
      headers["x-api-key"] = value.gatewayPassword;
    }

    if (value.agentId) {
      headers["x-openclaw-agent-id"] = value.agentId;
    }

    return {
      baseUrl: normalizeBaseUrl(value.gatewayUrl ?? value.baseUrl ?? "http://127.0.0.1:18789"),
      model: value.agentId ? `openclaw:${value.agentId}` : undefined,
      headers
    };
  }

  if (credential.provider === "chatgpt_auth" && credential.value && typeof credential.value === "object") {
    const value = credential.value as Record<string, unknown>;
    const accessToken =
      readUnknownString(value.accessToken) ??
      readUnknownString(value.token) ??
      readUnknownString(value.bearerToken) ??
      readUnknownString(value.apiKey);
    const baseUrl =
      readUnknownString(value.gatewayUrl) ??
      readUnknownString(value.baseUrl) ??
      "https://api.openai.com";
    const model = readUnknownString(value.model);

    if (!accessToken) {
      throw unsupportedCredentialError(credential.kind, credential.provider);
    }

    return {
      baseUrl: normalizeBaseUrl(baseUrl),
      model: model ?? undefined,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    };
  }

  throw unsupportedCredentialError(credential.kind, credential.provider);
}

function unsupportedCredentialError(kind: string, provider: string): AppError {
  return new AppError({
    code: ERROR_CODES.GENERATION_FAILED,
    message: `Unsupported credential kind ${kind} from provider ${provider} for OpenClaw responses execution.`,
    phase: "generation",
    retryable: false,
    statusCode: 500,
    details: {
      credential_kind: kind,
      credential_provider: provider
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

  throw emptyResponseError();
}

function emptyResponseError(): AppError {
  return new AppError({
    code: ERROR_CODES.GENERATION_FAILED,
    message: "OpenClaw responses fast path completed the request but returned no assistant text.",
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
  return error instanceof DOMException ? error.name === "AbortError" : false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(payload: unknown, key: string): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readArray(payload: unknown, key: string): unknown[] {
  if (!isRecord(payload)) {
    return [];
  }

  const value = payload[key];
  return Array.isArray(value) ? value : [];
}

function readUnknownString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
