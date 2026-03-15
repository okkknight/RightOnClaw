const test = require("node:test");
const assert = require("node:assert/strict");

const { captureScreenshot } = require("../dist/screenshot.js");

test("captureScreenshot reports a friendly error for permission or command failures", async () => {
  const fsCalls = [];

  const result = await captureScreenshot({
    fsModule: {
      async mkdir() {},
      async stat() {
        throw new Error("stat should not run");
      },
      async rm(targetPath) {
        fsCalls.push(targetPath);
      }
    },
    getRuntimeTmpDir: () => "/tmp/rightonclaw-test",
    runCommand: async () => {
      throw new Error("operation not permitted");
    },
    setTimeoutFn: () => {}
  });

  assert.equal(result.status, "error");
  assert.match(result.message, /Screenshot capture failed/i);
  assert.match(result.detail, /operation not permitted/i);
  assert.equal(fsCalls.length, 1);
});

test("captureScreenshot treats a silent screencapture exit as user cancel", async () => {
  const result = await captureScreenshot({
    fsModule: {
      async mkdir() {},
      async stat() {
        throw new Error("stat should not run");
      },
      async rm() {}
    },
    getRuntimeTmpDir: () => "/tmp/rightonclaw-test",
    runCommand: async () => {
      throw new Error("/usr/sbin/screencapture exited with code 1.");
    },
    setTimeoutFn: () => {}
  });

  assert.deepEqual(result, {
    status: "cancel"
  });
});

test("captureScreenshot treats missing output after an unexpected screencapture failure as cancel", async () => {
  const result = await captureScreenshot({
    fsModule: {
      async mkdir() {},
      async stat() {
        throw new Error("ENOENT");
      },
      async rm() {}
    },
    getRuntimeTmpDir: () => "/tmp/rightonclaw-test",
    runCommand: async () => {
      throw new Error("screencapture terminated unexpectedly");
    },
    setTimeoutFn: () => {}
  });

  assert.deepEqual(result, {
    status: "cancel"
  });
});

test("captureScreenshot still reports a friendly error for permission failures even when no output file exists", async () => {
  const result = await captureScreenshot({
    fsModule: {
      async mkdir() {},
      async stat() {
        throw new Error("ENOENT");
      },
      async rm() {}
    },
    getRuntimeTmpDir: () => "/tmp/rightonclaw-test",
    runCommand: async () => {
      throw new Error("Screen capture permission denied");
    },
    setTimeoutFn: () => {}
  });

  assert.equal(result.status, "error");
  assert.match(result.message, /Screenshot capture failed/i);
  assert.match(result.detail, /permission denied/i);
});
