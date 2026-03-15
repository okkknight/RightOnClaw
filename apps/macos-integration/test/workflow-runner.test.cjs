const test = require("node:test");
const assert = require("node:assert/strict");

const { runScreenshotFlow, runWorkflow } = require("../dist/workflow-runner.js");
const { showPopup } = require("../dist/popup.js");

function createSummarizeResponse(overrides = {}) {
  return {
    request_id: "req-summarize",
    status: "ok",
    action: "summarize",
    result: {
      title: "Summary",
      content: "summary text",
      content_format: "plain_text",
      session_id: "sess_summary",
      webui_url: "http://127.0.0.1:3000/chat/sess_summary",
      delivery: {
        preferred_mode: "popup",
        fallback_modes: ["clipboard", "open_webui"]
      },
      ...overrides.result
    },
    error: null,
    meta: {
      duration_ms: 1,
      fallback_used: false,
      delivery_mode: "popup",
      ...overrides.meta
    },
    ...overrides
  };
}

function createExplainResponse(overrides = {}) {
  return {
    request_id: "req-explain",
    status: "ok",
    action: "explain",
    result: {
      title: "Explanation",
      content: "This is an environment variable assignment that points RightOnClaw at the local OpenClaw Gateway.",
      content_format: "plain_text",
      session_id: "sess_explain",
      webui_url: "http://127.0.0.1:3000/chat/sess_explain",
      delivery: {
        preferred_mode: "popup",
        fallback_modes: ["clipboard", "open_webui"]
      },
      ...overrides.result
    },
    error: null,
    meta: {
      duration_ms: 1,
      fallback_used: false,
      delivery_mode: "popup",
      ...overrides.meta
    },
    ...overrides
  };
}

function createAskClawResponse(overrides = {}) {
  return {
    request_id: "req-ask-claw",
    status: "ok",
    action: "ask_claw",
    result: {
      title: "Ask Claw",
      content: "answer text",
      content_format: "plain_text",
      session_id: "sess_ask",
      webui_url: "http://127.0.0.1:3000/chat/sess_ask",
      delivery: {
        preferred_mode: "popup",
        fallback_modes: ["clipboard", "open_webui"]
      },
      ...overrides.result
    },
    error: null,
    meta: {
      duration_ms: 1,
      fallback_used: false,
      delivery_mode: "popup",
      ...overrides.meta
    },
    ...overrides
  };
}

function createRewriteResponse(overrides = {}) {
  return {
    request_id: "req-rewrite",
    status: "ok",
    action: "rewrite",
    result: {
      title: "Rewrite",
      content: "rewritten text",
      content_format: "plain_text",
      session_id: "sess_123",
      webui_url: "http://127.0.0.1:3000/chat/sess_123",
      delivery: {
        preferred_mode: "popup",
        fallback_modes: ["clipboard", "open_webui"]
      },
      ...overrides.result
    },
    error: null,
    meta: {
      duration_ms: 1,
      fallback_used: false,
      delivery_mode: "popup",
      ...overrides.meta
    },
    ...overrides
  };
}

function createSendToClawResponse() {
  return {
    request_id: "req-send",
    status: "ok",
    action: "send_to_claw",
    result: {
      content: null,
      session_id: "sess_send",
      webui_url: "http://127.0.0.1:3000/chat/sess_send",
      delivery: {
        preferred_mode: "open_webui",
        fallback_modes: ["clipboard"]
      }
    },
    error: null,
    meta: {
      duration_ms: 1,
      fallback_used: false,
      delivery_mode: "open_webui"
    }
  };
}

function createSendToClawResponseWithoutUrl() {
  return {
    request_id: "req-send-no-url",
    status: "ok",
    action: "send_to_claw",
    result: {
      content: "The message was sent to Claw, but RightOnClaw could not build a session URL automatically.",
      session_id: "sess_send",
      webui_url: null,
      delivery: {
        preferred_mode: "open_webui",
        fallback_modes: ["popup", "clipboard"]
      }
    },
    error: null,
    meta: {
      duration_ms: 1,
      fallback_used: true,
      delivery_mode: "open_webui"
    }
  };
}

function createLoadingHudStub(events = []) {
  return (message) => {
    events.push(`hud:create:${message}`);
    let dismissed = false;
    return {
      async dismiss() {
        if (dismissed) {
          return;
        }

        dismissed = true;
        events.push("hud:dismiss");
      }
    };
  };
}

function createStreamingPopupStub(events = [], states = []) {
  return async ({ title }) => {
    const state = {
      updates: [],
      completed: null,
      failures: []
    };
    states.push(state);
    events.push(`stream-popup:create:${title}`);

    return {
      async update(payload) {
        state.updates.push(payload);
        if (payload.detail) {
          events.push(`stream-popup:update:${payload.detail}`);
        }
      },
      async complete(payload) {
        state.completed = payload;
        events.push(`stream-popup:complete:${payload.title ?? title}`);
      },
      async fail(message) {
        state.failures.push(message);
        events.push(`stream-popup:fail:${message}`);
      },
      async waitForClose() {
        events.push("stream-popup:wait");
      },
      async close() {
        events.push("stream-popup:close");
      }
    };
  };
}

function createAskClawPanelSessionStub(submissions = [], events = [], states = [], inputHandler = () => {}) {
  return async (input) => {
    inputHandler(input);
    const state = {
      statuses: [],
      updates: [],
      completed: [],
      closed: false
    };
    states.push(state);

    return {
      async *events() {
        for (const submission of submissions) {
          yield submission;
        }
      },
      async setStatus(status) {
        state.statuses.push(status);
        events.push(`ask-panel:status:${status}`);
      },
      async updateAssistantMessage(payload) {
        state.updates.push(payload);
        events.push(`ask-panel:update:${payload.body}`);
      },
      async completeAssistantMessage(payload) {
        state.completed.push(payload);
        events.push(`ask-panel:complete:${payload.body}`);
      },
      async close() {
        state.closed = true;
        events.push("ask-panel:close");
      }
    };
  };
}

function createTextSelection(text) {
  return {
    kind: "text",
    text,
    paths: [],
    mime: "text/plain",
    encoding: "utf-8",
    char_count: text.length
  };
}

function createScreenshotSelection(path = "/tmp/screenshot.png") {
  return {
    kind: "file",
    text: null,
    paths: [path],
    mime: "image/png",
    encoding: null,
    char_count: null
  };
}

function createTextSelectionContext(text) {
  return {
    kind: "text",
    text: {
      value: text,
      char_count: text.length
    },
    items: [
      {
        item_kind: "text",
        name: "Selected Text",
        inline_text_preview: text
      }
    ],
    capture: {
      mode: "selection",
      created_at: "2026-03-13T00:00:00.000Z"
    },
    summary: `Selected text (${text.length} chars)`
  };
}

function createScreenshotSelectionContext(path = "/tmp/screenshot.png") {
  return {
    kind: "screenshot",
    items: [
      {
        item_kind: "image",
        name: "screenshot.png",
        path,
        mime_type: "image/png"
      }
    ],
    capture: {
      mode: "screenshot",
      created_at: "2026-03-13T00:00:00.000Z"
    },
    summary: "Screenshot captured"
  };
}

test("rewrite returns replacement text after the user confirms overwrite", async () => {
  const popups = [];

  const result = await runWorkflow(
    { action: "rewrite", inputMode: "text" },
    "draft text",
    [],
    {
      postAction: async () => createRewriteResponse(),
      createLoadingHud: createLoadingHudStub(),
      buildSelectionContext: async () => createTextSelectionContext("draft text"),
      showPopup: async (payload) => {
        popups.push(payload);
        return "replace_selection";
      }
    }
  );

  assert.equal(popups.length, 1);
  assert.equal(popups[0].allowReplaceSelection, true);
  assert.match(popups[0].detail, /Replace Selection/i);
  assert.deepEqual(result, {
    replacementText: "rewritten text"
  });
});

test("rewrite preview can be dismissed without automatic overwrite or clipboard writes", async () => {
  const clipboardWrites = [];
  const popups = [];

  await runWorkflow(
    { action: "rewrite", inputMode: "text" },
    "draft text",
    [],
    {
      postAction: async () => createRewriteResponse(),
      writeClipboardText: async (text) => {
        clipboardWrites.push(text);
      },
      buildSelectionContext: async () => createTextSelectionContext("draft text"),
      createLoadingHud: createLoadingHudStub(),
      showPopup: async (payload) => {
        popups.push(payload);
        return "close";
      }
    }
  );

  assert.deepEqual(clipboardWrites, []);
  assert.equal(popups.length, 1);
  assert.equal(popups[0].allowReplaceSelection, true);
});

test("send_to_claw webui-open failure falls back to popup and clipboard", async () => {
  const clipboardWrites = [];
  const popups = [];

  await runWorkflow(
    { action: "send_to_claw", inputMode: "text" },
    "send this",
    [],
    {
      postAction: async () => createSendToClawResponse(),
      buildSelectionContext: async () => createTextSelectionContext("send this"),
      openUrl: async () => {
        throw new Error("open command failed");
      },
      writeClipboardText: async (text) => {
        clipboardWrites.push(text);
      },
      createLoadingHud: createLoadingHudStub(),
      showPopup: async (payload) => {
        popups.push(payload);
        return "close";
      }
    }
  );

  assert.deepEqual(clipboardWrites, ["http://127.0.0.1:3000/chat/sess_send"]);
  assert.equal(popups.length, 1);
  assert.equal(popups[0].title, "Sent to Claw");
  assert.match(popups[0].detail, /open command failed/i);
});

test("send_to_claw without a webui url shows a success popup instead of failing", async () => {
  const popups = [];

  await runWorkflow(
    { action: "send_to_claw", inputMode: "text" },
    "send this",
    [],
    {
      postAction: async () => createSendToClawResponseWithoutUrl(),
      buildSelectionContext: async () => createTextSelectionContext("send this"),
      createLoadingHud: createLoadingHudStub(),
      showPopup: async (payload) => {
        popups.push(payload);
      }
    }
  );

  assert.equal(popups.length, 1);
  assert.equal(popups[0].title, "Sent to Claw");
  assert.match(popups[0].body, /message was sent to Claw/i);
  assert.match(popups[0].detail, /no WebUI URL/i);
});

test("summarize uses the streaming popup path and does not create a loading HUD", async () => {
  const events = [];
  const popupStates = [];

  await runWorkflow(
    { action: "summarize", inputMode: "text" },
    "summarize this",
    [],
    {
      createLoadingHud: createLoadingHudStub(events),
      buildSelectionContext: async () => createTextSelectionContext("summarize this"),
      createStreamingPopup: createStreamingPopupStub(events, popupStates),
      streamAction: async function* (input) {
        events.push(`stream:${input.action}`);
        assert.equal(input.action, "summarize");
        assert.equal(input.selection_context.kind, "text");
        yield { type: "start", request_id: "req-summarize" };
        yield { type: "delta", request_id: "req-summarize", delta: "Analyzing selection..." };
        yield {
          type: "complete",
          request_id: "req-summarize",
          result: createSummarizeResponse().result
        };
      }
    }
  );

  assert.deepEqual(events, [
    "stream-popup:create:Summary",
    "stream-popup:update:Preparing request...",
    "stream:summarize",
    "stream-popup:update:Analyzing selection...",
    "stream-popup:complete:Summary",
    "stream-popup:wait"
  ]);
  assert.equal(popupStates[0].completed.body, "summary text");
});

test("explain uses the streaming popup path and does not require a final static popup", async () => {
  const events = [];
  const popupStates = [];

  await runWorkflow(
    { action: "explain", inputMode: "text" },
    "explain this",
    [],
    {
      buildSelectionContext: async () => createTextSelectionContext("explain this"),
      createStreamingPopup: createStreamingPopupStub(events, popupStates),
      streamAction: async function* (input) {
        events.push(`stream:${input.action}`);
        assert.equal(input.action, "explain");
        yield { type: "start", request_id: "req-explain" };
        yield { type: "delta", request_id: "req-explain", delta: "Generating response..." };
        yield {
          type: "complete",
          request_id: "req-explain",
          result: createExplainResponse().result
        };
      }
    }
  );

  assert.deepEqual(events, [
    "stream-popup:create:Explanation",
    "stream-popup:update:Preparing request...",
    "stream:explain",
    "stream-popup:update:Generating response...",
    "stream-popup:complete:Explanation",
    "stream-popup:wait"
  ]);
  assert.equal(popupStates[0].completed.body, createExplainResponse().result.content);
});

test("streaming fallback uses the normal bridge response when the stream transport is unavailable", async () => {
  const events = [];
  const popupStates = [];

  await runWorkflow(
    { action: "summarize", inputMode: "text" },
    "summarize this",
    [],
    {
      buildSelectionContext: async () => createTextSelectionContext("summarize this"),
      createStreamingPopup: createStreamingPopupStub(events, popupStates),
      streamAction: async function* () {
        throw new Error("stream failed");
      },
      postAction: async () => {
        events.push("postAction:fallback");
        return createSummarizeResponse();
      }
    }
  );

  assert.deepEqual(events, [
    "stream-popup:create:Summary",
    "stream-popup:update:Preparing request...",
    "stream-popup:update:Streaming is unavailable. Showing the final result when ready.",
    "postAction:fallback",
    "stream-popup:complete:Summary",
    "stream-popup:wait"
  ]);
  assert.equal(popupStates[0].completed.body, "summary text");
});

test("ask_claw freeform prompt uses the new ask_claw action and streams inside the Ask Panel", async () => {
  const events = [];
  const panelStates = [];
  let capturedInput = null;

  await runWorkflow(
    { action: "ask_claw", inputMode: "text" },
    "selected text",
    [],
    {
      buildSelectionContext: async () => createTextSelectionContext("selected text"),
      createAskClawPanelSession: createAskClawPanelSessionStub(
        [{ type: "submit", preset: "freeform", prompt: "What does this mean?" }],
        events,
        panelStates,
        ({ selectionContext }) => {
        assert.equal(selectionContext.kind, "text");
        }
      ),
      streamAction: async function* (input) {
        capturedInput = input;
        yield { type: "start", request_id: "req-ask" };
        yield {
          type: "complete",
          request_id: "req-ask",
          result: createAskClawResponse().result
        };
      }
    }
  );

  assert.equal(capturedInput.action, "ask_claw");
  assert.equal(capturedInput.prompt, "What does this mean?");
  assert.equal(capturedInput.selection_context.kind, "text");
  assert.equal(panelStates[0].completed[0].body, "answer text");
  assert.deepEqual(panelStates[0].statuses, ["running", "ready"]);
});

test("ask_claw falls back to a one-shot prompt dialog when the native panel cannot be created", async () => {
  const events = [];
  const popupStates = [];
  let fallbackInput = null;
  let streamInput = null;

  await runWorkflow(
    { action: "ask_claw", inputMode: "text" },
    "selected text",
    [],
    {
      buildSelectionContext: async () => createTextSelectionContext("selected text"),
      createAskClawPanelSession: async () => {
        throw new Error("Ask panel unavailable");
      },
      promptForAskClawFallback: async (input) => {
        fallbackInput = input;
        return {
          outcome: "submit",
          preset: "freeform",
          prompt: "Explain this selection."
        };
      },
      createStreamingPopup: createStreamingPopupStub(events, popupStates),
      streamAction: async function* (input) {
        streamInput = input;
        yield {
          type: "complete",
          request_id: "req-ask-fallback",
          result: createAskClawResponse({
            result: {
              content: "fallback answer"
            }
          }).result
        };
      }
    }
  );

  assert.equal(fallbackInput.selectionContext.kind, "text");
  assert.equal(streamInput.action, "ask_claw");
  assert.equal(streamInput.prompt, "Explain this selection.");
  assert.equal(popupStates[0].completed.body, "fallback answer");
});

test("ask_claw streams body content directly into the Ask Panel conversation", async () => {
  const panelStates = [];

  await runWorkflow(
    { action: "ask_claw", inputMode: "text" },
    "selected text",
    [],
    {
      buildSelectionContext: async () => createTextSelectionContext("selected text"),
      createAskClawPanelSession: createAskClawPanelSessionStub(
        [{ type: "submit", preset: "freeform", prompt: "Explain this selection." }],
        [],
        panelStates
      ),
      streamAction: async function* () {
        yield { type: "start", request_id: "req-ask-visible" };
        yield {
          type: "delta",
          request_id: "req-ask-visible",
          delta_kind: "status",
          delta: "Analyzing selection..."
        };
        yield {
          type: "delta",
          request_id: "req-ask-visible",
          delta_kind: "content",
          delta: "Partial answer "
        };
        yield {
          type: "delta",
          request_id: "req-ask-visible",
          delta_kind: "content",
          delta: "continues."
        };
        yield {
          type: "complete",
          request_id: "req-ask-visible",
          result: createAskClawResponse({
            result: {
              content: "Partial answer continues."
            }
          }).result
        };
      }
    }
  );

  assert.equal(panelStates[0].updates[0].body, "Partial answer ");
  assert.equal(panelStates[0].updates[1].body, "Partial answer continues.");
  assert.equal(panelStates[0].completed[0].body, "Partial answer continues.");
});

test("ask_claw follow-up requests include recent conversation turns as context", async () => {
  const streamInputs = [];

  await runWorkflow(
    { action: "ask_claw", inputMode: "text" },
    "selected text",
    [],
    {
      buildSelectionContext: async () => createTextSelectionContext("selected text"),
      createAskClawPanelSession: createAskClawPanelSessionStub(
        [
          { type: "submit", preset: "freeform", prompt: "What does this config do?" },
          { type: "submit", preset: "freeform", prompt: "Which part matters most?" }
        ],
        [],
        []
      ),
      streamAction: async function* (input) {
        streamInputs.push(input.prompt);

        if (streamInputs.length === 1) {
          yield {
            type: "complete",
            request_id: "req-follow-up-1",
            result: createAskClawResponse({
              result: {
                content: "It configures the gateway and dashboard access."
              }
            }).result
          };
          return;
        }

        yield {
          type: "complete",
          request_id: "req-follow-up-2",
          result: createAskClawResponse({
            result: {
              content: "The gateway token and dashboard settings matter most."
            }
          }).result
        };
      }
    }
  );

  assert.equal(streamInputs[0], "What does this config do?");
  assert.match(streamInputs[1], /Previous conversation:/);
  assert.match(streamInputs[1], /What does this config do\?/);
  assert.match(streamInputs[1], /It configures the gateway and dashboard access\./);
  assert.match(streamInputs[1], /Latest user request:\nWhich part matters most\?/);
});

test("ask_claw generation failures degrade to a copyable manual handoff instead of surfacing internal errors", async () => {
  const panelStates = [];

  await runWorkflow(
    { action: "ask_claw", inputMode: "text" },
    "selected text",
    [],
    {
      buildSelectionContext: async () => createTextSelectionContext("selected text"),
      createAskClawPanelSession: createAskClawPanelSessionStub(
        [{ type: "submit", preset: "freeform", prompt: "What does this mean?" }],
        [],
        panelStates
      ),
      streamAction: async function* () {
        yield {
          type: "error",
          request_id: "req-ask-error",
          error_code: "OPENCLAW_UNAVAILABLE",
          message: "internal error",
          details: {
            upstream_status: 500
          }
        };
      }
    }
  );

  assert.equal(panelStates[0].completed[0].body, "Claw could not generate a response right now.");
  assert.match(panelStates[0].completed[0].copyText, /User request:/i);
  assert.doesNotMatch(panelStates[0].completed[0].body, /internal error/i);
});

test("ask_claw quick preset can dispatch send_to_claw directly", async () => {
  const events = [];
  const panelStates = [];
  let postActionInput = null;

  await runWorkflow(
    { action: "ask_claw", inputMode: "text" },
    "selected text",
    [],
    {
      buildSelectionContext: async () => createTextSelectionContext("selected text"),
      createAskClawPanelSession: createAskClawPanelSessionStub(
        [{ type: "submit", preset: "send_to_claw", prompt: "Send this to Claw." }],
        events,
        panelStates
      ),
      postAction: async (input) => {
        postActionInput = input;
        return createSendToClawResponse();
      },
      openUrl: async (url) => {
        events.push(`open:${url}`);
      }
    }
  );

  assert.equal(postActionInput.action, "send_to_claw");
  assert.equal(postActionInput.options.prompt_preset, "send_to_claw");
  assert.deepEqual(panelStates[0].statuses, ["running", "ready"]);
  assert.equal(panelStates[0].completed[0].body, "Sent to Claw. Opening the OpenClaw session now.");
  assert.deepEqual(events, ["ask-panel:status:running", "open:http://127.0.0.1:3000/chat/sess_send", "ask-panel:complete:Sent to Claw. Opening the OpenClaw session now.", "ask-panel:status:ready", "ask-panel:close"]);
});

test("ask_claw hotkey flow captures the current focused selection when available", async () => {
  const panelStates = [];
  let buildSelectionContextInput = null;
  let streamActionInput = null;

  await runWorkflow(
    { action: "ask_claw", inputMode: "auto" },
    "",
    [],
    {
      captureFocusedSelection: async () => ({
        selection: createTextSelection("focused text"),
        captureMode: "selection",
        sourceAppName: "TextEdit",
        bundleId: "com.apple.TextEdit"
      }),
      buildSelectionContext: async (selection, input) => {
        buildSelectionContextInput = { selection, input };
        return createTextSelectionContext("focused text");
      },
      createAskClawPanelSession: createAskClawPanelSessionStub(
        [{ type: "submit", preset: "freeform", prompt: "Explain this selection." }],
        [],
        panelStates
      ),
      streamAction: async function* (input) {
        streamActionInput = input;
        yield {
          type: "complete",
          request_id: "req-hotkey",
          result: createAskClawResponse().result
        };
      }
    }
  );

  assert.equal(buildSelectionContextInput.selection.text, "focused text");
  assert.equal(buildSelectionContextInput.input.captureMode, "selection");
  assert.equal(buildSelectionContextInput.input.sourceApp, "TextEdit");
  assert.equal(streamActionInput.source.entry, "hotkey");
  assert.equal(streamActionInput.source.app_name, "TextEdit");
  assert.equal(streamActionInput.source.bundle_id, "com.apple.TextEdit");
  assert.equal(streamActionInput.prompt, "Explain this selection.");
  assert.equal(panelStates[0].completed[0].body, "answer text");
});

test("screenshot cancel exits cleanly without opening the Ask Claw UI", async () => {
  let askPanelOpened = false;

  const result = await runScreenshotFlow("freeform", {
    captureScreenshot: async () => ({ status: "cancel" }),
    createAskClawPanelSession: async () => {
      askPanelOpened = true;
      return createAskClawPanelSessionStub([], [], [])();
    }
  });

  assert.deepEqual(result, {});
  assert.equal(askPanelOpened, false);
});

test("screenshot flow opens Ask Claw with screenshot context and can use the Explain preset", async () => {
  let panelContext = null;
  let streamActionInput = null;
  const panelStates = [];

  await runScreenshotFlow("freeform", {
    captureScreenshot: async () => ({
      status: "ok",
      path: "/tmp/rightonclaw-screenshot.png"
    }),
    buildPathSelection: async () => createScreenshotSelection("/tmp/rightonclaw-screenshot.png"),
    buildSelectionContext: async () => createScreenshotSelectionContext("/tmp/rightonclaw-screenshot.png"),
    createAskClawPanelSession: createAskClawPanelSessionStub(
      [{ type: "submit", preset: "explain", prompt: "Explain this screenshot." }],
      [],
      panelStates,
      ({ selectionContext }) => {
      panelContext = selectionContext;
      }
    ),
    streamAction: async function* (input) {
      streamActionInput = input;
      yield { type: "start", request_id: "req-explain" };
      yield {
        type: "complete",
        request_id: "req-explain",
        result: createExplainResponse().result
      };
    }
  });

  assert.equal(panelContext.kind, "screenshot");
  assert.equal(streamActionInput.action, "explain");
  assert.equal(streamActionInput.selection_context.kind, "screenshot");
  assert.equal(panelStates[0].completed[0].body, createExplainResponse().result.content);
});

test("screenshot errors show a user-facing popup instead of being treated as cancel", async () => {
  const popups = [];

  const result = await runScreenshotFlow("freeform", {
    captureScreenshot: async () => ({
      status: "error",
      message: "Screenshot capture failed. Check macOS screen capture permissions and try again."
    }),
    showPopup: async (payload) => {
      popups.push(payload);
      return "close";
    }
  });

  assert.deepEqual(result, {});
  assert.equal(popups.length, 1);
  assert.equal(popups[0].title, "RightOnClaw Error");
  assert.match(popups[0].body, /Screenshot capture failed/i);
});

test("send_to_claw waits for the bridge response before dismissing the loading HUD and opening the WebUI", async () => {
  const events = [];
  let resolvePostAction;
  const postActionPromise = new Promise((resolve) => {
    resolvePostAction = resolve;
  });

  const workflowPromise = runWorkflow(
    { action: "send_to_claw", inputMode: "text" },
    "send this",
    [],
    {
      buildSelectionContext: async () => createTextSelectionContext("send this"),
      postAction: async () => {
        events.push("postAction:start");
        const response = await postActionPromise;
        events.push("postAction:resolved");
        return response;
      },
      createLoadingHud: createLoadingHudStub(events),
      openUrl: async (url) => {
        events.push(`open:${url}`);
      }
    }
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["hud:create:Sending to Claw...", "postAction:start"]);

  resolvePostAction(createSendToClawResponse());
  await workflowPromise;

  assert.deepEqual(events, [
    "hud:create:Sending to Claw...",
    "postAction:start",
    "postAction:resolved",
    "hud:dismiss",
    "open:http://127.0.0.1:3000/chat/sess_send"
  ]);
});

test("popup-disabled path still copies content and logs normalized payload", async () => {
  const originalValue = process.env.RIGHTONCLAW_DISABLE_POPUP;
  process.env.RIGHTONCLAW_DISABLE_POPUP = "1";

  const clipboardWrites = [];
  const logs = [];

  try {
    await showPopup(
      {
        title: "Rewrite",
        body: "rewritten text",
        kind: "rewrite",
        copyText: "rewritten text",
        detail: "Direct replacement failed.",
        clipboardNotice: "The generated rewrite has been copied to your clipboard."
      },
      {
        writeClipboardText: async (text) => {
          clipboardWrites.push(text);
        },
        log: (message) => {
          logs.push(message);
        }
      }
    );
  } finally {
    if (originalValue === undefined) {
      delete process.env.RIGHTONCLAW_DISABLE_POPUP;
    } else {
      process.env.RIGHTONCLAW_DISABLE_POPUP = originalValue;
    }
  }

  assert.deepEqual(clipboardWrites, ["rewritten text"]);
  assert.equal(logs.length, 1);
  const logged = JSON.parse(logs[0]);
  assert.equal(logged.popup_disabled, true);
  assert.match(logged.payload.detail, /copied to your clipboard/i);
});

test("bridge failures show a RightOnClaw popup without surfacing raw stack traces", async () => {
  const popups = [];
  const previousExitCode = process.exitCode;
  delete process.exitCode;

  try {
    await runWorkflow(
      { action: "rewrite", inputMode: "text" },
      "rewrite this",
      [],
      {
        buildSelectionContext: async () => createTextSelectionContext("rewrite this"),
        postAction: async () => {
          throw new Error("Timed out while contacting OpenClaw for generation.");
        },
        createLoadingHud: createLoadingHudStub(),
        showPopup: async (payload) => {
          popups.push(payload);
          return "close";
        }
      }
    );

    assert.equal(popups.length, 1);
    assert.equal(popups[0].title, "RightOnClaw Error");
    assert.match(popups[0].body, /Timed out while contacting OpenClaw/i);
    assert.equal(popups[0].detail, undefined);
    assert.equal(process.exitCode, undefined);
  } finally {
    if (previousExitCode === undefined) {
      delete process.exitCode;
    } else {
      process.exitCode = previousExitCode;
    }
  }
});
