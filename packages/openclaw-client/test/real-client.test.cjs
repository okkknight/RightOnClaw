const assert = require("node:assert/strict");
const { once } = require("node:events");
const http = require("node:http");
const test = require("node:test");

const { RealOpenClawClient } = require("../dist/real-client.js");

async function withServer(handler, run) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body
    });

    await handler(req, res, body);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address.");
  }

  try {
    await run({
      baseUrl: `http://127.0.0.1:${address.port}`,
      requests
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

function writeJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

test("generateAssistantResponse posts the staged prompt to OpenClaw and extracts assistant text", async () => {
  await withServer(
    async (_req, res) => {
      writeJson(res, 200, {
        object: "response",
        status: "completed",
        model: "openclaw:main",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "summary text" }]
          }
        ]
      });
    },
    async ({ baseUrl, requests }) => {
      const client = new RealOpenClawClient({
        gatewayUrl: baseUrl,
        baseUrl: "http://127.0.0.1:18789",
        authToken: "secret",
        agentId: "main",
        generationMaxOutputTokens: 90
      });

      const { sessionId } = await client.createSession({ title: "Summarize" });
      await client.sendMessage({
        sessionId,
        role: "user",
        content: "Summarize this text."
      });

      const generated = await client.generateAssistantResponse({ sessionId });

      assert.equal(generated.text, "summary text");
      assert.equal(generated.model, "openclaw:main");
      assert.equal(requests.length, 1);

      const request = requests[0];
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/v1/responses");
      assert.equal(request.headers.authorization, "Bearer secret");
      assert.equal(request.headers["x-openclaw-agent-id"], "main");
      assert.equal(request.headers["x-openclaw-session-key"], sessionId);

      assert.deepEqual(JSON.parse(request.body), {
        model: "openclaw:main",
        input: "Summarize this text.",
        stream: false,
        max_output_tokens: 90
      });

      assert.deepEqual(await client.getLatestSession(), { sessionId });
      assert.equal(
        await client.getSessionWebUrl({ sessionId }),
        `http://127.0.0.1:18789/chat?session=${encodeURIComponent(sessionId)}`
      );
      assert.equal(requests.length, 1);
    }
  );
});

test("getSessionWebUrl flushes a staged send_to_claw prompt before returning a chat deeplink", async () => {
  await withServer(
    async (_req, res) => {
      writeJson(res, 200, {
        object: "response",
        status: "completed",
        model: "openclaw:main",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "ok" }]
          }
        ]
      });
    },
    async ({ baseUrl, requests }) => {
      const client = new RealOpenClawClient({
        gatewayUrl: baseUrl,
        baseUrl: "http://127.0.0.1:18789/openclaw",
        sendToClawMaxOutputTokens: 7
      });

      const { sessionId } = await client.createSession({ title: "Send to Claw" });
      await client.sendMessage({
        sessionId,
        role: "user",
        content: "Structured context block."
      });

      const webUrl = await client.getSessionWebUrl({ sessionId });

      assert.equal(webUrl, `http://127.0.0.1:18789/openclaw/chat?session=${encodeURIComponent(sessionId)}`);
      assert.equal(requests.length, 1);
      assert.deepEqual(JSON.parse(requests[0].body), {
        model: "openclaw:main",
        input: "Structured context block.",
        stream: false,
        max_output_tokens: 7
      });
      assert.deepEqual(await client.getLatestSession(), { sessionId });
    }
  );
});

test("OpenClaw 5xx responses map to OPENCLAW_UNAVAILABLE", async () => {
  await withServer(
    async (_req, res) => {
      writeJson(res, 500, {
        error: {
          message: "gateway failed"
        }
      });
    },
    async ({ baseUrl }) => {
      const client = new RealOpenClawClient({
        gatewayUrl: baseUrl
      });

      const { sessionId } = await client.createSession({ title: "Rewrite" });
      await client.sendMessage({
        sessionId,
        role: "user",
        content: "Rewrite this text."
      });

      await assert.rejects(
        () => client.generateAssistantResponse({ sessionId }),
        (error) => {
          assert.equal(error.code, "OPENCLAW_UNAVAILABLE");
          assert.match(error.message, /gateway failed/i);
          return true;
        }
      );
    }
  );
});

test("invalid completed payloads map to GENERATION_FAILED", async () => {
  await withServer(
    async (_req, res) => {
      writeJson(res, 200, {
        object: "response",
        status: "completed",
        model: "openclaw:main",
        output: []
      });
    },
    async ({ baseUrl }) => {
      const client = new RealOpenClawClient({
        gatewayUrl: baseUrl
      });

      const { sessionId } = await client.createSession({ title: "Rewrite" });
      await client.sendMessage({
        sessionId,
        role: "user",
        content: "Rewrite this text."
      });

      await assert.rejects(
        () => client.generateAssistantResponse({ sessionId }),
        (error) => {
          assert.equal(error.code, "GENERATION_FAILED");
          assert.match(error.message, /returned no assistant text/i);
          return true;
        }
      );
    }
  );
});
