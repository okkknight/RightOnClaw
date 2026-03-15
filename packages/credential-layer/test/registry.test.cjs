const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ApiKeyCredentialProvider,
  ConfiguredApiKeyCredentialProvider,
  CredentialProviderRegistry,
  CredentialResolutionError,
  SharedCredentialProvider
} = require("../dist/index.js");

test("registry prefers shared provider before api_key by default order", async () => {
  const registry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {
        RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "shared-token",
        RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789"
      }
    }),
    new ApiKeyCredentialProvider({
      env: {
        RIGHTONCLAW_MODEL_API_KEY: "api-key"
      }
    })
  ]);

  const resolved = await registry.resolve({
    executor: "model",
    purpose: "generation"
  });

  assert.equal(resolved.provider, "shared");
  assert.equal(resolved.kind, "shared_reference");
  assert.equal(resolved.value.gatewayToken, "shared-token");
});

test("registry falls back to api_key when shared provider cannot resolve", async () => {
  const registry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: {}
    }),
    new ApiKeyCredentialProvider({
      env: {
        RIGHTONCLAW_MODEL_API_KEY: "api-key",
        RIGHTONCLAW_MODEL_BASE_URL: "https://example.invalid",
        RIGHTONCLAW_MODEL_NAME: "fast-model"
      }
    })
  ]);

  const resolved = await registry.resolve({
    executor: "model",
    purpose: "generation"
  });

  assert.equal(resolved.provider, "api_key");
  assert.equal(resolved.kind, "api_key");
  assert.equal(resolved.value.apiKey, "api-key");
  assert.equal(resolved.value.baseUrl, "https://example.invalid");
  assert.equal(resolved.value.model, "fast-model");
});

test("api key provider only resolves for model executors", async () => {
  const provider = new ApiKeyCredentialProvider({
    env: {
      RIGHTONCLAW_MODEL_API_KEY: "api-key"
    }
  });

  assert.equal(provider.canResolve({ executor: "openclaw" }), false);
  assert.equal(provider.canResolve({ executor: "model" }), true);
});

test("configured api key provider resolves model credentials from backend config", async () => {
  const provider = new ConfiguredApiKeyCredentialProvider({
    backendConfig: {
      settings_path: "/tmp/rightonclaw-settings.json",
      backends: {
        openai_compatible: {
          enabled: true,
          api_key: "config-api-key",
          base_url: "https://api.example.invalid",
          model: "config-model"
        }
      }
    }
  });

  assert.equal(provider.canResolve({ executor: "model" }), true);

  const resolved = await provider.resolve({ executor: "model" });
  assert.equal(resolved.provider, "configured_api_key");
  assert.equal(resolved.value.apiKey, "config-api-key");
  assert.equal(resolved.value.baseUrl, "https://api.example.invalid");
  assert.equal(resolved.value.model, "config-model");
});

test("registry throws a structured error when no provider resolves", async () => {
  const registry = new CredentialProviderRegistry([
    new SharedCredentialProvider({ env: {} }),
    new ApiKeyCredentialProvider({ env: {} })
  ]);

  await assert.rejects(
    () =>
      registry.resolve({
        executor: "model",
        purpose: "generation"
      }),
    (error) => {
      assert.ok(error instanceof CredentialResolutionError);
      assert.equal(error.code, "NO_CREDENTIAL_PROVIDER_RESOLVED");
      assert.deepEqual(error.attemptedProviders, ["shared", "api_key"]);
      assert.equal(error.request.executor, "model");
      return true;
    }
  );
});
