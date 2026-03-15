const test = require("node:test");
const assert = require("node:assert/strict");

const { buildAskClawPanelPayload } = require("../dist/ask-claw-ui.js");

test("buildAskClawPanelPayload includes screenshot preview paths for screenshot selections", () => {
  const payload = buildAskClawPanelPayload({
    selectionContext: {
      kind: "screenshot",
      items: [
        {
          item_kind: "image",
          name: "capture.png",
          path: "/tmp/capture.png",
          mime_type: "image/png"
        }
      ],
      capture: {
        mode: "screenshot",
        created_at: "2026-03-13T00:00:00.000Z"
      },
      summary: "Screenshot captured"
    },
    initialPrompt: "Explain this"
  });

  assert.equal(payload.previewImagePath, "/tmp/capture.png");
  assert.equal(payload.initialPrompt, "Explain this");
});

test("buildAskClawPanelPayload creates lightweight suggestion prompts for config-like files", () => {
  const payload = buildAskClawPanelPayload({
    selectionContext: {
      kind: "file",
      items: [
        {
          item_kind: "file",
          name: "openclaw.json",
          path: "/tmp/openclaw.json",
          mime_type: "application/json"
        }
      ],
      capture: {
        mode: "finder",
        created_at: "2026-03-14T00:00:00.000Z"
      },
      summary: "1 file"
    }
  });

  assert.equal(payload.suggestions[0].preset, "summarize");
  assert.match(payload.suggestions[0].title, /config/i);
  assert.match(payload.suggestions[1].title, /settings/i);
  assert.equal(payload.suggestions.length, 3);
});

test("buildAskClawPanelPayload preserves the no-selection summary for manual ask flows", () => {
  const payload = buildAskClawPanelPayload({
    selectionContext: {
      kind: "mixed",
      items: [],
      capture: {
        mode: "manual",
        created_at: "2026-03-14T00:00:00.000Z"
      },
      summary: "No selection captured"
    }
  });

  assert.equal(payload.summary, "No selection captured");
  assert.equal(payload.detail, "");
  assert.equal(payload.suggestions[0].preset, "freeform");
  assert.match(payload.suggestions[0].title, /idea|prompt|unstuck/i);
});
