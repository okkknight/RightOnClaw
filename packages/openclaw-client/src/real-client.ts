import { randomUUID } from "node:crypto";

import { AppError, ERROR_CODES, type ErrorCode } from "@rightonclaw/core";

import type { OpenClawClient, OpenClawSessionRecord } from "./client";

const DEFAULT_CONTROL_UI_URL = "http://127.0.0.1:3000";
const DEFAULT_GATEWAY_URL = "http://127.0.0.1:18789";
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_RESPONSES_PATH = "/v1/responses";
const DEFAULT_SEND_TO_CLAW_MAX_OUTPUT_TOKENS = 32;

type OperationPurpose = "message_send" | "generation";

type ResponsesRunResult = {
  model?: string;
  text?: string;
};

type SessionState = OpenClawSessionRecord & {
  pendingUserMessage?: string;
  lastModel?: string;
};

export interface RealOpenClawClientOptions {
  baseUrl?: string;
  gatewayUrl?: string;
  authToken?: string;
  authPassword?: string;
  agentId?: string;
  requestTimeoutMs?: number;
  responsesPath?: string;
  sendToClawMaxOutputTokens?: number;
  generationMaxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

export class RealOpenClawClient implements OpenClawClient {
  private readonly baseUrl: string;
  private readonly gatewayUrl: string;
  private readonly authSecret?: string;
  private readonly agentId: string;
  private readonly requestTimeoutMs: number;
  private readonly responsesPath: string;
  private readonly sendToClawMaxOutputTokens: number;
  private readonly generationMaxOutputTokens?: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sessions = new Map<string, SessionState>();
  private latestSessionId: string | null = null;

  public constructor(options: RealOpenClawClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_CONTROL_UI_URL);
    this.gatewayUrl = normalizeBaseUrl(options.gatewayUrl ?? DEFAULT_GATEWAY_URL);
    this.authSecret = pickAuthSecret(options);
    this.agentId = normalizeAgentId(options.agentId);
    this.requestTimeoutMs = normalizeTimeoutMs(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    this.responsesPath = normalizeResponsesPath(options.responsesPath ?? DEFAULT_RESPONSES_PATH);
    this.sendToClawMaxOutputTokens = normalizePositiveInteger(
      options.sendToClawMaxOutputTokens,
      DEFAULT_SEND_TO_CLAW_MAX_OUTPUT_TOKENS
    );
    this.generationMaxOutputTokens = normalizeOptionalPositiveInteger(options.generationMaxOutputTokens);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async createSession(input?: { title?: string }): Promise<{ sessionId: string }> {
    const now = Date.now();
    const sessionId = buildSessionKey(this.agentId);

    this.sessions.set(sessionId, {
      sessionId,
      title: input?.title,
      createdAt: now,
      updatedAt: now,
      messages: []
    });

    return { sessionId };
  }

  public async getLatestSession(): Promise<{ sessionId: string } | null> {
    if (this.latestSessionId && this.sessions.has(this.latestSessionId)) {
      return { sessionId: this.latestSessionId };
    }

    const latest = [...this.sessions.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0];
    return latest ? { sessionId: latest.sessionId } : null;
  }

  public async sendMessage(input: { sessionId: string; role: "user"; content: string }): Promise<void> {
    const session = this.requireSession(input.sessionId);
    const now = Date.now();

    session.messages.push({
      role: input.role,
      content: input.content,
      createdAt: now
    });
    session.pendingUserMessage = input.content;
    session.updatedAt = now;
  }

  public async generateAssistantResponse(input: { sessionId: string }): Promise<{ text: string; model?: string }> {
    const session = this.requireSession(input.sessionId);
    const prompt = this.requirePendingUserMessage(session, ERROR_CODES.GENERATION_FAILED, "No user message available for generation.");
    const result = await this.runResponsesTurn(session, {
      prompt,
      purpose: "generation",
      expectText: true,
      maxOutputTokens: this.generationMaxOutputTokens
    });

    return {
      text: result.text ?? "No response from OpenClaw.",
      model: result.model
    };
  }

  public async getSessionWebUrl(input: { sessionId: string }): Promise<string | null> {
    const session = this.requireSession(input.sessionId);

    if (session.pendingUserMessage) {
      await this.runResponsesTurn(session, {
        prompt: session.pendingUserMessage,
        purpose: "message_send",
        expectText: false,
        maxOutputTokens: this.sendToClawMaxOutputTokens
      });
    }

    return buildChatUrl(this.baseUrl, session.sessionId);
  }

  private requireSession(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new AppError({
        code: ERROR_CODES.OPENCLAW_UNAVAILABLE,
        message: `Unknown OpenClaw session ${sessionId}.`,
        phase: "generation",
        retryable: true,
        statusCode: 502,
        details: {
          session_id: sessionId
        }
      });
    }

    return session;
  }

  private requirePendingUserMessage(session: SessionState, code: ErrorCode, message: string): string {
    const prompt = session.pendingUserMessage?.trim();

    if (!prompt) {
      throw new AppError({
        code,
        message,
        phase: "generation",
        retryable: false,
        statusCode: 500,
        details: {
          session_id: session.sessionId
        }
      });
    }

    return prompt;
  }

  private async runResponsesTurn(
    session: SessionState,
    input: {
      prompt: string;
      purpose: OperationPurpose;
      expectText: boolean;
      maxOutputTokens?: number;
    }
  ): Promise<ResponsesRunResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const requestUrl = `${this.gatewayUrl}${this.responsesPath}`;
    const requestBody = {
      model: `openclaw:${this.agentId}`,
      input: input.prompt,
      stream: false,
      ...(typeof input.maxOutputTokens === "number"
        ? {
            max_output_tokens: input.maxOutputTokens
          }
        : {})
    };

    let response: Response;

    try {
      response = await this.fetchImpl(requestUrl, {
        method: "POST",
        headers: buildHeaders(session.sessionId, this.agentId, this.authSecret),
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeoutId);
      throw toTransportError(error, input.purpose, requestUrl);
    }

    clearTimeout(timeoutId);

    const { payload, rawText } = await readResponsePayload(response);

    if (!response.ok) {
      throw toUpstreamHttpError(response.status, payload, rawText, input.purpose);
    }

    const model = readString(payload, "model") ?? session.lastModel;
    const text = input.expectText ? extractResponseText(payload) : undefined;
    const now = Date.now();

    session.pendingUserMessage = undefined;
    session.updatedAt = now;
    session.lastModel = model;
    this.latestSessionId = session.sessionId;

    if (input.expectText) {
      session.messages.push({
        role: "assistant",
        content: text ?? "",
        createdAt: now
      });
    }

    return {
      model,
      text
    };
  }
}

function buildHeaders(sessionId: string, agentId: string, authSecret?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-openclaw-agent-id": agentId,
    "x-openclaw-session-key": sessionId
  };

  if (authSecret) {
    headers.authorization = `Bearer ${authSecret}`;
  }

  return headers;
}

function buildSessionKey(agentId: string): string {
  return `agent:${agentId}:rightonclaw:${randomUUID()}`;
}

function buildChatUrl(baseUrl: string, sessionId: string): string | null {
  try {
    const url = new URL(`${baseUrl}/chat`);
    url.searchParams.set("session", sessionId);
    return url.toString();
  } catch {
    return null;
  }
}

function pickAuthSecret(options: RealOpenClawClientOptions): string | undefined {
  const token = options.authToken?.trim();
  if (token) {
    return token;
  }

  const password = options.authPassword?.trim();
  return password ? password : undefined;
}

function normalizeAgentId(agentId: string | undefined): string {
  const normalized = agentId?.trim().toLowerCase() || "main";
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : "main";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function normalizeResponsesPath(path: string): string {
  const normalized = path.trim() || DEFAULT_RESPONSES_PATH;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function normalizeOptionalPositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function normalizeTimeoutMs(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

async function readResponsePayload(response: Response): Promise<{ payload: unknown; rawText: string | null }> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {
      payload: null,
      rawText
    };
  }

  try {
    return {
      payload: JSON.parse(rawText) as unknown,
      rawText
    };
  } catch {
    return {
      payload: null,
      rawText
    };
  }
}

function extractResponseText(payload: unknown): string {
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

  throw new AppError({
    code: ERROR_CODES.GENERATION_FAILED,
    message: "OpenClaw completed the request but returned no assistant text.",
    phase: "generation",
    retryable: false,
    statusCode: 502
  });
}

function toTransportError(error: unknown, purpose: OperationPurpose, requestUrl: string): AppError {
  if (isAbortError(error)) {
    return new AppError({
      code: ERROR_CODES.OPENCLAW_TIMEOUT,
      message: `Timed out while contacting OpenClaw for ${describePurpose(purpose)}.`,
      phase: "generation",
      retryable: true,
      statusCode: 504,
      details: {
        purpose,
        request_url: requestUrl
      }
    });
  }

  return new AppError({
    code: ERROR_CODES.OPENCLAW_UNAVAILABLE,
    message: `OpenClaw is unavailable while trying to ${describePurpose(purpose)}.`,
    phase: "generation",
    retryable: true,
    statusCode: 502,
    details: {
      purpose,
      request_url: requestUrl,
      cause: error instanceof Error ? error.message : String(error)
    }
  });
}

function toUpstreamHttpError(
  status: number,
  payload: unknown,
  rawText: string | null,
  purpose: OperationPurpose
): AppError {
  const upstreamMessage =
    readNestedString(payload, ["error", "message"]) ??
    readString(payload, "message") ??
    truncateForDetails(rawText);
  const code = status >= 500 || status === 429 ? ERROR_CODES.OPENCLAW_UNAVAILABLE : toPurposeErrorCode(purpose);

  return new AppError({
    code,
    message:
      upstreamMessage ??
      `OpenClaw rejected the ${describePurpose(purpose)} request with HTTP ${status}.`,
    phase: "generation",
    retryable: status >= 500 || status === 429,
    statusCode: status >= 500 || status === 429 ? 502 : 500,
    details: {
      purpose,
      upstream_status: status
    }
  });
}

function toPurposeErrorCode(purpose: OperationPurpose): ErrorCode {
  return purpose === "message_send" ? ERROR_CODES.MESSAGE_SEND_FAILED : ERROR_CODES.GENERATION_FAILED;
}

function describePurpose(purpose: OperationPurpose): string {
  return purpose === "message_send" ? "send the message" : "generate a response";
}

function truncateForDetails(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length <= 280 ? normalized : `${normalized.slice(0, 277)}...`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value) || typeof value[key] !== "string") {
    return null;
  }

  return value[key] as string;
}

function readArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    return [];
  }

  return value[key] as unknown[];
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;

  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[key];
  }

  return typeof current === "string" ? current : null;
}
