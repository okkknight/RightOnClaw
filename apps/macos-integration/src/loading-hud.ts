import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

export interface LoadingHudHandle {
  dismiss(): Promise<void>;
}

export interface LoadingHudDependencies {
  spawnProcess: typeof spawn;
  setTimeoutFn: typeof setTimeout;
  clearTimeoutFn: typeof clearTimeout;
  log: (message: string) => void;
}

const DEFAULT_LOADING_HUD_DELAY_MS = 120;

export function createLoadingHud(
  message: string,
  overrides: Partial<LoadingHudDependencies> = {}
): LoadingHudHandle {
  if (process.env.RIGHTONCLAW_DISABLE_LOADING_HUD === "1") {
    return {
      async dismiss() {
        return undefined;
      }
    };
  }

  const dependencies = resolveDependencies(overrides);
  let dismissed = false;
  let child: ChildProcess | null = null;
  let timer: ReturnType<typeof setTimeout> | null = dependencies.setTimeoutFn(() => {
    timer = null;

    if (dismissed) {
      return;
    }

    const hudBinary = path.join(__dirname, "bin", "rightonclaw-hud");
    child = dependencies.spawnProcess(
      hudBinary,
      ["--message", message, "--parent-pid", String(process.pid)],
      {
        env: process.env,
        stdio: "ignore"
      }
    );

    child.on("error", (error) => {
      dependencies.log(
        `[RightOnClaw] Failed to launch loading HUD: ${error instanceof Error ? error.message : String(error)}`
      );
      child = null;
    });

    child.unref();
  }, DEFAULT_LOADING_HUD_DELAY_MS);

  return {
    async dismiss() {
      if (dismissed) {
        return undefined;
      }

      dismissed = true;

      if (timer) {
        dependencies.clearTimeoutFn(timer);
        timer = null;
      }

      if (child && !child.killed) {
        try {
          child.kill("SIGTERM");
        } catch {
          // Ignore HUD teardown errors on the non-critical path.
        }
      }

      child = null;
      return undefined;
    }
  };
}

function resolveDependencies(overrides: Partial<LoadingHudDependencies>): LoadingHudDependencies {
  return {
    spawnProcess: overrides.spawnProcess ?? spawn,
    setTimeoutFn: overrides.setTimeoutFn ?? setTimeout,
    clearTimeoutFn: overrides.clearTimeoutFn ?? clearTimeout,
    // HUD launch failure is non-critical; avoid stderr noise inside Automator workflows.
    log: overrides.log ?? (() => undefined)
  };
}
