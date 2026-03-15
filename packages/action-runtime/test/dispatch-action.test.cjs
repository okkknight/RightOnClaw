const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ActionRuntime,
  BackendSelectionRouter,
  BuiltInActionDefinitionResolver,
  ExecutorRegistry,
  OpenClawResponsesExecutor,
  OpenClawExecutor,
  getBuiltInActionDefinition,
  getExperimentalActionDefinition,
  dispatchAction
} = require("../dist/index.js");
const {
  ApiKeyCredentialProvider,
  CredentialProviderRegistry,
  SharedCredentialProvider
} = require("@rightonclaw/credential-layer");

function createClientStub(overrides = {}) {
  const calls = [];
  const client = {
    async createSession(input) {
      calls.push({ method: "createSession", input });
      return { sessionId: "sess_123" };
    },
    async getLatestSession() {
      calls.push({ method: "getLatestSession" });
      return null;
    },
    async sendMessage(input) {
      calls.push({ method: "sendMessage", input });
    },
    async generateAssistantResponse(input) {
      calls.push({ method: "generateAssistantResponse", input });
      return {
        text: "generated text",
        model: "test-model"
      };
    },
    async getSessionWebUrl(input) {
      calls.push({ method: "getSessionWebUrl", input });
      return "http://127.0.0.1:3000/chat?session=sess_123";
    },
    ...overrides
  };

  return { client, calls };
}

function createRequest(action, overrides = {}) {
  return {
    version: "1.0",
    request_id: `req-${action}`,
    action,
    prompt: overrides.prompt,
    stream: overrides.stream,
    source: {
      platform: "test",
      entry: "unit-test",
      app_name: "TextEdit",
      bundle_id: "com.apple.TextEdit",
      ...overrides.source
    },
    selection: overrides.selection ?? {
      kind: "text",
      text: "RightOnClaw integrates macOS with OpenClaw.",
      paths: [],
      mime: "text/plain",
      encoding: "utf-8",
      char_count: 43
    },
    selection_context: overrides.selection_context,
    options: overrides.options
  };
}

function createLoggerSpy() {
  const logs = [];

  return {
    logs,
    logger: {
      info(message, meta) {
        logs.push({ level: "info", message, meta });
      },
      warn(message, meta) {
        logs.push({ level: "warn", message, meta });
      },
      error(message, meta) {
        logs.push({ level: "error", message, meta });
      }
    }
  };
}

function findLog(logs, message, level) {
  const entry = logs.find((candidate) => candidate.message === message && (!level || candidate.level === level));
  assert.ok(entry, `Expected ${level ?? "any"} log for ${message}`);
  return entry;
}

function createBackendSelectionResolver(snapshot) {
  return {
    async resolve() {
      return snapshot;
    }
  };
}

test("dispatchAction preserves send_to_claw success when the executor cannot return a webui url", async () => {
  const { client, calls } = createClientStub({
    async getSessionWebUrl(input) {
      calls.push({ method: "getSessionWebUrl", input });
      return null;
    }
  });

  const outcome = await dispatchAction(createRequest("send_to_claw"), { client });

  assert.deepEqual(
    calls.map((entry) => entry.method),
    ["createSession", "sendMessage", "getSessionWebUrl"]
  );
  assert.equal(outcome.result.session_id, "sess_123");
  assert.equal(outcome.result.webui_url, null);
  assert.match(outcome.result.content, /could not build a session URL automatically/i);
  assert.deepEqual(outcome.result.delivery, {
    preferred_mode: "open_webui",
    fallback_modes: ["popup", "clipboard"]
  });
  assert.deepEqual(outcome.meta, {
    fallback_used: true,
    source_app_supported: true,
    delivery_mode: "open_webui"
  });
});

test("dispatchAction preserves summarize result shape and OpenClaw call sequence", async () => {
  const { client, calls } = createClientStub({
    async generateAssistantResponse(input) {
      calls.push({ method: "generateAssistantResponse", input });
      return {
        text: "A concise summary.",
        model: "summary-model"
      };
    }
  });

  const outcome = await dispatchAction(createRequest("summarize"), { client });

  assert.deepEqual(
    calls.map((entry) => entry.method),
    ["createSession", "sendMessage", "generateAssistantResponse", "getSessionWebUrl"]
  );
  assert.deepEqual(outcome.result, {
    title: "Summary",
    content: "A concise summary.",
    content_format: "plain_text",
    session_id: "sess_123",
    webui_url: "http://127.0.0.1:3000/chat?session=sess_123",
    delivery: {
      preferred_mode: "popup",
      fallback_modes: ["clipboard", "open_webui"]
    }
  });
  assert.deepEqual(outcome.meta, {
    fallback_used: false,
    model: "summary-model",
    source_app_supported: true,
    delivery_mode: "popup"
  });
});

test("ask_claw uses the model runner when the API backend is selected", async () => {
  const { logs, logger } = createLoggerSpy();
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          throw new Error("ask_claw should not dispatch through OpenClawExecutor when API backend is selected");
        }
      },
      {
        runner: "model",
        async execute() {
          return {
            sessionId: "model:ask_claw:test",
            webuiUrl: null,
            generatedText: "Model-backed answer.",
            model: "gpt-4.1-mini",
            credentialProvider: "api_key"
          };
        }
      }
    ]),
    backendSelectionRouter: new BackendSelectionRouter({
      backendSelectionResolver: createBackendSelectionResolver({
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
            reason: "api_key_resolved",
            supported_actions: ["ask_claw", "summarize", "explain", "rewrite"],
            supports_fast_path: false,
            default_runner: "model",
            fast_path_runner: null
          }
        ]
      })
    }),
    logger
  });

  const outcome = await runtime.execute(createRequest("ask_claw", { prompt: "What is this?" }));

  assert.equal(outcome.result.title, "Ask Claw");
  assert.equal(outcome.result.content, "Model-backed answer.");
  assert.equal(outcome.result.webui_url, null);
  const routingLog = findLog(logs, "backend_selection_routing", "info");
  assert.equal(routingLog.meta.selected_backend, "openai_compatible");
  assert.equal(routingLog.meta.selected_runner, "model");
});

test("rewrite can run through the model runner when the API backend is selected", async () => {
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          throw new Error("rewrite should not dispatch through OpenClawExecutor when API backend is selected");
        }
      },
      {
        runner: "model",
        async execute() {
          return {
            sessionId: "model:rewrite:test",
            webuiUrl: null,
            generatedText: "rewritten by model",
            model: "gpt-4.1-mini",
            credentialProvider: "api_key"
          };
        }
      }
    ]),
    backendSelectionRouter: new BackendSelectionRouter({
      backendSelectionResolver: createBackendSelectionResolver({
        selection_mode: "manual",
        requested_backend: "openai_compatible",
        default_backend: "openai_compatible",
        fast_path_backend: null,
        fast_path_available: false,
        setup_required: false,
        backends: []
      })
    })
  });

  const outcome = await runtime.execute(createRequest("rewrite"));
  assert.equal(outcome.result.title, "Rewrite");
  assert.equal(outcome.result.content, "rewritten by model");
  assert.equal(outcome.result.webui_url, null);
});

test("object-aware summarize does not incorrectly use the OpenClaw fast path when the API backend is selected", async () => {
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          throw new Error("object-aware summarize should not dispatch through OpenClawExecutor for API backend");
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("object-aware summarize should never use the OpenClaw fast path for API backend");
        }
      },
      {
        runner: "model",
        async execute() {
          return {
            sessionId: "model:summarize:test",
            webuiUrl: null,
            generatedText: "Object-aware API summary.",
            model: "gpt-4.1-mini",
            credentialProvider: "api_key"
          };
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      summarizeFastPathEnabled: true
    }),
    backendSelectionRouter: new BackendSelectionRouter({
      backendSelectionResolver: createBackendSelectionResolver({
        selection_mode: "manual",
        requested_backend: "openai_compatible",
        default_backend: "openai_compatible",
        fast_path_backend: null,
        fast_path_available: false,
        setup_required: false,
        backends: []
      })
    })
  });

  const outcome = await runtime.execute(
    createRequest("summarize", {
      selection: {
        kind: "file",
        text: null,
        paths: ["/tmp/demo.txt"],
        mime: "text/plain",
        encoding: "utf-8",
        char_count: null
      },
      selection_context: {
        kind: "file",
        items: [
          {
            item_kind: "file",
            path: "/tmp/demo.txt",
            name: "demo.txt",
            mime_type: "text/plain"
          }
        ],
        capture: {
          mode: "finder",
          created_at: "2026-03-14T00:00:00.000Z"
        },
        summary: "Selected file demo.txt"
      }
    })
  );

  assert.equal(outcome.result.title, "Summary");
  assert.equal(outcome.result.content, "Object-aware API summary.");
});

test("send_to_claw returns a structured backend error when the selected backend is not OpenClaw", async () => {
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          throw new Error("send_to_claw should be rejected before executor dispatch");
        }
      },
      {
        runner: "model",
        async execute() {
          throw new Error("send_to_claw should not dispatch through model");
        }
      }
    ]),
    backendSelectionRouter: new BackendSelectionRouter({
      backendSelectionResolver: createBackendSelectionResolver({
        selection_mode: "manual",
        requested_backend: "openai_compatible",
        default_backend: "openai_compatible",
        fast_path_backend: null,
        fast_path_available: false,
        setup_required: false,
        backends: []
      })
    })
  });

  await assert.rejects(
    runtime.execute(createRequest("send_to_claw")),
    (error) => {
      assert.equal(error.code, "BACKEND_UNSUPPORTED_ACTION");
      assert.equal(error.details.backend_id, "openai_compatible");
      return true;
    }
  );
});

test("public summarize keeps using OpenClawExecutor when the summarize fast-path gate is disabled", async () => {
  let openClawUsed = false;
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          openClawUsed = true;
          return {
            sessionId: "sess_openclaw",
            webuiUrl: "http://127.0.0.1:3000/chat?session=sess_openclaw",
            generatedText: "OpenClaw summary.",
            model: "openclaw-model"
          };
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("summarize should not dispatch through OpenClawResponsesExecutor when the gate is disabled");
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver()
  });

  const outcome = await runtime.execute(createRequest("summarize"));

  assert.equal(openClawUsed, true);
  assert.deepEqual(outcome.result, {
    title: "Summary",
    content: "OpenClaw summary.",
    content_format: "plain_text",
    session_id: "sess_openclaw",
    webui_url: "http://127.0.0.1:3000/chat?session=sess_openclaw",
    delivery: {
      preferred_mode: "popup",
      fallback_modes: ["clipboard", "open_webui"]
    }
  });
});

test("public summarize dispatches through OpenClawResponsesExecutor when the summarize fast-path gate is enabled", async () => {
  const { logs, logger } = createLoggerSpy();
  const credentialProviderRegistry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
        RIGHTONCLAW_OPENCLAW_AGENT_ID: "main"
      }
    })
  ]);
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          throw new Error("summarize should not dispatch through OpenClawExecutor when the gate is enabled");
        }
      },
      new OpenClawResponsesExecutor(
        {
          async generateText(input) {
            assert.equal(input.credential.provider, "shared");
            assert.equal(input.requestId, "req-summarize");
            assert.match(input.sessionId, /^agent:main:rightonclaw:/);
            return {
              text: "Fast-path public summary.",
              model: "openclaw:main"
            };
          }
        },
        credentialProviderRegistry
      )
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      summarizeFastPathEnabled: true
    }),
    credentialProviderRegistry,
    logger
  });

  const outcome = await runtime.execute(createRequest("summarize"));

  assert.deepEqual(outcome.result, {
    title: "Summary",
    content: "Fast-path public summary.",
    content_format: "plain_text",
    session_id: outcome.result.session_id,
    webui_url: null,
    delivery: {
      preferred_mode: "popup",
      fallback_modes: ["clipboard", "open_webui"]
    }
  });
  assert.match(outcome.result.session_id, /^agent:main:rightonclaw:/);
  assert.deepEqual(outcome.meta, {
    fallback_used: false,
    model: "openclaw:main",
    source_app_supported: true,
    delivery_mode: "popup"
  });
  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "summarize");
  assert.equal(routingLog.meta.requested_fast_path, true);
  assert.equal(routingLog.meta.selected_runner, "openclaw_responses");
  assert.equal(routingLog.meta.routing_reason, "openclaw_responses_selected");
  assert.equal(routingLog.meta.credential_provider, "shared");
});

test("public summarize falls back to OpenClawExecutor when the fast-path gate is enabled but no fast-path credential is available", async () => {
  const { logs, logger } = createLoggerSpy();
  let openClawUsed = false;
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          openClawUsed = true;
          return {
            sessionId: "sess_summarize_guard",
            webuiUrl: "http://127.0.0.1:3000/chat?session=sess_summarize_guard",
            generatedText: "OpenClaw fallback summary.",
            model: "openclaw-model"
          };
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("summarize should fall back before dispatching through OpenClawResponsesExecutor");
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      summarizeFastPathEnabled: true
    }),
    logger
  });

  const outcome = await runtime.execute(createRequest("summarize"));

  assert.equal(openClawUsed, true);
  assert.equal(outcome.result.title, "Summary");
  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "summarize");
  assert.equal(routingLog.meta.requested_fast_path, true);
  assert.equal(routingLog.meta.selected_runner, "openclaw");
  assert.equal(routingLog.meta.routing_reason, "no_fast_path_credential");
  assert.equal(routingLog.meta.credential_provider, null);
  const observationLog = findLog(logs, "summarize_runtime_observation", "info");
  assert.equal(observationLog.meta.runner_used, "openclaw");
});

test("public summarize falls back to OpenClawExecutor when the fast-path gate is enabled but the input is too large", async () => {
  const { logs, logger } = createLoggerSpy();
  let openClawUsed = false;
  const credentialProviderRegistry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
        RIGHTONCLAW_OPENCLAW_AGENT_ID: "main"
      }
    }),
    new ApiKeyCredentialProvider({ env: {} })
  ]);
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          openClawUsed = true;
          return {
            sessionId: "sess_summarize_no_credential",
            webuiUrl: "http://127.0.0.1:3000/chat?session=sess_summarize_no_credential",
            generatedText: "OpenClaw no-credential fallback summary.",
            model: "openclaw-model"
          };
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("summarize should fall back before dispatching through OpenClawResponsesExecutor");
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      summarizeFastPathEnabled: true
    }),
    credentialProviderRegistry,
    fastPathMaxInputLength: 100,
    logger
  });

  const outcome = await runtime.execute(
    createRequest("summarize", {
      selection: {
        kind: "text",
        text: "x".repeat(101),
        paths: [],
        mime: "text/plain",
        encoding: "utf-8",
        char_count: 101
      }
    })
  );

  assert.equal(openClawUsed, true);
  assert.equal(outcome.result.title, "Summary");
  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "summarize");
  assert.equal(routingLog.meta.requested_fast_path, true);
  assert.equal(routingLog.meta.selected_runner, "openclaw");
  assert.equal(routingLog.meta.routing_reason, "input_too_large");
  assert.equal(routingLog.meta.credential_provider, "shared");
  assert.equal(routingLog.meta.input_text_length, 101);
});

test("public summarize observation logs runner=openclaw when the gate is disabled", async () => {
  const { logs, logger } = createLoggerSpy();
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          return {
            sessionId: "sess_openclaw_obs",
            webuiUrl: "http://127.0.0.1:3000/chat?session=sess_openclaw_obs",
            generatedText: "Observed OpenClaw summary.",
            model: "openclaw-model"
          };
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("summarize should not dispatch through OpenClawResponsesExecutor when the gate is disabled");
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver(),
    logger
  });

  await runtime.execute(createRequest("summarize"));

  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "summarize");
  assert.equal(routingLog.meta.requested_fast_path, false);
  assert.equal(routingLog.meta.selected_runner, "openclaw");
  assert.equal(routingLog.meta.routing_reason, "fast_path_disabled");
  assert.equal(routingLog.meta.credential_provider, null);
  const observationLog = findLog(logs, "summarize_runtime_observation", "info");
  assert.equal(observationLog.meta.action_id, "summarize");
  assert.equal(observationLog.meta.runner_used, "openclaw");
  assert.equal(observationLog.meta.credential_provider, null);
  assert.equal(observationLog.meta.input_text_length, 43);
  assert.equal(observationLog.meta.success, true);
  assert.equal(typeof observationLog.meta.total_duration_ms, "number");
});

test("public summarize observation logs runner=openclaw_responses when the gate is enabled", async () => {
  const { logs, logger } = createLoggerSpy();
  const credentialProviderRegistry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
        RIGHTONCLAW_OPENCLAW_AGENT_ID: "main"
      }
    }),
    new ApiKeyCredentialProvider({ env: {} })
  ]);
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          throw new Error("summarize should not dispatch through OpenClawExecutor when the gate is enabled");
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          return {
            sessionId: "agent:main:rightonclaw:obs",
            webuiUrl: null,
            generatedText: "Observed fast-path summary.",
            model: "openclaw:main",
            credentialProvider: "shared"
          };
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      summarizeFastPathEnabled: true
    }),
    credentialProviderRegistry,
    logger
  });

  const outcome = await runtime.execute(createRequest("summarize"));

  assert.equal(outcome.result.title, "Summary");
  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "summarize");
  assert.equal(routingLog.meta.requested_fast_path, true);
  assert.equal(routingLog.meta.selected_runner, "openclaw_responses");
  assert.equal(routingLog.meta.routing_reason, "openclaw_responses_selected");
  assert.equal(routingLog.meta.credential_provider, "shared");
  const observationLog = findLog(logs, "summarize_runtime_observation", "info");
  assert.equal(observationLog.meta.action_id, "summarize");
  assert.equal(observationLog.meta.runner_used, "openclaw_responses");
  assert.equal(observationLog.meta.credential_provider, "shared");
  assert.equal(observationLog.meta.input_text_length, 43);
  assert.equal(observationLog.meta.success, true);
  assert.equal(typeof observationLog.meta.total_duration_ms, "number");
});

test("public explain keeps using OpenClawExecutor when the explain fast-path gate is disabled", async () => {
  let openClawUsed = false;
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          openClawUsed = true;
          return {
            sessionId: "sess_explain_openclaw",
            webuiUrl: "http://127.0.0.1:3000/chat?session=sess_explain_openclaw",
            generatedText: "OpenClaw explanation.",
            model: "openclaw-explain-model"
          };
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("explain should not dispatch through OpenClawResponsesExecutor when the gate is disabled");
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver()
  });

  const outcome = await runtime.execute(createRequest("explain"));

  assert.equal(openClawUsed, true);
  assert.deepEqual(outcome.result, {
    title: "Explanation",
    content: "OpenClaw explanation.",
    content_format: "plain_text",
    session_id: "sess_explain_openclaw",
    webui_url: "http://127.0.0.1:3000/chat?session=sess_explain_openclaw",
    delivery: {
      preferred_mode: "popup",
      fallback_modes: ["clipboard", "open_webui"]
    }
  });
});

test("public explain dispatches through OpenClawResponsesExecutor when the explain fast-path gate is enabled", async () => {
  const { logs, logger } = createLoggerSpy();
  const credentialProviderRegistry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
        RIGHTONCLAW_OPENCLAW_AGENT_ID: "main"
      }
    })
  ]);
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          throw new Error("explain should not dispatch through OpenClawExecutor when the gate is enabled");
        }
      },
      new OpenClawResponsesExecutor(
        {
          async generateText(input) {
            assert.equal(input.credential.provider, "shared");
            assert.equal(input.requestId, "req-explain");
            assert.match(input.sessionId, /^agent:main:rightonclaw:/);
            return {
              text: "Fast-path public explanation.",
              model: "openclaw:main"
            };
          }
        },
        credentialProviderRegistry
      )
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      explainFastPathEnabled: true
    }),
    credentialProviderRegistry,
    logger
  });

  const outcome = await runtime.execute(createRequest("explain"));

  assert.deepEqual(outcome.result, {
    title: "Explanation",
    content: "Fast-path public explanation.",
    content_format: "plain_text",
    session_id: outcome.result.session_id,
    webui_url: null,
    delivery: {
      preferred_mode: "popup",
      fallback_modes: ["clipboard", "open_webui"]
    }
  });
  assert.match(outcome.result.session_id, /^agent:main:rightonclaw:/);
  assert.deepEqual(outcome.meta, {
    fallback_used: false,
    model: "openclaw:main",
    source_app_supported: true,
    delivery_mode: "popup"
  });
  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "explain");
  assert.equal(routingLog.meta.requested_fast_path, true);
  assert.equal(routingLog.meta.selected_runner, "openclaw_responses");
  assert.equal(routingLog.meta.routing_reason, "openclaw_responses_selected");
  assert.equal(routingLog.meta.credential_provider, "shared");
});

test("public explain falls back to OpenClawExecutor when the fast-path gate is enabled but no fast-path credential is available", async () => {
  const { logs, logger } = createLoggerSpy();
  let openClawUsed = false;
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          openClawUsed = true;
          return {
            sessionId: "sess_explain_guard",
            webuiUrl: "http://127.0.0.1:3000/chat?session=sess_explain_guard",
            generatedText: "OpenClaw fallback explanation.",
            model: "openclaw-explain-model"
          };
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("explain should fall back before dispatching through OpenClawResponsesExecutor");
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      explainFastPathEnabled: true
    }),
    logger
  });

  const outcome = await runtime.execute(createRequest("explain"));

  assert.equal(openClawUsed, true);
  assert.equal(outcome.result.title, "Explanation");
  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "explain");
  assert.equal(routingLog.meta.requested_fast_path, true);
  assert.equal(routingLog.meta.selected_runner, "openclaw");
  assert.equal(routingLog.meta.routing_reason, "no_fast_path_credential");
  assert.equal(routingLog.meta.credential_provider, null);
  const observationLog = findLog(logs, "explain_runtime_observation", "info");
  assert.equal(observationLog.meta.runner_used, "openclaw");
});

test("public explain falls back to OpenClawExecutor when the fast-path gate is enabled but the input is too large", async () => {
  const { logs, logger } = createLoggerSpy();
  let openClawUsed = false;
  const credentialProviderRegistry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
        RIGHTONCLAW_OPENCLAW_AGENT_ID: "main"
      }
    }),
    new ApiKeyCredentialProvider({ env: {} })
  ]);
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          openClawUsed = true;
          return {
            sessionId: "sess_explain_no_credential",
            webuiUrl: "http://127.0.0.1:3000/chat?session=sess_explain_no_credential",
            generatedText: "OpenClaw no-credential fallback explanation.",
            model: "openclaw-explain-model"
          };
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("explain should fall back before dispatching through OpenClawResponsesExecutor");
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      explainFastPathEnabled: true
    }),
    credentialProviderRegistry,
    fastPathMaxInputLength: 100,
    logger
  });

  const outcome = await runtime.execute(
    createRequest("explain", {
      selection: {
        kind: "text",
        text: "x".repeat(101),
        paths: [],
        mime: "text/plain",
        encoding: "utf-8",
        char_count: 101
      }
    })
  );

  assert.equal(openClawUsed, true);
  assert.equal(outcome.result.title, "Explanation");
  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "explain");
  assert.equal(routingLog.meta.requested_fast_path, true);
  assert.equal(routingLog.meta.selected_runner, "openclaw");
  assert.equal(routingLog.meta.routing_reason, "input_too_large");
  assert.equal(routingLog.meta.credential_provider, "shared");
  assert.equal(routingLog.meta.input_text_length, 101);
});

test("public explain observation logs runner=openclaw when the gate is disabled", async () => {
  const { logs, logger } = createLoggerSpy();
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          return {
            sessionId: "sess_explain_obs",
            webuiUrl: "http://127.0.0.1:3000/chat?session=sess_explain_obs",
            generatedText: "Observed OpenClaw explanation.",
            model: "openclaw-explain-model"
          };
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("explain should not dispatch through OpenClawResponsesExecutor when the gate is disabled");
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver(),
    logger
  });

  await runtime.execute(createRequest("explain"));

  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "explain");
  assert.equal(routingLog.meta.requested_fast_path, false);
  assert.equal(routingLog.meta.selected_runner, "openclaw");
  assert.equal(routingLog.meta.routing_reason, "fast_path_disabled");
  assert.equal(routingLog.meta.credential_provider, null);
  const observationLog = findLog(logs, "explain_runtime_observation", "info");
  assert.equal(observationLog.meta.action_id, "explain");
  assert.equal(observationLog.meta.runner_used, "openclaw");
  assert.equal(observationLog.meta.credential_provider, null);
  assert.equal(observationLog.meta.input_text_length, 43);
  assert.equal(observationLog.meta.success, true);
  assert.equal(typeof observationLog.meta.total_duration_ms, "number");
});

test("public explain observation logs runner=openclaw_responses when the gate is enabled", async () => {
  const { logs, logger } = createLoggerSpy();
  const credentialProviderRegistry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
        RIGHTONCLAW_OPENCLAW_AGENT_ID: "main"
      }
    }),
    new ApiKeyCredentialProvider({ env: {} })
  ]);
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          throw new Error("explain should not dispatch through OpenClawExecutor when the gate is enabled");
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          return {
            sessionId: "agent:main:rightonclaw:obs",
            webuiUrl: null,
            generatedText: "Observed fast-path explanation.",
            model: "openclaw:main",
            credentialProvider: "shared"
          };
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      explainFastPathEnabled: true
    }),
    credentialProviderRegistry,
    logger
  });

  const outcome = await runtime.execute(createRequest("explain"));

  assert.equal(outcome.result.title, "Explanation");
  const routingLog = findLog(logs, "public_text_action_routing", "info");
  assert.equal(routingLog.meta.action_id, "explain");
  assert.equal(routingLog.meta.requested_fast_path, true);
  assert.equal(routingLog.meta.selected_runner, "openclaw_responses");
  assert.equal(routingLog.meta.routing_reason, "openclaw_responses_selected");
  assert.equal(routingLog.meta.credential_provider, "shared");
  const observationLog = findLog(logs, "explain_runtime_observation", "info");
  assert.equal(observationLog.meta.action_id, "explain");
  assert.equal(observationLog.meta.runner_used, "openclaw_responses");
  assert.equal(observationLog.meta.credential_provider, "shared");
  assert.equal(observationLog.meta.input_text_length, 43);
  assert.equal(observationLog.meta.success, true);
  assert.equal(typeof observationLog.meta.total_duration_ms, "number");
});

test("dispatchAction preserves rewrite result shape and delivery recommendations", async () => {
  const { client, calls } = createClientStub({
    async generateAssistantResponse(input) {
      calls.push({ method: "generateAssistantResponse", input });
      return {
        text: "Polished rewrite text.",
        model: "rewrite-model"
      };
    }
  });

  const outcome = await dispatchAction(
    createRequest("rewrite", {
      options: {
        replace_selection: true,
        rewrite_mode: "rewrite",
        session_strategy: "new"
      }
    }),
    { client }
  );

  assert.deepEqual(
    calls.map((entry) => entry.method),
    ["createSession", "sendMessage", "generateAssistantResponse", "getSessionWebUrl"]
  );
  assert.deepEqual(outcome.result, {
    title: "Rewrite",
    content: "Polished rewrite text.",
    content_format: "plain_text",
    session_id: "sess_123",
    webui_url: "http://127.0.0.1:3000/chat?session=sess_123",
    delivery: {
      preferred_mode: "apply_selection",
      fallback_modes: ["popup", "clipboard"]
    }
  });
  assert.deepEqual(outcome.meta, {
    fallback_used: false,
    model: "rewrite-model",
    source_app_supported: true,
    delivery_mode: "apply_selection"
  });
  const rewritePrompt = calls.find((entry) => entry.method === "sendMessage")?.input?.content ?? "";
  assert.match(rewritePrompt, /Preserve the original language of the selected text/i);
  assert.doesNotMatch(rewritePrompt, /Output language:/i);
  assert.doesNotMatch(rewritePrompt, /Respond in /i);
});

test("dispatchAction preserves explain result shape and keeps popup delivery", async () => {
  const { client, calls } = createClientStub({
    async generateAssistantResponse(input) {
      calls.push({ method: "generateAssistantResponse", input });
      return {
        text: "This looks like a config line. It tells the bridge where the OpenClaw Gateway is running.",
        model: "explain-model"
      };
    }
  });

  const outcome = await dispatchAction(createRequest("explain"), { client });

  assert.deepEqual(
    calls.map((entry) => entry.method),
    ["createSession", "sendMessage", "generateAssistantResponse", "getSessionWebUrl"]
  );
  assert.deepEqual(outcome.result, {
    title: "Explanation",
    content: "This looks like a config line. It tells the bridge where the OpenClaw Gateway is running.",
    content_format: "plain_text",
    session_id: "sess_123",
    webui_url: "http://127.0.0.1:3000/chat?session=sess_123",
    delivery: {
      preferred_mode: "popup",
      fallback_modes: ["clipboard", "open_webui"]
    }
  });
  assert.deepEqual(outcome.meta, {
    fallback_used: false,
    model: "explain-model",
    source_app_supported: true,
    delivery_mode: "popup"
  });
});

test("dispatchAction works with an injected ActionRuntime instance", async () => {
  const { client } = createClientStub();
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([new OpenClawExecutor(client)]),
    definitionResolver: new BuiltInActionDefinitionResolver()
  });

  const outcome = await dispatchAction(createRequest("summarize"), { runtime });

  assert.equal(outcome.result.title, "Summary");
  assert.equal(outcome.result.content, "generated text");
});

test("built-in action definitions resolve manifest and handler for summarize", () => {
  const definition = getBuiltInActionDefinition("summarize");

  assert.equal(definition.action, "summarize");
  assert.equal(definition.handler.action, "summarize");
  assert.equal(definition.manifest.id, "summarize");
  assert.equal(definition.manifest.runner, "openclaw");
  assert.equal(definition.manifest.responseMode, "generate_text");
  assert.equal(definition.manifest.title, "Summary");
});

test("built-in action definitions can switch public summarize to the OpenClaw responses fast path", () => {
  const definition = getBuiltInActionDefinition("summarize", {
    summarizeFastPathEnabled: true
  });

  assert.equal(definition.action, "summarize");
  assert.equal(definition.handler.action, "summarize");
  assert.equal(definition.manifest.id, "summarize");
  assert.equal(definition.manifest.runner, "openclaw_responses");
  assert.equal(definition.manifest.responseMode, "generate_text");
  assert.equal(definition.manifest.title, "Summary");
  assert.equal(definition.manifest.maxOutputTokens, 96);
});

test("enabling the summarize fast-path gate does not change explain/send_to_claw/rewrite built-in runners", () => {
  assert.equal(
    getBuiltInActionDefinition("explain", { summarizeFastPathEnabled: true }).manifest.runner,
    "openclaw"
  );
  assert.equal(
    getBuiltInActionDefinition("rewrite", { summarizeFastPathEnabled: true }).manifest.runner,
    "openclaw"
  );
  assert.equal(
    getBuiltInActionDefinition("send_to_claw", { summarizeFastPathEnabled: true }).manifest.runner,
    "openclaw"
  );
});

test("built-in action definitions can switch public explain to the OpenClaw responses fast path", () => {
  const definition = getBuiltInActionDefinition("explain", {
    explainFastPathEnabled: true
  });

  assert.equal(definition.action, "explain");
  assert.equal(definition.handler.action, "explain");
  assert.equal(definition.manifest.id, "explain");
  assert.equal(definition.manifest.runner, "openclaw_responses");
  assert.equal(definition.manifest.responseMode, "generate_text");
  assert.equal(definition.manifest.title, "Explain");
  assert.equal(definition.manifest.maxOutputTokens, 192);
});

test("enabling the explain fast-path gate does not change summarize/send_to_claw/rewrite built-in runners", () => {
  assert.equal(
    getBuiltInActionDefinition("summarize", { explainFastPathEnabled: true }).manifest.runner,
    "openclaw"
  );
  assert.equal(
    getBuiltInActionDefinition("rewrite", { explainFastPathEnabled: true }).manifest.runner,
    "openclaw"
  );
  assert.equal(
    getBuiltInActionDefinition("send_to_claw", { explainFastPathEnabled: true }).manifest.runner,
    "openclaw"
  );
});

test("built-in action definitions resolve manifest and handler for explain", () => {
  const definition = getBuiltInActionDefinition("explain");

  assert.equal(definition.action, "explain");
  assert.equal(definition.handler.action, "explain");
  assert.equal(definition.manifest.id, "explain");
  assert.equal(definition.manifest.runner, "openclaw");
  assert.equal(definition.manifest.responseMode, "generate_text");
  assert.equal(definition.manifest.title, "Explain");
});

test("experimental action definitions resolve manifest and handler for explain_fast", () => {
  const definition = getExperimentalActionDefinition("explain_fast");

  assert.equal(definition.id, "explain_fast");
  assert.equal(definition.baseAction, "explain");
  assert.equal(definition.handler.action, "explain");
  assert.equal(definition.manifest.id, "explain_fast");
  assert.equal(definition.manifest.runner, "model");
  assert.equal(definition.manifest.responseMode, "generate_text");
  assert.equal(definition.manifest.title, "Explain (Fast)");
});

test("built-in action definitions resolve ask_claw to the full OpenClaw runner", () => {
  const definition = getBuiltInActionDefinition("ask_claw");

  assert.equal(definition.action, "ask_claw");
  assert.equal(definition.handler.action, "ask_claw");
  assert.equal(definition.manifest.id, "ask_claw");
  assert.equal(definition.manifest.runner, "openclaw");
  assert.equal(definition.manifest.responseMode, "generate_text");
  assert.equal(definition.manifest.title, "Ask Claw");
});

test("dispatchAction preserves ask_claw result shape and uses popup delivery", async () => {
  const { client, calls } = createClientStub({
    async createSession(input) {
      calls.push({ method: "createSession", input });
      return { sessionId: "sess_ask" };
    },
    async generateAssistantResponse(input) {
      calls.push({ method: "generateAssistantResponse", input });
      return {
        text: "Ask Claw answer.",
        model: "ask-model"
      };
    },
    async getSessionWebUrl(input) {
      calls.push({ method: "getSessionWebUrl", input });
      return "http://127.0.0.1:3000/chat?session=sess_ask";
    }
  });

  const outcome = await dispatchAction(
    createRequest("ask_claw", {
      prompt: "What does this mean?"
    }),
    { client }
  );

  assert.deepEqual(
    calls.map((entry) => entry.method),
    ["createSession", "sendMessage", "generateAssistantResponse", "getSessionWebUrl"]
  );
  assert.deepEqual(outcome.result, {
    title: "Ask Claw",
    content: "Ask Claw answer.",
    content_format: "plain_text",
    session_id: "sess_ask",
    webui_url: "http://127.0.0.1:3000/chat?session=sess_ask",
    delivery: {
      preferred_mode: "popup",
      fallback_modes: ["clipboard", "open_webui"]
    }
  });
});

test("ask_claw freeform requests require a prompt", async () => {
  const { client } = createClientStub();

  await assert.rejects(
    () =>
      dispatchAction(
        createRequest("ask_claw", {
          prompt: ""
        }),
        { client }
      ),
    (error) => {
      assert.equal(error.code, "PROMPT_REQUIRED");
      return true;
    }
  );
});

test("object-aware summarize selections stay on the full OpenClaw runner even when the fast path is enabled", async () => {
  const { logs, logger } = createLoggerSpy();
  let openClawCalls = 0;
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          openClawCalls += 1;
          return {
            sessionId: "sess_object",
            webuiUrl: "http://127.0.0.1:3000/chat?session=sess_object",
            generatedText: "Object-aware summary.",
            model: "openclaw-model"
          };
        }
      },
      {
        runner: "openclaw_responses",
        async execute() {
          throw new Error("object-aware summarize should not use the public text fast path");
        }
      }
    ]),
    definitionResolver: new BuiltInActionDefinitionResolver({
      summarizeFastPathEnabled: true
    }),
    logger
  });

  const outcome = await runtime.execute(
    createRequest("summarize", {
      selection: {
        kind: "file",
        text: null,
        paths: ["/tmp/demo.txt"],
        mime: "text/plain",
        encoding: "utf-8",
        char_count: null
      },
      selection_context: {
        kind: "file",
        items: [
          {
            item_kind: "file",
            path: "/tmp/demo.txt",
            name: "demo.txt",
            mime_type: "text/plain"
          }
        ],
        capture: {
          mode: "finder",
          created_at: "2026-03-13T00:00:00.000Z"
        },
        summary: "1 file: demo.txt"
      }
    })
  );

  assert.equal(openClawCalls, 1);
  assert.equal(outcome.result.content, "Object-aware summary.");
  const logEntry = findLog(logs, "object_aware_action_routing", "info");
  assert.equal(logEntry.meta.object_aware_routing_reason, "object_selection_uses_selected_backend_full_path");
  assert.equal(logEntry.meta.selection_kind, "file");
});
