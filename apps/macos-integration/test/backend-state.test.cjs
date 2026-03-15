const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveBackendUiState } = require("../dist/backend-state.js");

test("resolveBackendUiState reports OpenClaw connected when OpenClaw is the active backend", () => {
  const state = resolveBackendUiState({
    status: "ok",
    selection_mode: "auto",
    requested_backend: null,
    default_backend: "openclaw",
    fast_path_backend: "openclaw",
    fast_path_available: true,
    setup_required: false,
    backends: [
      {
        id: "openclaw",
        display_name: "OpenClaw",
        configured: true,
        healthy: true,
        available: true,
        preferred: true,
        source: "auto",
        supported_actions: ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"],
        supports_fast_path: true,
        default_runner: "openclaw",
        fast_path_runner: "openclaw_responses"
      }
    ]
  });

  assert.equal(state.kind, "openclaw_connected");
  assert.equal(state.fastPathAvailable, true);
  assert.equal(state.supportsSendToClaw, true);
});

test("resolveBackendUiState reports API backend active when fallback backend is selected", () => {
  const state = resolveBackendUiState({
    status: "ok",
    selection_mode: "manual",
    requested_backend: "openai_compatible",
    default_backend: "openai_compatible",
    fast_path_backend: null,
    fast_path_available: false,
    setup_required: false,
    backends: [
      {
        id: "openai_compatible",
        display_name: "API Key",
        configured: true,
        healthy: true,
        available: true,
        preferred: true,
        source: "manual",
        supported_actions: ["ask_claw", "summarize", "explain", "rewrite"],
        supports_fast_path: false,
        default_runner: "model",
        fast_path_runner: null
      }
    ]
  });

  assert.equal(state.kind, "api_backend_active");
  assert.equal(state.supportsSendToClaw, false);
});

test("resolveBackendUiState reports setup required when no backend is available", () => {
  const state = resolveBackendUiState({
    status: "ok",
    selection_mode: "auto",
    requested_backend: null,
    default_backend: null,
    fast_path_backend: null,
    fast_path_available: false,
    setup_required: true,
    selection_error: {
      code: "BACKEND_SETUP_REQUIRED",
      message: "No available backend is configured."
    },
    backends: []
  });

  assert.equal(state.kind, "setup_required");
  assert.match(state.detail, /no available backend/i);
});
