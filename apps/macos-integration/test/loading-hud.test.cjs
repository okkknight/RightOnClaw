const test = require("node:test");
const assert = require("node:assert/strict");

const { createLoadingHud } = require("../dist/loading-hud.js");

test("dismissing the loading HUD before the delay expires prevents the HUD process from spawning", async () => {
  let timerCallback = null;
  let clearTimeoutCalls = 0;
  let spawnCalls = 0;

  const hud = createLoadingHud("Summarizing...", {
    spawnProcess: () => {
      spawnCalls += 1;
      return {
        on() {},
        unref() {},
        kill() {}
      };
    },
    setTimeoutFn: (callback) => {
      timerCallback = callback;
      return { fake: true };
    },
    clearTimeoutFn: () => {
      clearTimeoutCalls += 1;
    },
    log: () => {}
  });

  await hud.dismiss();

  assert.equal(clearTimeoutCalls, 1);
  assert.equal(spawnCalls, 0);
  if (timerCallback) {
    timerCallback();
  }
  assert.equal(spawnCalls, 0);
});

test("dismissing the loading HUD after it spawns terminates the HUD process", async () => {
  let timerCallback = null;
  let killCalls = 0;
  const child = {
    killed: false,
    on() {},
    unref() {},
    kill() {
      killCalls += 1;
      this.killed = true;
    }
  };

  const hud = createLoadingHud("Rewriting...", {
    spawnProcess: () => child,
    setTimeoutFn: (callback) => {
      timerCallback = callback;
      return { fake: true };
    },
    clearTimeoutFn: () => {},
    log: () => {}
  });

  timerCallback();
  await hud.dismiss();

  assert.equal(killCalls, 1);
});
