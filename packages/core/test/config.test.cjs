const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadBridgeConfig } = require("../dist/index.js");

test("loadBridgeConfig prefers local OpenClaw gateway token for loopback config", async (t) => {
  const tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "roc-core-config-"));
  const configPath = path.join(tmpdir, "openclaw.json");

  await fs.promises.writeFile(
    configPath,
    JSON.stringify({
      gateway: {
        auth: {
          token: "local-token"
        }
      }
    }),
    "utf8"
  );

  t.after(async () => {
    await fs.promises.rm(tmpdir, { recursive: true, force: true });
  });

  const config = loadBridgeConfig({
    RIGHTONCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:18789",
    RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
    RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "stale-env-token",
    OPENCLAW_CONFIG_PATH: configPath
  });

  assert.equal(config.openClawGatewayToken, "local-token");
});

test("loadBridgeConfig preserves explicit env token for non-local gateways", () => {
  const config = loadBridgeConfig({
    RIGHTONCLAW_OPENCLAW_BASE_URL: "https://example.com",
    RIGHTONCLAW_OPENCLAW_GATEWAY_URL: "https://example.com",
    RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN: "explicit-env-token",
    OPENCLAW_CONFIG_PATH: "/path/that/does/not/exist.json"
  });

  assert.equal(config.openClawGatewayToken, "explicit-env-token");
});
