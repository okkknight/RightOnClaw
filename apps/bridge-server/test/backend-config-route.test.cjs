const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { buildApp } = require("../dist/app.js");

const ENV_KEYS = [
  "RIGHTONCLAW_BACKEND_SETTINGS_PATH",
  "RIGHTONCLAW_OPENCLAW_GATEWAY_URL",
  "RIGHTONCLAW_OPENCLAW_BASE_URL",
  "RIGHTONCLAW_OPENCLAW_REQUEST_TIMEOUT_MS",
  "RIGHTONCLAW_REQUEST_TIMEOUT_MS",
  "RIGHTONCLAW_MODEL_API_KEY",
  "RIGHTONCLAW_MODEL_BASE_URL",
  "RIGHTONCLAW_MODEL_NAME"
];

test(
  "POST /v1/backends/configure saves API backend config and returns the refreshed backend snapshot",
  { concurrency: false },
  async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roc-backend-config-"));
    const settingsPath = path.join(tempDir, "settings.json");
    const originalEnv = captureEnv();

    process.env.RIGHTONCLAW_BACKEND_SETTINGS_PATH = settingsPath;
    process.env.RIGHTONCLAW_OPENCLAW_GATEWAY_URL = "http://127.0.0.1:9";
    process.env.RIGHTONCLAW_OPENCLAW_BASE_URL = "http://127.0.0.1:9";
    process.env.RIGHTONCLAW_OPENCLAW_REQUEST_TIMEOUT_MS = "50";
    process.env.RIGHTONCLAW_REQUEST_TIMEOUT_MS = "50";
    delete process.env.RIGHTONCLAW_MODEL_API_KEY;
    delete process.env.RIGHTONCLAW_MODEL_BASE_URL;
    delete process.env.RIGHTONCLAW_MODEL_NAME;

    const app = buildApp();

    try {
      const beforeResponse = await app.inject({
        method: "GET",
        url: "/v1/backends"
      });
      assert.equal(beforeResponse.statusCode, 200);
      const beforePayload = beforeResponse.json();
      assert.equal(beforePayload.setup_required, true);
      assert.equal(beforePayload.default_backend, null);

      const response = await app.inject({
        method: "POST",
        url: "/v1/backends/configure",
        payload: {
          backend: "openai_compatible",
          api_key: "test-api-key",
          base_url: "https://api.example.com/v1",
          model: "gpt-test"
        }
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json();
      assert.equal(payload.success, true);
      assert.equal(payload.backends.status, "ok");
      assert.equal(payload.backends.selection_mode, "manual");
      assert.equal(payload.backends.requested_backend, "openai_compatible");
      assert.equal(payload.backends.default_backend, "openai_compatible");
      assert.equal(payload.backends.setup_required, false);

      const configuredBackend = payload.backends.backends.find((backend) => backend.id === "openai_compatible");
      assert.equal(configuredBackend.available, true);
      assert.equal(configuredBackend.default_runner, "model");

      const saved = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      assert.equal(saved.selection_mode, "manual");
      assert.equal(saved.selected_backend, "openai_compatible");
      assert.equal(saved.backends.openai_compatible.enabled, true);
      assert.equal(saved.backends.openai_compatible.api_key, "test-api-key");
      assert.equal(saved.backends.openai_compatible.base_url, "https://api.example.com/v1");
      assert.equal(saved.backends.openai_compatible.model, "gpt-test");

      const afterResponse = await app.inject({
        method: "GET",
        url: "/v1/backends"
      });
      assert.equal(afterResponse.statusCode, 200);
      const afterPayload = afterResponse.json();
      assert.equal(afterPayload.default_backend, "openai_compatible");
      assert.equal(afterPayload.setup_required, false);
    } finally {
      await app.close();
      restoreEnv(originalEnv);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
);

test(
  "POST /v1/backends/configure rejects invalid payloads with INVALID_REQUEST",
  { concurrency: false },
  async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roc-backend-config-"));
    const settingsPath = path.join(tempDir, "settings.json");
    const originalEnv = captureEnv();

    process.env.RIGHTONCLAW_BACKEND_SETTINGS_PATH = settingsPath;
    process.env.RIGHTONCLAW_OPENCLAW_GATEWAY_URL = "http://127.0.0.1:9";
    process.env.RIGHTONCLAW_OPENCLAW_BASE_URL = "http://127.0.0.1:9";
    process.env.RIGHTONCLAW_OPENCLAW_REQUEST_TIMEOUT_MS = "50";
    process.env.RIGHTONCLAW_REQUEST_TIMEOUT_MS = "50";
    delete process.env.RIGHTONCLAW_MODEL_API_KEY;
    delete process.env.RIGHTONCLAW_MODEL_BASE_URL;
    delete process.env.RIGHTONCLAW_MODEL_NAME;

    const app = buildApp();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/backends/configure",
        payload: {
          backend: "openai_compatible",
          api_key: "test-api-key",
          base_url: "notaurl"
        }
      });

      assert.equal(response.statusCode, 400);
      const payload = response.json();
      assert.equal(payload.status, "error");
      assert.equal(payload.error.code, "INVALID_REQUEST");
      assert.match(payload.error.message, /base_url/i);
    } finally {
      await app.close();
      restoreEnv(originalEnv);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
);

function captureEnv() {
  const captured = {};

  for (const key of ENV_KEYS) {
    captured[key] = process.env[key];
  }

  return captured;
}

function restoreEnv(captured) {
  for (const key of ENV_KEYS) {
    if (captured[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = captured[key];
    }
  }
}
