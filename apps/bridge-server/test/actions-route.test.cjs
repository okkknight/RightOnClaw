const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { buildApp } = require("../dist/app.js");
const { createStaticBackendSelectionResolver } = require("../dist/backends/selection.js");

function createClientStub(overrides = {}) {
  return {
    async createSession() {
      return { sessionId: "sess_explain" };
    },
    async getLatestSession() {
      return null;
    },
    async sendMessage() {},
    async generateAssistantResponse() {
      return {
        text: "This is configuration text. It sets how RightOnClaw talks to OpenClaw.",
        model: "explain-model"
      };
    },
    async getSessionWebUrl() {
      return "http://127.0.0.1:3000/chat?session=sess_explain";
    },
    ...overrides
  };
}

function createExplainRequest(overrides = {}) {
  return {
    version: "1.0",
    action: "explain",
    source: {
      platform: "test",
      entry: "route-test",
      ...overrides.source
    },
    selection: overrides.selection ?? {
      kind: "text",
      text: "export RIGHTONCLAW_OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789",
      paths: [],
      mime: "text/plain",
      encoding: "utf-8",
      char_count: 67
    },
    options: overrides.options
  };
}

function createAskClawRequest(overrides = {}) {
  return {
    version: "1.0",
    action: "ask_claw",
    prompt: overrides.prompt ?? "What does this mean?",
    source: {
      platform: "test",
      entry: "route-test",
      ...overrides.source
    },
    selection: overrides.selection ?? {
      kind: "text",
      text: "export RIGHTONCLAW_OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789",
      paths: [],
      mime: "text/plain",
      encoding: "utf-8",
      char_count: 67
    },
    options: overrides.options
  };
}

test("POST /v1/actions/explain returns the standard explain envelope", async () => {
  const app = buildApp({
    client: createClientStub()
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/actions/explain",
      payload: createExplainRequest()
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.status, "ok");
    assert.equal(payload.action, "explain");
    assert.equal(payload.result.title, "Explanation");
    assert.match(payload.result.content, /configuration text/i);
    assert.equal(payload.result.content_format, "plain_text");
    assert.equal(payload.result.session_id, "sess_explain");
    assert.equal(payload.result.delivery.preferred_mode, "popup");
    assert.deepEqual(payload.result.delivery.fallback_modes, ["clipboard", "open_webui"]);
    assert.equal(payload.meta.delivery_mode, "popup");
  } finally {
    await app.close();
  }
});

test("POST /v1/actions/explain supports object-aware file selections through the bridge", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roc-bridge-"));
  const tempFile = path.join(tempDir, "demo.txt");
  await fs.writeFile(tempFile, "demo", "utf8");

  const app = buildApp({
    client: createClientStub({
      async generateAssistantResponse() {
        return {
          text: "This looks like a file-oriented request. RightOnClaw is explaining it based on the available metadata.",
          model: "explain-model"
        };
      }
    })
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/actions/explain",
      payload: createExplainRequest({
        selection: {
          kind: "file",
          text: null,
          paths: [tempFile],
          mime: "text/plain",
          encoding: "utf-8",
          char_count: null
        }
      })
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.status, "ok");
    assert.equal(payload.action, "explain");
    assert.equal(payload.result.title, "Explanation");
    assert.match(payload.result.content, /file-oriented request/i);
  } finally {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("POST /v1/actions/ask-claw returns the standard ask_claw envelope", async () => {
  const app = buildApp({
    client: createClientStub({
      async createSession() {
        return { sessionId: "sess_ask" };
      },
      async generateAssistantResponse() {
        return {
          text: "Ask Claw answer text.",
          model: "ask-model"
        };
      },
      async getSessionWebUrl() {
        return "http://127.0.0.1:3000/chat?session=sess_ask";
      }
    })
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/actions/ask-claw",
      payload: createAskClawRequest()
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.status, "ok");
    assert.equal(payload.action, "ask_claw");
    assert.equal(payload.result.title, "Ask Claw");
    assert.equal(payload.result.content, "Ask Claw answer text.");
    assert.equal(payload.result.content_format, "plain_text");
    assert.equal(payload.result.session_id, "sess_ask");
    assert.equal(payload.meta.delivery_mode, "popup");
  } finally {
    await app.close();
  }
});

test("POST /v1/actions/ask-claw enforces prompt-required validation for freeform requests", async () => {
  const app = buildApp({
    client: createClientStub()
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/actions/ask-claw",
      payload: createAskClawRequest({
        prompt: ""
      })
    });

    assert.equal(response.statusCode, 400);
    const payload = response.json();
    assert.equal(payload.status, "error");
    assert.equal(payload.action, "ask_claw");
    assert.equal(payload.error.code, "PROMPT_REQUIRED");
    assert.match(payload.error.message, /requires a prompt/i);
  } finally {
    await app.close();
  }
});

test("POST /v1/actions/summarize/stream emits status deltas, content deltas, and a final complete event", async () => {
  const app = buildApp({
    client: createClientStub({
      async generateAssistantResponse() {
        return {
          text: "Streaming summary text.",
          model: "summary-model"
        };
      }
    })
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/actions/summarize/stream",
      payload: {
        ...createExplainRequest({
          selection: {
            kind: "text",
            text: "summarize me",
            paths: [],
            mime: "text/plain",
            encoding: "utf-8",
            char_count: 12
          }
        }),
        action: "summarize"
      }
    });

    assert.equal(response.statusCode, 200);
    const body = response.body;
    assert.match(body, /"type":"start"/);
    assert.match(body, /"type":"delta"/);
    assert.match(body, /"delta_kind":"status"/);
    assert.match(body, /"delta_kind":"content"/);
    assert.match(body, /"type":"complete"/);
    assert.match(body, /Streaming summary text\./);
  } finally {
    await app.close();
  }
});

test("POST /v1/actions/send-to-claw returns a structured backend error when the selected backend is not OpenClaw", async () => {
  const app = buildApp({
    client: createClientStub(),
    backendSelectionResolver: createStaticBackendSelectionResolver({
      selection_mode: "manual",
      requested_backend: "openai_compatible",
      default_backend: "openai_compatible",
      fast_path_available: false
    })
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/actions/send-to-claw",
      payload: {
        version: "1.0",
        action: "send_to_claw",
        source: {
          platform: "test",
          entry: "route-test"
        },
        selection: {
          kind: "text",
          text: "send this to claw",
          paths: [],
          mime: "text/plain",
          encoding: "utf-8",
          char_count: 17
        }
      }
    });

    assert.equal(response.statusCode, 409);
    const payload = response.json();
    assert.equal(payload.status, "error");
    assert.equal(payload.error.code, "BACKEND_UNSUPPORTED_ACTION");
  } finally {
    await app.close();
  }
});
