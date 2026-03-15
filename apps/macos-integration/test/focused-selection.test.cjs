const test = require("node:test");
const assert = require("node:assert/strict");

const { captureFocusedSelection } = require("../dist/focused-selection.js");

test("captureFocusedSelection prefers Finder paths for hotkey flows", async () => {
  let capturedPaths = null;

  const result = await captureFocusedSelection({
    getFrontmostAppContext: async () => ({
      appName: "Finder",
      bundleId: "com.apple.finder"
    }),
    runAppleScript: async () => "/tmp/demo.txt\n/tmp/project\n",
    buildPathSelection: async (paths) => {
      capturedPaths = paths;
      return {
        kind: "file",
        text: null,
        paths,
        mime: null,
        encoding: null,
        char_count: null
      };
    },
    buildManualSelection: async () => {
      throw new Error("manual fallback should not run");
    },
    buildTextSelection: async () => {
      throw new Error("text fallback should not run");
    }
  });

  assert.deepEqual(capturedPaths, ["/tmp/demo.txt", "/tmp/project"]);
  assert.equal(result.captureMode, "finder");
  assert.equal(result.sourceAppName, "Finder");
  assert.equal(result.bundleId, "com.apple.finder");
});

test("captureFocusedSelection captures selected text and restores the clipboard", async () => {
  const clipboardWrites = [];
  const clipboardReads = ["original clipboard", "captured text"];

  const result = await captureFocusedSelection({
    getFrontmostAppContext: async () => ({
      appName: "TextEdit",
      bundleId: "com.apple.TextEdit"
    }),
    readClipboardText: async () => clipboardReads.shift() ?? null,
    writeClipboardText: async (text) => {
      clipboardWrites.push(text);
    },
    runAppleScript: async () => "",
    buildTextSelection: async (text) => ({
      kind: "text",
      text,
      paths: [],
      mime: "text/plain",
      encoding: "utf-8",
      char_count: text.length
    }),
    buildManualSelection: async () => {
      throw new Error("manual fallback should not run");
    },
    buildPathSelection: async () => {
      throw new Error("Finder fallback should not run");
    }
  });

  assert.equal(result.selection.kind, "text");
  assert.equal(result.selection.text, "captured text");
  assert.equal(result.captureMode, "selection");
  assert.equal(clipboardWrites.length, 2);
  assert.match(clipboardWrites[0], /__rightonclaw_selection_marker_/);
  assert.equal(clipboardWrites[1], "original clipboard");
});

test("captureFocusedSelection falls back to a manual selection when nothing is captured", async () => {
  const result = await captureFocusedSelection({
    getFrontmostAppContext: async () => ({
      appName: "TextEdit",
      bundleId: "com.apple.TextEdit"
    }),
    readClipboardText: async () => "clipboard",
    writeClipboardText: async () => {},
    runAppleScript: async () => {
      throw new Error("copy failed");
    },
    buildTextSelection: async () => {
      throw new Error("text capture should not succeed");
    },
    buildManualSelection: async () => ({
      kind: "manual",
      text: null,
      paths: [],
      mime: null,
      encoding: null,
      char_count: null
    }),
    buildPathSelection: async () => {
      throw new Error("Finder fallback should not run");
    }
  });

  assert.equal(result.selection.kind, "manual");
  assert.equal(result.captureMode, "manual");
});

test("captureFocusedSelection can still grab text when the original clipboard has no text flavor", async () => {
  const clipboardReads = [null, "captured after copy"];

  const result = await captureFocusedSelection({
    getFrontmostAppContext: async () => ({
      appName: "Notes",
      bundleId: "com.apple.Notes"
    }),
    readClipboardText: async () => clipboardReads.shift() ?? null,
    writeClipboardText: async () => {
      throw new Error("marker path should not run for non-text clipboards");
    },
    runAppleScript: async () => "",
    buildTextSelection: async (text) => ({
      kind: "text",
      text,
      paths: [],
      mime: "text/plain",
      encoding: "utf-8",
      char_count: text.length
    }),
    buildManualSelection: async () => {
      throw new Error("manual fallback should not run");
    },
    buildPathSelection: async () => {
      throw new Error("Finder fallback should not run");
    }
  });

  assert.equal(result.selection.kind, "text");
  assert.equal(result.selection.text, "captured after copy");
  assert.equal(result.captureMode, "selection");
});
