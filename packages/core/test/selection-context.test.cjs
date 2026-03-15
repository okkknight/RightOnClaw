const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { normalizeSelectionContext, resolveSelectionContext } = require("../dist/index.js");

test("resolveSelectionContext normalizes text selections synchronously", () => {
  const context = resolveSelectionContext({
    source: {
      platform: "test",
      entry: "unit-test",
      app_name: "TextEdit"
    },
    selection: {
      kind: "text",
      text: "hello world",
      paths: [],
      mime: "text/plain",
      encoding: "utf-8",
      char_count: 11
    }
  });

  assert.equal(context.kind, "text");
  assert.equal(context.text.value, "hello world");
  assert.equal(context.text.char_count, 11);
  assert.equal(context.capture.mode, "selection");
});

test("normalizeSelectionContext classifies folders using filesystem metadata", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roc-folder-"));

  try {
    const context = await normalizeSelectionContext({
      source: {
        platform: "test",
        entry: "finder"
      },
      selection: {
        kind: "directory",
        text: null,
        paths: [tempDir],
        mime: "inode/directory",
        encoding: null,
        char_count: null
      }
    });

    assert.equal(context.kind, "folder");
    assert.equal(context.items[0].item_kind, "folder");
    assert.equal(context.capture.mode, "finder");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("normalizeSelectionContext classifies regular files using filesystem metadata", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roc-file-"));
  const filePath = path.join(tempDir, "notes.txt");
  await fs.writeFile(filePath, "hello", "utf8");

  try {
    const context = await normalizeSelectionContext({
      source: {
        platform: "test",
        entry: "finder"
      },
      selection: {
        kind: "file",
        text: null,
        paths: [filePath],
        mime: null,
        encoding: null,
        char_count: null
      }
    });

    assert.equal(context.kind, "file");
    assert.equal(context.items[0].item_kind, "file");
    assert.equal(context.items[0].mime_type, "text/plain");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("normalizeSelectionContext classifies screenshot-backed images as screenshots", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roc-screenshot-"));
  const imagePath = path.join(tempDir, "capture.png");
  await fs.writeFile(imagePath, "fake-png", "utf8");

  try {
    const context = await normalizeSelectionContext({
      source: {
        platform: "test",
        entry: "screenshot"
      },
      selection: {
        kind: "file",
        text: null,
        paths: [imagePath],
        mime: "image/png",
        encoding: null,
        char_count: null
      },
      selection_context: {
        kind: "screenshot",
        capture: {
          mode: "screenshot",
          created_at: "2026-03-13T00:00:00.000Z"
        }
      }
    });

    assert.equal(context.kind, "screenshot");
    assert.equal(context.items[0].item_kind, "image");
    assert.equal(context.capture.mode, "screenshot");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("normalizeSelectionContext marks mixed filesystem selections as mixed", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roc-mixed-"));
  const nestedDir = path.join(tempDir, "project");
  const filePath = path.join(tempDir, "image.png");
  await fs.mkdir(nestedDir);
  await fs.writeFile(filePath, "fake-png", "utf8");

  try {
    const context = await normalizeSelectionContext({
      source: {
        platform: "test",
        entry: "finder"
      },
      selection: {
        kind: "file",
        text: null,
        paths: [nestedDir, filePath],
        mime: null,
        encoding: null,
        char_count: null
      }
    });

    assert.equal(context.kind, "mixed");
    assert.deepEqual(
      context.items.map((item) => item.item_kind),
      ["folder", "image"]
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("resolveSelectionContext preserves a manual no-selection request for menu bar and hotkey flows", () => {
  const context = resolveSelectionContext({
    source: {
      platform: "test",
      entry: "menubar"
    },
    selection: {
      kind: "manual",
      text: null,
      paths: [],
      mime: null,
      encoding: null,
      char_count: null
    }
  });

  assert.equal(context.kind, "mixed");
  assert.equal(context.summary, "No selection captured");
  assert.equal(context.capture.mode, "manual");
});
