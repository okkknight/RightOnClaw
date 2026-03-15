const test = require("node:test");
const assert = require("node:assert/strict");

const { OpenClawResponsesExecutor } = require("../dist/index.js");
const {
  ApiKeyCredentialProvider,
  CredentialProviderRegistry,
  SharedCredentialProvider
} = require("@rightonclaw/credential-layer");

function createRequest(action = "summarize") {
  return {
    version: "1.0",
    request_id: `req-${action}`,
    action,
    source: {
      platform: "test",
      entry: "unit-test"
    },
    selection: {
      kind: "text",
      text: "RightOnClaw integrates macOS with OpenClaw.",
      mime: "text/plain",
      encoding: "utf-8",
      char_count: 43
    }
  };
}

function createManifest(id = "summarize") {
  return {
    id,
    title: id === "explain" ? "Explain" : "Summary",
    runner: "openclaw_responses",
    sessionTitle: id === "explain" ? "Explain" : "Summarize",
    responseMode: "generate_text",
    maxOutputTokens: id === "explain" ? 192 : 96,
    buildPrompt() {
      return `Prompt for ${id}`;
    }
  };
}

test("OpenClawResponsesExecutor uses shared credentials to call the OpenClaw responses fast path", async () => {
  const calls = [];
  const registry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
        RIGHTONCLAW_OPENCLAW_AGENT_ID: "main"
      }
    }),
    new ApiKeyCredentialProvider({ env: {} })
  ]);
  const executor = new OpenClawResponsesExecutor(
    {
      async generateText(input) {
        calls.push(input);
        return {
          text: "Fast summary text.",
          model: "openclaw:main"
        };
      }
    },
    registry
  );

  const result = await executor.execute({
    request: createRequest("summarize"),
    manifest: createManifest("summarize")
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].credential.provider, "shared");
  assert.equal(calls[0].requestId, "req-summarize");
  assert.equal(calls[0].maxOutputTokens, 96);
  assert.match(calls[0].sessionId, /^agent:main:rightonclaw:/);
  assert.equal(result.generatedText, "Fast summary text.");
  assert.equal(result.model, "openclaw:main");
  assert.equal(result.webuiUrl, null);
  assert.equal(result.credentialProvider, "shared");
  assert.match(result.sessionId, /^agent:main:rightonclaw:/);
});

test("OpenClawResponsesExecutor raises a structured error when no OpenClaw credential resolves", async () => {
  const executor = new OpenClawResponsesExecutor(
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
      manifest: createManifest("explain")
    }),
    (error) => {
      assert.equal(error.code, "GENERATION_FAILED");
      assert.equal(error.phase, "generation");
      assert.equal(error.details.manifest_id, "explain");
      assert.equal(error.details.credential_error_code, "NO_CREDENTIAL_PROVIDER_RESOLVED");
      assert.deepEqual(error.details.attempted_providers, ["shared", "api_key"]);
      return true;
    }
  );
});
