const assert = require("node:assert/strict");
const { once } = require("node:events");
const http = require("node:http");
const test = require("node:test");

const { probeOpenClaw, probeOpenClawGateway } = require("../dist/discovery.js");

async function withServer(handler, run) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address.");
  }

  try {
    await run(`http://127.0.0.1:${address.port}`);
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

test("probeOpenClaw reports healthy when the gateway replies successfully", async () => {
  await withServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/responses");
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  }, async (gatewayUrl) => {
    const result = await probeOpenClaw({
      gatewayUrl,
      agentId: "main"
    });

    assert.equal(result.healthy, true);
    assert.equal(result.reachable, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.reason, "probe_succeeded");
  });
});

test("probeOpenClawGateway reports healthy when the gateway health endpoint is live", async () => {
  await withServer((req, res) => {
    assert.equal(req.method, "GET");
    assert.equal(req.url, "/health");
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, status: "live" }));
  }, async (gatewayUrl) => {
    const result = await probeOpenClawGateway({
      gatewayUrl
    });

    assert.equal(result.healthy, true);
    assert.equal(result.reachable, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.reason, "probe_succeeded");
  });
});

test("probeOpenClaw reports unhealthy when the gateway responds with an error", async () => {
  await withServer((_req, res) => {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { message: "gateway failed" } }));
  }, async (gatewayUrl) => {
    const result = await probeOpenClaw({
      gatewayUrl,
      agentId: "main"
    });

    assert.equal(result.healthy, false);
    assert.equal(result.reachable, true);
    assert.equal(result.statusCode, 503);
    assert.equal(result.reason, "http_503");
  });
});

test("probeOpenClaw reports unreachable when no gateway is listening", async () => {
  const result = await probeOpenClaw({
    gatewayUrl: "http://127.0.0.1:9",
    requestTimeoutMs: 100
  });

  assert.equal(result.healthy, false);
  assert.equal(result.reachable, false);
  assert.equal(result.statusCode, null);
});
