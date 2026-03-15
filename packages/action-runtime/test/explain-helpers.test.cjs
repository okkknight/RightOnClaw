const test = require("node:test");
const assert = require("node:assert/strict");

const { buildExplainPrompt, buildExplainResult } = require("../dist/actions/explain-helpers.js");

test("buildExplainPrompt preserves the explain-specific instruction set", () => {
  const prompt = buildExplainPrompt("SELECT * FROM payments;");

  assert.match(prompt, /Action: explain/);
  assert.match(prompt, /Focus on understanding and interpretation, not just compression/i);
  assert.match(prompt, /Do not rewrite the content unless a small quoted example is necessary to explain it/i);
  assert.match(prompt, /BEGIN_SELECTED_TEXT/);
  assert.match(prompt, /SELECT \* FROM payments;/);
  assert.match(prompt, /END_SELECTED_TEXT/);
});

test("buildExplainResult preserves the explain result envelope", () => {
  assert.deepEqual(
    buildExplainResult("This is a SQL query.", {
      sessionId: "sess_123",
      webuiUrl: "http://127.0.0.1:3000/chat?session=sess_123"
    }),
    {
      title: "Explanation",
      content: "This is a SQL query.",
      content_format: "plain_text",
      session_id: "sess_123",
      webui_url: "http://127.0.0.1:3000/chat?session=sess_123",
      delivery: {
        preferred_mode: "popup",
        fallback_modes: ["clipboard", "open_webui"]
      }
    }
  );
});
