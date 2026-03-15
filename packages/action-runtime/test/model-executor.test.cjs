const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ActionRuntime,
  BuiltInActionDefinitionResolver,
  ExecutorRegistry,
  ModelExecutor,
  getExperimentalActionDefinition
} = require("../dist/index.js");
const {
  ApiKeyCredentialProvider,
  CredentialProviderRegistry,
  SharedCredentialProvider
} = require("@rightonclaw/credential-layer");

function createRequest(action = "summarize", overrides = {}) {
  return {
    version: "1.0",
    request_id: "4e1c9296-2563-4ca2-b1d8-acf9505a71c6",
    action,
    source: {
      platform: "test",
      entry: "unit-test",
      ...overrides.source
    },
    selection: overrides.selection ?? {
      kind: "text",
      text: "RightOnClaw integrates macOS with OpenClaw.",
      mime: "text/plain",
      encoding: "utf-8",
      char_count: 43
    },
    options: overrides.options
  };
}

test("ModelExecutor uses the credential registry for the experimental summarize_fast path", async () => {
  const calls = [];
  const modelClient = {
    async generateText(input) {
      calls.push({ method: "generateText", input });
      return {
        text: "Fast summary text.",
        model: "model-fast"
      };
    }
  };
  const credentialProviderRegistry = {
    async resolve(input) {
      calls.push({ method: "resolve", input });
      return {
        provider: "shared",
        kind: "shared_reference",
        value: {
          gatewayUrl: "http://127.0.0.1:18789",
          gatewayToken: "shared-token",
          agentId: "main"
        }
      };
    }
  };
  const definition = getExperimentalActionDefinition("summarize_fast");
  const executor = new ModelExecutor(modelClient, credentialProviderRegistry);

  const result = await executor.execute({
    request: createRequest(),
    manifest: definition.manifest
  });

  assert.deepEqual(calls[0], {
    method: "resolve",
    input: {
      executor: "model",
      target: "summarize_fast",
      purpose: "generation"
    }
  });
  assert.equal(calls[1].method, "generateText");
  assert.equal(calls[1].input.credential.provider, "shared");
  assert.equal(result.generatedText, "Fast summary text.");
  assert.equal(result.webuiUrl, null);
  assert.match(result.sessionId, /^model:summarize_fast:/);
});

test("ModelExecutor prefers the shared credential path before api_key", async () => {
  let usedCredential;
  const modelClient = {
    async generateText(input) {
      usedCredential = input.credential;
      return {
        text: "Shared credential summary.",
        model: "openclaw:main"
      };
    }
  };
  const registry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
        RIGHTONCLAW_OPENCLAW_AGENT_ID: "main",
        RIGHTONCLAW_MODEL_API_KEY: "fallback-api-key",
        RIGHTONCLAW_MODEL_BASE_URL: "https://api.openai.com",
        RIGHTONCLAW_MODEL_NAME: "gpt-4.1-mini"
      }
    }),
    new ApiKeyCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
        RIGHTONCLAW_OPENCLAW_AGENT_ID: "main",
        RIGHTONCLAW_MODEL_API_KEY: "fallback-api-key",
        RIGHTONCLAW_MODEL_BASE_URL: "https://api.openai.com",
        RIGHTONCLAW_MODEL_NAME: "gpt-4.1-mini"
      }
    })
  ]);
  const executor = new ModelExecutor(modelClient, registry);

  await executor.execute({
    request: createRequest(),
    manifest: getExperimentalActionDefinition("summarize_fast").manifest
  });

  assert.equal(usedCredential.provider, "shared");
  assert.equal(usedCredential.kind, "shared_reference");
});

test("ModelExecutor falls back to api_key when shared credentials are unavailable", async () => {
  let usedCredential;
  const modelClient = {
    async generateText(input) {
      usedCredential = input.credential;
      return {
        text: "API key summary.",
        model: "gpt-4.1-mini"
      };
    }
  };
  const env = {
    RIGHTONCLAW_MODEL_API_KEY: "fallback-api-key",
    RIGHTONCLAW_MODEL_BASE_URL: "https://api.openai.com",
    RIGHTONCLAW_MODEL_NAME: "gpt-4.1-mini"
  };
  const registry = new CredentialProviderRegistry([
    new SharedCredentialProvider({ env }),
    new ApiKeyCredentialProvider({ env })
  ]);
  const executor = new ModelExecutor(modelClient, registry);

  await executor.execute({
    request: createRequest(),
    manifest: getExperimentalActionDefinition("summarize_fast").manifest
  });

  assert.equal(usedCredential.provider, "api_key");
  assert.equal(usedCredential.kind, "api_key");
  assert.equal(usedCredential.value.apiKey, "fallback-api-key");
});

test("ModelExecutor honors preferred credential providers from the manifest", async () => {
  let usedCredential;
  const modelClient = {
    async generateText(input) {
      usedCredential = input.credential;
      return {
        text: "API key answer.",
        model: "gpt-4.1-mini"
      };
    }
  };
  const env = {
    RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
    RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
    RIGHTONCLAW_OPENCLAW_AGENT_ID: "main",
    RIGHTONCLAW_MODEL_API_KEY: "fallback-api-key",
    RIGHTONCLAW_MODEL_BASE_URL: "https://api.openai.com",
    RIGHTONCLAW_MODEL_NAME: "gpt-4.1-mini"
  };
  const registry = new CredentialProviderRegistry([
    new SharedCredentialProvider({ env }),
    new ApiKeyCredentialProvider({ env })
  ]);
  const executor = new ModelExecutor(modelClient, registry);

  await executor.execute({
    request: createRequest("ask_claw"),
    manifest: {
      id: "ask_claw",
      title: "Ask Claw",
      runner: "model",
      sessionTitle: "Ask Claw",
      responseMode: "generate_text",
      preferredCredentialProviders: ["api_key"],
      buildPrompt() {
        return "Answer this.";
      }
    }
  });

  assert.equal(usedCredential.provider, "api_key");
  assert.equal(usedCredential.value.apiKey, "fallback-api-key");
});

test("ModelExecutor raises a structured error when no credential provider resolves", async () => {
  const executor = new ModelExecutor(
    {
      async generateText() {
        throw new Error("should not be called");
      }
    },
    new CredentialProviderRegistry([
      new SharedCredentialProvider({ env: {} }),
      new ApiKeyCredentialProvider({ env: {} })
    ])
  );

  await assert.rejects(
    executor.execute({
      request: createRequest(),
      manifest: getExperimentalActionDefinition("summarize_fast").manifest
    }),
    (error) => {
      assert.equal(error.code, "GENERATION_FAILED");
      assert.equal(error.phase, "generation");
      assert.equal(error.details.credential_error_code, "NO_CREDENTIAL_PROVIDER_RESOLVED");
      assert.deepEqual(error.details.attempted_providers, ["shared", "api_key"]);
      return true;
    }
  );
});

test("experimental summarize_fast keeps the standard summarize result envelope", async () => {
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      new ModelExecutor(
        {
          async generateText(input) {
            assert.equal(input.credential.provider, "api_key");
            return {
              text: "Fast summary text.",
              model: "gpt-4.1-mini"
            };
          }
        },
        new CredentialProviderRegistry([
          new SharedCredentialProvider({ env: {} }),
          new ApiKeyCredentialProvider({
            env: {
              RIGHTONCLAW_MODEL_API_KEY: "fallback-api-key",
              RIGHTONCLAW_MODEL_BASE_URL: "https://api.openai.com",
              RIGHTONCLAW_MODEL_NAME: "gpt-4.1-mini"
            }
          })
        ])
      )
    ])
  });

  const outcome = await runtime.executeExperimental("summarize_fast", createRequest("summarize"));

  assert.deepEqual(outcome.result, {
    title: "Summary",
    content: "Fast summary text.",
    content_format: "plain_text",
    session_id: outcome.result.session_id,
    webui_url: null,
    delivery: {
      preferred_mode: "popup",
      fallback_modes: ["clipboard", "open_webui"]
    }
  });
  assert.match(outcome.result.session_id, /^model:summarize_fast:/);
  assert.deepEqual(outcome.meta, {
    fallback_used: false,
    model: "gpt-4.1-mini",
    source_app_supported: false,
    delivery_mode: "popup"
  });
});

test("experimental explain_fast dispatches through ModelExecutor and keeps the explain envelope", async () => {
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      {
        runner: "openclaw",
        async execute() {
          throw new Error("explain_fast should not dispatch through OpenClawExecutor");
        }
      },
      new ModelExecutor(
        {
          async generateText(input) {
            assert.equal(input.credential.provider, "api_key");
            return {
              text: "This is a log message showing that deployment validation passed before the release step.",
              model: "gpt-4.1-mini"
            };
          }
        },
        new CredentialProviderRegistry([
          new SharedCredentialProvider({ env: {} }),
          new ApiKeyCredentialProvider({
            env: {
              RIGHTONCLAW_MODEL_API_KEY: "fallback-api-key",
              RIGHTONCLAW_MODEL_BASE_URL: "https://api.openai.com",
              RIGHTONCLAW_MODEL_NAME: "gpt-4.1-mini"
            }
          })
        ])
      )
    ])
  });

  const outcome = await runtime.executeExperimental("explain_fast", createRequest("explain"));

  assert.deepEqual(outcome.result, {
    title: "Explanation",
    content: "This is a log message showing that deployment validation passed before the release step.",
    content_format: "plain_text",
    session_id: outcome.result.session_id,
    webui_url: null,
    delivery: {
      preferred_mode: "popup",
      fallback_modes: ["clipboard", "open_webui"]
    }
  });
  assert.match(outcome.result.session_id, /^model:explain_fast:/);
  assert.deepEqual(outcome.meta, {
    fallback_used: false,
    model: "gpt-4.1-mini",
    source_app_supported: false,
    delivery_mode: "popup"
  });
});

test("ModelExecutor raises a structured credential failure for explain_fast", async () => {
  const executor = new ModelExecutor(
    {
      async generateText() {
        throw new Error("should not be called");
      }
    },
    new CredentialProviderRegistry([
      new SharedCredentialProvider({ env: {} }),
      new ApiKeyCredentialProvider({ env: {} })
    ])
  );

  await assert.rejects(
    executor.execute({
      request: createRequest("explain"),
      manifest: getExperimentalActionDefinition("explain_fast").manifest
    }),
    (error) => {
      assert.equal(error.code, "GENERATION_FAILED");
      assert.equal(error.phase, "generation");
      assert.equal(error.details.manifest_id, "explain_fast");
      assert.equal(error.details.credential_error_code, "NO_CREDENTIAL_PROVIDER_RESOLVED");
      assert.deepEqual(error.details.attempted_providers, ["shared", "api_key"]);
      return true;
    }
  );
});
