const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { createStreamingPopup } = require("../dist/streaming-popup.js");

test("createStreamingPopup falls back to a normal popup when the native binary is unavailable", async () => {
  const popups = [];

  const popup = await createStreamingPopup(
    {
      title: "Summary",
      kind: "summary",
      detail: "Preparing request..."
    },
    {
      fsModule: {
        async mkdir() {},
        async writeFile() {},
        async access() {
          throw new Error("missing binary");
        },
        async rm() {}
      },
      showPopup: async (payload) => {
        popups.push(payload);
        return "close";
      },
      getRuntimeTmpDir: () => "/tmp/rightonclaw-test"
    }
  );

  await popup.complete({
    body: "summary text",
    copyText: "summary text"
  });
  await popup.waitForClose();

  assert.equal(popups.length, 1);
  assert.equal(popups[0].title, "Summary");
  assert.equal(popups[0].body, "summary text");
  assert.equal(popups[0].copyText, "summary text");
});

test("createStreamingPopup falls back if the native popup exits unexpectedly before completion", async () => {
  const popups = [];
  const child = new EventEmitter();
  child.pid = 1234;
  child.killed = false;
  child.unref = () => {};
  child.kill = () => {
    child.killed = true;
    child.emit("exit", 0);
  };

  const writes = [];
  const popup = await createStreamingPopup(
    {
      title: "Ask Claw",
      kind: "summary",
      detail: "Preparing request..."
    },
    {
      fsModule: {
        async mkdir() {},
        async writeFile(_path, payload) {
          writes.push(JSON.parse(payload));
        },
        async access() {},
        async rm() {}
      },
      spawnProcess: () => {
        setImmediate(() => child.emit("spawn"));
        setImmediate(() => child.emit("exit", 1));
        return child;
      },
      showPopup: async (payload) => {
        popups.push(payload);
        return "close";
      },
      getRuntimeTmpDir: () => "/tmp/rightonclaw-test"
    }
  );

  await popup.update({
    body: "Preparing Claw..."
  });
  await popup.waitForClose();

  assert.equal(writes.at(-1).body, "Preparing Claw...");
  assert.equal(popups.length, 1);
  assert.equal(popups[0].body, "Preparing Claw...");
});
