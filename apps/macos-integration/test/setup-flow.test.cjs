const test = require("node:test");
const assert = require("node:assert/strict");

const { runSetupFlow } = require("../dist/setup-flow.js");

test("runSetupFlow does not show setup UI when a backend is already available", async () => {
  let shown = 0;

  const result = await runSetupFlow({
    getBackends: async () => createOpenClawSnapshot(),
    showSetupPanel: async () => {
      shown += 1;
      return { outcome: "skip" };
    },
    configureBackend: async () => {
      throw new Error("configureBackend should not be called");
    },
    openUrl: async () => {
      throw new Error("openUrl should not be called");
    },
    log() {}
  });

  assert.equal(shown, 0);
  assert.equal(result.default_backend, "openclaw");
});

test("runSetupFlow shows the settings panel in manual mode even when OpenClaw is already available", async () => {
  let shown = 0;

  const result = await runSetupFlow({
    mode: "manual",
    getBackends: async () => createOpenClawSnapshot(),
    showSetupPanel: async (payload) => {
      shown += 1;
      assert.equal(payload.title, "RightOnClaw Settings");
      assert.match(payload.headline, /openclaw is active/i);
      assert.equal(payload.cancelActionLabel, "Close");
      assert.equal(payload.openClawActionLabel, undefined);
      return { outcome: "skip" };
    },
    configureBackend: async () => {
      throw new Error("configureBackend should not be called");
    },
    openUrl: async () => {
      throw new Error("openUrl should not be called");
    },
    log() {}
  });

  assert.equal(shown, 1);
  assert.equal(result.default_backend, "openclaw");
});

test("runSetupFlow shows setup UI when setup is required and allows the user to skip", async () => {
  let shown = 0;

  const result = await runSetupFlow({
    getBackends: async () => createSetupRequiredSnapshot(),
    showSetupPanel: async (payload) => {
      shown += 1;
      assert.match(payload.headline, /needs an ai backend/i);
      return { outcome: "skip" };
    },
    configureBackend: async () => {
      throw new Error("configureBackend should not be called");
    },
    openUrl: async () => {
      throw new Error("openUrl should not be called");
    },
    log() {}
  });

  assert.equal(shown, 1);
  assert.equal(result.setup_required, true);
});

test("runSetupFlow shows OpenClaw recovery copy instead of install copy when OpenClaw is detected but unhealthy", async () => {
  let shown = 0;

  const result = await runSetupFlow({
    getBackends: async () => createOpenClawUnavailableSnapshot(),
    showSetupPanel: async (payload) => {
      shown += 1;
      assert.match(payload.headline, /openclaw was detected/i);
      assert.match(payload.recommendation, /fix openclaw/i);
      assert.equal(payload.openClawActionLabel, "Fix OpenClaw");
      assert.doesNotMatch(payload.recommendation, /install openclaw/i);
      return { outcome: "skip" };
    },
    configureBackend: async () => {
      throw new Error("configureBackend should not be called");
    },
    openUrl: async () => {
      throw new Error("openUrl should not be called");
    },
    log() {}
  });

  assert.equal(shown, 1);
  assert.equal(result.setup_required, true);
});

test("runSetupFlow saves API key backend configuration through the bridge", async () => {
  let shown = 0;
  let configureInput = null;

  const result = await runSetupFlow({
    getBackends: async () => createSetupRequiredSnapshot(),
    showSetupPanel: async () => {
      shown += 1;
      return {
        outcome: "configure_api_key",
        api_key: "sk-test",
        base_url: "https://api.example.com/v1",
        model: "gpt-5-mini"
      };
    },
    configureBackend: async (input) => {
      configureInput = input;
      return {
        success: true,
        backends: createApiBackendSnapshot()
      };
    },
    openUrl: async () => {
      throw new Error("openUrl should not be called");
    },
    log() {}
  });

  assert.equal(shown, 1);
  assert.deepEqual(configureInput, {
    backend: "openai_compatible",
    api_key: "sk-test",
    base_url: "https://api.example.com/v1",
    model: "gpt-5-mini"
  });
  assert.equal(result.default_backend, "openai_compatible");
  assert.equal(result.setup_required, false);
});

test("runSetupFlow opens the OpenClaw install URL when requested", async () => {
  const openedUrls = [];

  const result = await runSetupFlow({
    getBackends: async () => createSetupRequiredSnapshot(),
    showSetupPanel: async () => ({
      outcome: "install_openclaw"
    }),
    configureBackend: async () => {
      throw new Error("configureBackend should not be called");
    },
    openUrl: async (url) => {
      openedUrls.push(url);
    },
    log() {}
  });

  assert.equal(openedUrls.length, 1);
  assert.match(openedUrls[0], /openclaw/i);
  assert.equal(result.setup_required, true);
});

function createOpenClawSnapshot() {
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

function createSetupRequiredSnapshot() {
  return {
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
    backends: [
      {
        id: "openclaw",
        display_name: "OpenClaw",
        configured: false,
        healthy: false,
        available: false,
        preferred: false,
        source: "auto",
        supported_actions: ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"],
        supports_fast_path: false,
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
        supported_actions: ["ask_claw", "summarize", "explain", "rewrite"],
        supports_fast_path: false,
        default_runner: "model",
        fast_path_runner: null
      }
    ]
  };
}

function createOpenClawUnavailableSnapshot() {
  return {
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
    backends: [
      {
        id: "openclaw",
        display_name: "OpenClaw",
        configured: true,
        healthy: false,
        available: false,
        preferred: false,
        source: "manual",
        reason: "timeout",
        supported_actions: ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"],
        supports_fast_path: false,
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
        supported_actions: ["ask_claw", "summarize", "explain", "rewrite"],
        supports_fast_path: false,
        default_runner: "model",
        fast_path_runner: null
      }
    ]
  };
}

function createApiBackendSnapshot() {
  return {
    status: "ok",
    selection_mode: "manual",
    requested_backend: "openai_compatible",
    default_backend: "openai_compatible",
    fast_path_backend: null,
    fast_path_available: false,
    setup_required: false,
    backends: [
      {
        id: "openclaw",
        display_name: "OpenClaw",
        configured: false,
        healthy: false,
        available: false,
        preferred: false,
        source: "auto",
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
        preferred: true,
        source: "manual",
        supported_actions: ["ask_claw", "summarize", "explain", "rewrite"],
        supports_fast_path: false,
        default_runner: "model",
        fast_path_runner: null
      }
    ]
  };
}
