const DEFAULT_GATEWAY_URL = "http://127.0.0.1:18789";
const DEFAULT_RESPONSES_PATH = "/v1/responses";
const DEFAULT_HEALTH_PATH = "/health";
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

export interface OpenClawProbeOptions {
  gatewayUrl?: string;
  responsesPath?: string;
  authToken?: string;
  authPassword?: string;
  agentId?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface OpenClawProbeResult {
  healthy: boolean;
  reachable: boolean;
  statusCode: number | null;
  requestUrl: string;
  reason: string;
}

export async function probeOpenClawGateway(options: OpenClawProbeOptions = {}): Promise<OpenClawProbeResult> {
  const gatewayUrl = normalizeBaseUrl(options.gatewayUrl ?? DEFAULT_GATEWAY_URL);
  const requestUrl = `${gatewayUrl}${DEFAULT_HEALTH_PATH}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(requestUrl, {
      method: "GET",
      headers: buildAuthHeaders(pickAuthSecret(options)),
      signal: controller.signal
    });

    return {
      healthy: response.ok,
      reachable: true,
      statusCode: response.status,
      requestUrl,
      reason: response.ok ? "probe_succeeded" : `http_${response.status}`
    };
  } catch (error) {
    return {
      healthy: false,
      reachable: false,
      statusCode: null,
      requestUrl,
      reason: isAbortError(error) ? "timeout" : "unreachable"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function probeOpenClawResponses(options: OpenClawProbeOptions = {}): Promise<OpenClawProbeResult> {
  const gatewayUrl = normalizeBaseUrl(options.gatewayUrl ?? DEFAULT_GATEWAY_URL);
  const responsesPath = normalizeResponsesPath(options.responsesPath ?? DEFAULT_RESPONSES_PATH);
  const requestUrl = `${gatewayUrl}${responsesPath}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(requestUrl, {
      method: "POST",
      headers: buildResponsesHeaders(options.agentId, pickAuthSecret(options)),
      body: JSON.stringify({
        model: options.agentId ? `openclaw:${normalizeAgentId(options.agentId)}` : "openclaw:main",
        input: "ping",
        stream: false,
        max_output_tokens: 1
      }),
      signal: controller.signal
    });

    return {
      healthy: response.ok,
      reachable: true,
      statusCode: response.status,
      requestUrl,
      reason: response.ok ? "probe_succeeded" : `http_${response.status}`
    };
  } catch (error) {
    return {
      healthy: false,
      reachable: false,
      statusCode: null,
      requestUrl,
      reason: isAbortError(error) ? "timeout" : "unreachable"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function probeOpenClaw(options: OpenClawProbeOptions = {}): Promise<OpenClawProbeResult> {
  return probeOpenClawResponses(options);
}

function buildResponsesHeaders(agentId: string | undefined, authSecret?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-openclaw-agent-id": normalizeAgentId(agentId),
    "x-openclaw-session-key": `probe:${Date.now()}`
  };

  if (authSecret) {
    headers.authorization = `Bearer ${authSecret}`;
  }

  return headers;
}

function buildAuthHeaders(authSecret?: string): Record<string, string> {
  if (!authSecret) {
    return {};
  }

  return {
    authorization: `Bearer ${authSecret}`
  };
}

function pickAuthSecret(options: OpenClawProbeOptions): string | undefined {
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
  return baseUrl.replace(/\/+$/, "");
}

function normalizeResponsesPath(value: string): string {
  const normalized = value.trim() || DEFAULT_RESPONSES_PATH;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}
