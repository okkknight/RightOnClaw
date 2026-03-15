const test = require("node:test");
const assert = require("node:assert/strict");

const { buildApp } = require("../dist/app.js");
const { createStaticBackendSelectionResolver } = require("../dist/backends/selection.js");

test("GET /v1/capabilities advertises ask_claw and streaming-aware action details", async () => {
  const app = buildApp({
    backendSelectionResolver: createStaticBackendSelectionResolver({
      default_backend: "openclaw",
      fast_path_backend: "openclaw",
      fast_path_available: true
    })
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/capabilities"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.status, "ok");
    assert.ok(payload.actions.includes("ask_claw"));
    assert.deepEqual(payload.action_details.ask_claw.selection_kinds, [
      "text",
      "file",
      "folder",
      "image",
      "screenshot",
      "mixed"
    ]);
    assert.equal(payload.action_details.ask_claw.streaming, true);
    assert.equal(payload.action_details.rewrite.streaming, false);
    assert.equal(payload.backend_summary.default_backend, "openclaw");
    assert.equal(payload.backend_summary.fast_path_available, true);
  } finally {
    await app.close();
  }
});
