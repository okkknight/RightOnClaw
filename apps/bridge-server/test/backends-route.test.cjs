const test = require("node:test");
const assert = require("node:assert/strict");

const { buildApp } = require("../dist/app.js");
const { createStaticBackendSelectionResolver, BackendSelectionService } = require("../dist/backends/selection.js");

test("GET /v1/backends returns the backend selection snapshot", async () => {
  const app = buildApp({
    backendSelectionResolver: createStaticBackendSelectionResolver({
      selection_mode: "auto",
      default_backend: "openclaw",
      fast_path_backend: "openclaw",
      fast_path_available: true,
      backends: [
        {
          id: "openclaw",
          display_name: "OpenClaw",
          configured: true,
          healthy: true,
          available: true,
          preferred: true,
          source: "auto",
          reason: "probe_succeeded",
          supported_actions: ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"],
          supports_fast_path: true,
          default_runner: "openclaw",
          fast_path_runner: "openclaw_responses"
        },
        {
          id: "openai_compatible",
          display_name: "API Key",
          configured: false,
          healthy: false,
          available: false,
          preferred: false,
          source: "manual",
          reason: "no_api_backend_credential",
          supported_actions: ["ask_claw", "summarize", "explain", "rewrite"],
          supports_fast_path: false,
          default_runner: "model",
          fast_path_runner: null
        }
      ]
    })
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/backends"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.status, "ok");
    assert.equal(payload.default_backend, "openclaw");
    assert.equal(payload.fast_path_available, true);
    assert.equal(payload.backends.length, 2);
  } finally {
    await app.close();
  }
});

test("backend selection service prefers OpenClaw in auto mode and falls back to API backend", async () => {
  const selection = new BackendSelectionService({
    discovery: {
      async discover() {
        return [
          {
            id: "openclaw",
            display_name: "OpenClaw",
            configured: false,
            healthy: false,
            available: false,
            preferred: false,
            source: "auto",
            reason: "unreachable",
            supported_actions: ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"],
            supports_fast_path: false,
            default_runner: "openclaw",
            fast_path_runner: "openclaw_responses"
          },
          {
            id: "openai_compatible",
            display_name: "API Key",
            configured: true,
            healthy: true,
            available: true,
            preferred: false,
            source: "manual",
            reason: "api_key_resolved",
            supported_actions: ["ask_claw", "summarize", "explain", "rewrite"],
            supports_fast_path: false,
            default_runner: "model",
            fast_path_runner: null
          }
        ];
      }
    },
    selectionMode: "auto",
    selectedBackend: null,
    summarizeFastPathEnabled: true,
    explainFastPathEnabled: true
  });

  const snapshot = await selection.resolve();

  assert.equal(snapshot.default_backend, "openai_compatible");
  assert.equal(snapshot.fast_path_available, false);
  assert.equal(snapshot.setup_required, false);
});

test("backend selection service does not silently switch in manual mode", async () => {
  const selection = new BackendSelectionService({
    discovery: {
      async discover() {
        return [
          {
            id: "openclaw",
            display_name: "OpenClaw",
            configured: false,
            healthy: false,
            available: false,
            preferred: false,
            source: "manual",
            reason: "http_503",
            supported_actions: ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"],
            supports_fast_path: false,
            default_runner: "openclaw",
            fast_path_runner: "openclaw_responses"
          }
        ];
      }
    },
    selectionMode: "manual",
    selectedBackend: "openclaw",
    summarizeFastPathEnabled: true,
    explainFastPathEnabled: true
  });

  const snapshot = await selection.resolve();

  assert.equal(snapshot.default_backend, null);
  assert.equal(snapshot.setup_required, true);
  assert.equal(snapshot.selection_error.code, "BACKEND_UNAVAILABLE");
  assert.equal(snapshot.requested_backend, "openclaw");
});
