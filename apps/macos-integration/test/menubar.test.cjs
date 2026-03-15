const test = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULT_HOTKEYS, normalizeHotkeyLabel } = require("../dist/hotkeys.js");
const { launchMenuBar } = require("../dist/menubar.js");

test("normalizeHotkeyLabel keeps hotkey comparisons predictable", () => {
  assert.equal(normalizeHotkeyLabel(" Cmd+Shift+C "), "cmd+shift+c");
  assert.equal(DEFAULT_HOTKEYS.ask_claw, "cmd+shift+c");
  assert.equal(DEFAULT_HOTKEYS.screenshot, "cmd+shift+x");
});

test("launchMenuBar spawns the native menu bar app with the expected arguments", () => {
  const calls = [];

  const child = {
    on() {},
    unref() {}
  };

  const result = launchMenuBar({
    nodeBinary: "/opt/homebrew/bin/node",
    cliPath: "/tmp/workflow-cli.js",
    askHotkey: "cmd+shift+c",
    screenshotHotkey: "cmd+shift+x",
    spawnProcess: (file, args, options) => {
      calls.push({ file, args, options });
      return child;
    }
  });

  assert.equal(result, child);
  assert.equal(calls.length, 1);
  assert.match(calls[0].file, /rightonclaw-menubar$/);
  assert.deepEqual(calls[0].args, [
    "--node-bin",
    "/opt/homebrew/bin/node",
    "--cli-path",
    "/tmp/workflow-cli.js",
    "--ask-hotkey",
    "cmd+shift+c",
    "--screenshot-hotkey",
    "cmd+shift+x"
  ]);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio[0], "ignore");
  assert.equal(typeof calls[0].options.stdio[1], "number");
  assert.equal(typeof calls[0].options.stdio[2], "number");
});
