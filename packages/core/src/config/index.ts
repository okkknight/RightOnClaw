import fs from "node:fs";
import path from "node:path";

export interface BridgeConfig {
  host: string;
  port: number;
  version: string;
  bodyLimitBytes: number;
  requestTimeoutMs: number;
  openClawClientMode: "mock" | "real";
  openClawBaseUrl: string;
  openClawGatewayUrl: string;
  openClawGatewayToken?: string;
  openClawGatewayPassword?: string;
  openClawAgentId: string;
  openClawRequestTimeoutMs: number;
  openClawResponsesPath: string;
  openClawSendToClawMaxOutputTokens: number;
  openClawGenerationMaxOutputTokens?: number;
  openClawFastProfile: boolean;
  fastPathMaxInputLength: number;
  summarizeFastPathEnabled: boolean;
  explainFastPathEnabled: boolean;
  allowedOrigins: string[];
  localToken?: string;
}

export function loadBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const openClawBaseUrl = env.RIGHTONCLAW_OPENCLAW_BASE_URL ?? "http://127.0.0.1:3000";
  const openClawGatewayUrl =
    env.RIGHTONCLAW_OPENCLAW_GATEWAY_URL ??
    (env.RIGHTONCLAW_OPENCLAW_BASE_URL ? openClawBaseUrl : "http://127.0.0.1:18789");
  const localGatewayConfig = shouldPreferLocalOpenClawConfig(openClawBaseUrl, openClawGatewayUrl)
    ? readLocalOpenClawGatewayConfig(env)
    : null;
  const openClawFastProfile = parseBooleanFlag(env.RIGHTONCLAW_OPENCLAW_FAST_PROFILE);
  const explicitGenerationMaxOutputTokens = parseOptionalNumber(env.RIGHTONCLAW_OPENCLAW_GENERATION_MAX_OUTPUT_TOKENS);

  return {
    host: env.RIGHTONCLAW_HOST ?? "127.0.0.1",
    port: parseNumber(env.RIGHTONCLAW_PORT, 48765),
    version: env.RIGHTONCLAW_VERSION ?? "0.1.0",
    bodyLimitBytes: parseNumber(env.RIGHTONCLAW_BODY_LIMIT_BYTES, 1024 * 1024),
    requestTimeoutMs: parseNumber(env.RIGHTONCLAW_REQUEST_TIMEOUT_MS, 75_000),
    openClawClientMode: parseClientMode(env.RIGHTONCLAW_OPENCLAW_CLIENT_MODE),
    openClawBaseUrl,
    openClawGatewayUrl,
    openClawGatewayToken: (localGatewayConfig?.token ?? env.RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN) || undefined,
    openClawGatewayPassword:
      (localGatewayConfig?.password ?? env.RIGHTONCLAW_OPENCLAW_GATEWAY_PASSWORD) || undefined,
    openClawAgentId: env.RIGHTONCLAW_OPENCLAW_AGENT_ID ?? "main",
    openClawRequestTimeoutMs: parseNumber(
      env.RIGHTONCLAW_OPENCLAW_REQUEST_TIMEOUT_MS,
      parseNumber(env.RIGHTONCLAW_REQUEST_TIMEOUT_MS, 75_000)
    ),
    openClawResponsesPath: env.RIGHTONCLAW_OPENCLAW_RESPONSES_PATH ?? "/v1/responses",
    openClawSendToClawMaxOutputTokens: parseNumber(env.RIGHTONCLAW_OPENCLAW_SEND_TO_CLAW_MAX_OUTPUT_TOKENS, 32),
    openClawGenerationMaxOutputTokens: explicitGenerationMaxOutputTokens ?? (openClawFastProfile ? 120 : undefined),
    openClawFastProfile,
    fastPathMaxInputLength: parseNumber(env.RIGHTONCLAW_FAST_PATH_MAX_INPUT_LENGTH, 1200),
    summarizeFastPathEnabled: parseBooleanFlag(env.RIGHTONCLAW_SUMMARIZE_FAST_PATH),
    explainFastPathEnabled: parseBooleanFlag(env.RIGHTONCLAW_EXPLAIN_FAST_PATH),
    allowedOrigins: parseList(env.RIGHTONCLAW_ALLOWED_ORIGINS),
    localToken: env.RIGHTONCLAW_LOCAL_TOKEN || undefined
  };
}

function parseClientMode(input: string | undefined): "mock" | "real" {
  return input?.trim().toLowerCase() === "mock" ? "mock" : "real";
}

function parseNumber(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function parseOptionalNumber(input: string | undefined): number | undefined {
  if (!input) {
    return undefined;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

function parseList(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseBooleanFlag(input: string | undefined): boolean {
  if (!input) {
    return false;
  }

  const normalized = input.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

interface LocalOpenClawGatewayConfig {
  token?: string;
  password?: string;
}

function shouldPreferLocalOpenClawConfig(openClawBaseUrl: string, openClawGatewayUrl: string): boolean {
  return isLoopbackUrl(openClawBaseUrl) && isLoopbackUrl(openClawGatewayUrl);
}

function isLoopbackUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  } catch {
    return false;
  }
}

function readLocalOpenClawGatewayConfig(env: NodeJS.ProcessEnv): LocalOpenClawGatewayConfig | null {
  const configPath = env.OPENCLAW_CONFIG_PATH ?? path.join(env.HOME ?? "", ".openclaw", "openclaw.json");

  if (!configPath || !fs.existsSync(configPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      gateway?: {
        auth?: {
          token?: unknown;
          password?: unknown;
        };
      };
    };
    const token = readTrimmedString(parsed.gateway?.auth?.token);
    const password = readTrimmedString(parsed.gateway?.auth?.password);

    if (!token && !password) {
      return null;
    }

    return {
      token,
      password
    };
  } catch {
    return null;
  }
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
