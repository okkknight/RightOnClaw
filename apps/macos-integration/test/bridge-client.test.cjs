const test = require("node:test");
const assert = require("node:assert/strict");

const { configureBackend, getBackends } = require("../dist/bridge-client.js");

test("getBackends reads the backend selection snapshot from the bridge", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
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
      };
    }
  });

  try {
    const payload = await getBackends();
    assert.equal(payload.default_backend, "openclaw");
    assert.equal(payload.fast_path_available, true);
    assert.equal(payload.backends[0].display_name, "OpenClaw");
  } finally {
    global.fetch = originalFetch;
  }
});

test("configureBackend posts API backend settings to the bridge", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          success: true,
          backends: {
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
          }
        };
      }
    };
  };

  try {
    const payload = await configureBackend({
      backend: "openai_compatible",
      api_key: "sk-test",
      base_url: "https://api.example.com/v1",
      model: "gpt-5-mini"
    });

    assert.equal(calls.length, 1);
    assert.match(String(calls[0].url), /\/v1\/backends\/configure$/);
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      backend: "openai_compatible",
      api_key: "sk-test",
      base_url: "https://api.example.com/v1",
      model: "gpt-5-mini"
    });
    assert.equal(payload.success, true);
    assert.equal(payload.backends.default_backend, "openai_compatible");
  } finally {
    global.fetch = originalFetch;
  }
});
