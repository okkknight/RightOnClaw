import { randomUUID } from "node:crypto";

type ActionName = "summarize" | "rewrite" | "send_to_claw" | "explain";

type ActionResult = {
  title?: string;
  content?: string | null;
  session_id?: string | null;
  webui_url?: string | null;
  delivery?: {
    preferred_mode: string;
    fallback_modes: string[];
  };
};

type ActionError = {
  code?: string;
  message?: string;
};

type ActionResponse = {
  request_id?: string;
  action?: ActionName;
  status?: "ok" | "partial" | "error" | string;
  result?: ActionResult | null;
  error?: ActionError | null;
  meta?: Record<string, unknown>;
};

const DEFAULT_HOST = process.env.RIGHTONCLAW_HOST ?? "127.0.0.1";
const DEFAULT_PORT = process.env.RIGHTONCLAW_PORT ?? "48765";
const DEFAULT_BASE_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
const BRIDGE_BASE_URL = (process.env.RIGHTONCLAW_BRIDGE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
const BRIDGE_API_BASE_URL = `${BRIDGE_BASE_URL}/v1`;
const REQUEST_TIMEOUT_MS = parsePositiveInteger(process.env.RIGHTONCLAW_SMOKE_TIMEOUT_MS, 90_000);

async function main(): Promise<void> {
  console.log("RightOnClaw OpenClaw smoke test");

  const summarizeResponse = await runSmokeTest({
    label: "summarize",
    path: "/actions/summarize",
    body: buildTextActionRequest("summarize", "RightOnClaw integrates macOS with OpenClaw.")
  });

  assertOkStatus(summarizeResponse, "summarize");
  assertNonEmptyContent(summarizeResponse, "summarize");
  console.log("OK summarize");

  const explainResponse = await runSmokeTest({
    label: "explain",
    path: "/actions/explain",
    body: buildTextActionRequest(
      "explain",
      "export RIGHTONCLAW_OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789"
    )
  });

  assertOkStatus(explainResponse, "explain");
  assertNonEmptyContent(explainResponse, "explain");
  console.log("OK explain");

  const rewriteResponse = await runSmokeTest({
    label: "rewrite",
    path: "/actions/rewrite",
    body: buildTextActionRequest(
      "rewrite",
      "RightOnClaw makes it easier to route desktop context into OpenClaw actions."
    )
  });

  assertOkStatus(rewriteResponse, "rewrite");
  assertNonEmptyContent(rewriteResponse, "rewrite");
  console.log("OK rewrite");

  const sendToClawResponse = await runSmokeTest({
    label: "send_to_claw",
    path: "/actions/send-to-claw",
    body: buildTextActionRequest(
      "send_to_claw",
      "Smoke test context: verify bridge to OpenClaw Gateway session creation."
    )
  });

  assertOkStatus(sendToClawResponse, "send_to_claw");
  assertSessionId(sendToClawResponse);
  console.log("OK send_to_claw");
  console.log(`session_id: ${sendToClawResponse.result?.session_id}`);

  if (typeof sendToClawResponse.result?.webui_url === "string" && sendToClawResponse.result.webui_url.length > 0) {
    console.log(`webui_url: ${sendToClawResponse.result.webui_url}`);
  }

  console.log("");
  console.log("All tests passed.");
}

function buildTextActionRequest(action: ActionName, text: string) {
  return {
    version: "1.0",
    request_id: randomUUID(),
    action,
    source: {
      platform: "smoke-test",
      entry: "smoke_test"
    },
    selection: {
      kind: "text",
      text,
      paths: [],
      char_count: text.length
    },
    options: {
      session_strategy: "new"
    }
  };
}

async function runSmokeTest(input: {
  label: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<ActionResponse> {
  const requestUrl = `${BRIDGE_API_BASE_URL}${input.path}`;
  console.log(`-> ${input.label}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(input.body),
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(formatFailureMessage(input.label, response.status, payload));
    }

    return payload;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `${input.label} timed out after ${REQUEST_TIMEOUT_MS}ms while calling ${requestUrl}.`
      );
    }

    throw new Error(`${input.label} request to ${requestUrl} failed: ${stringifyError(error)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (process.env.RIGHTONCLAW_LOCAL_TOKEN) {
    headers["x-rightonclaw-token"] = process.env.RIGHTONCLAW_LOCAL_TOKEN;
  }

  return headers;
}

async function readJsonResponse(response: Response): Promise<ActionResponse> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawText) as ActionResponse;
  } catch (error) {
    throw new Error(
      `Bridge returned a non-JSON response with HTTP ${response.status}: ${truncate(rawText)} (${stringifyError(error)})`
    );
  }
}

function assertOkStatus(response: ActionResponse, action: ActionName): void {
  if (response.status !== "ok") {
    throw new Error(
      `${action} returned status ${String(response.status)} instead of ok.${formatStructuredErrorSuffix(response)}`
    );
  }
}

function assertNonEmptyContent(response: ActionResponse, action: ActionName): void {
  if (typeof response.result?.content !== "string" || response.result.content.trim().length === 0) {
    throw new Error(`${action} succeeded but result.content was empty.`);
  }
}

function assertSessionId(response: ActionResponse): void {
  if (typeof response.result?.session_id !== "string" || response.result.session_id.trim().length === 0) {
    throw new Error("send_to_claw succeeded but result.session_id was empty.");
  }
}

function formatFailureMessage(label: string, statusCode: number, response: ActionResponse): string {
  return `${label} failed with HTTP ${statusCode}.${formatStructuredErrorSuffix(response)}`;
}

function formatStructuredErrorSuffix(response: ActionResponse): string {
  if (response.error?.message) {
    const code = response.error.code ? ` (${response.error.code})` : "";
    return ` ${response.error.message}${code}`;
  }

  return "";
}

function truncate(input: string, maxLength = 240): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function parsePositiveInteger(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }

  const parsed = Number(input);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSmoke test failed: ${message}`);
  process.exit(1);
});
