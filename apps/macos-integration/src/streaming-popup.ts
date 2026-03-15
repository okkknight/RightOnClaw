import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { showPopup } from "./popup";
import { getRuntimeTmpDir } from "./paths";

type PopupKind = "summary" | "explanation" | "rewrite" | "error";

interface StreamingPopupState {
  title: string;
  body: string;
  kind: PopupKind;
  detail?: string;
  copyText?: string;
  openUrl?: string;
  status: "running" | "complete" | "error";
}

export interface StreamingPopupHandle {
  update(input: Partial<StreamingPopupState>): Promise<void>;
  complete(input: Partial<StreamingPopupState>): Promise<void>;
  fail(message: string, detail?: string): Promise<void>;
  waitForClose(): Promise<void>;
  close(): Promise<void>;
}

export interface StreamingPopupDependencies {
  fsModule: typeof fs;
  spawnProcess: typeof spawn;
  showPopup: typeof showPopup;
  getRuntimeTmpDir: typeof getRuntimeTmpDir;
}

export async function createStreamingPopup(input: {
  title: string;
  kind: PopupKind;
  detail?: string;
}, overrides: Partial<StreamingPopupDependencies> = {}): Promise<StreamingPopupHandle> {
  const dependencies = resolveDependencies(overrides);
  const initialState: StreamingPopupState = {
    title: input.title,
    body: "",
    kind: input.kind,
    detail: input.detail,
    status: "running"
  };

  if (process.env.RIGHTONCLAW_DISABLE_STREAMING_POPUP === "1") {
    return createFallbackHandle(initialState, dependencies.showPopup);
  }

  const runtimeTmpDir = dependencies.getRuntimeTmpDir();
  await dependencies.fsModule.mkdir(runtimeTmpDir, { recursive: true });
  const payloadPath = path.join(runtimeTmpDir, `stream-popup-${Date.now()}.json`);
  await dependencies.fsModule.writeFile(payloadPath, JSON.stringify(initialState), "utf8");

  const popupBinary = path.join(__dirname, "bin", "rightonclaw-stream-popup");
  try {
    await dependencies.fsModule.access(popupBinary);
  } catch {
    await dependencies.fsModule.rm(payloadPath, { force: true }).catch(() => undefined);
    return createFallbackHandle(initialState, dependencies.showPopup);
  }

  const child = dependencies.spawnProcess(popupBinary, ["--payload", payloadPath], {
    env: process.env,
    stdio: "ignore"
  });

  const spawnResult = await waitForChildSpawn(child);
  if (spawnResult !== "spawned") {
    await dependencies.fsModule.rm(payloadPath, { force: true }).catch(() => undefined);
    return createFallbackHandle(initialState, dependencies.showPopup);
  }

  let currentState = initialState;
  let closed = false;
  let renderedFallback: Promise<unknown> | null = null;
  let closedUnexpectedly = false;

  const waitForExit = new Promise<void>((resolve) => {
    child.once("exit", () => {
      closedUnexpectedly = currentState.status === "running";
      closed = true;
      resolve();
    });
    child.once("error", () => {
      closedUnexpectedly = currentState.status === "running";
      closed = true;
      resolve();
    });
  });

  child.unref();

  const renderFallback = async () => {
    if (!renderedFallback) {
      renderedFallback = dependencies.showPopup(buildFallbackPopupPayload(currentState));
    }

    await renderedFallback;
  };

  return {
    async update(inputUpdate) {
      currentState = {
        ...currentState,
        ...inputUpdate
      };
      if (!closed) {
        await dependencies.fsModule.writeFile(payloadPath, JSON.stringify(currentState), "utf8");
      }
    },
    async complete(inputUpdate) {
      currentState = {
        ...currentState,
        ...inputUpdate,
        copyText: inputUpdate.copyText ?? currentState.copyText ?? inputUpdate.body ?? currentState.body,
        status: "complete"
      };
      if (!closed) {
        await dependencies.fsModule.writeFile(payloadPath, JSON.stringify(currentState), "utf8");
        return;
      }

      await renderFallback();
    },
    async fail(message, detail) {
      currentState = {
        ...currentState,
        title: currentState.title,
        body: message,
        detail,
        kind: "error",
        status: "error"
      };
      if (!closed) {
        await dependencies.fsModule.writeFile(payloadPath, JSON.stringify(currentState), "utf8");
        return;
      }

      await renderFallback();
    },
    async waitForClose() {
      await waitForExit;
      if (closedUnexpectedly) {
        await renderFallback();
      }
      await dependencies.fsModule.rm(payloadPath, { force: true }).catch(() => undefined);
    },
    async close() {
      if (!closed && !child.killed) {
        child.kill("SIGTERM");
      }
      await waitForExit;
      await dependencies.fsModule.rm(payloadPath, { force: true }).catch(() => undefined);
    }
  };
}

function createFallbackHandle(
  initialState: StreamingPopupState,
  showPopupFn: typeof showPopup
): StreamingPopupHandle {
  let currentState = initialState;
  let renderedPopup: Promise<unknown> | null = null;

  return {
    async update(inputUpdate) {
      currentState = {
        ...currentState,
        ...inputUpdate
      };
    },
    async complete(inputUpdate) {
      currentState = {
        ...currentState,
        ...inputUpdate,
        copyText: inputUpdate.copyText ?? currentState.copyText ?? inputUpdate.body ?? currentState.body,
        status: "complete"
      };
      renderedPopup = showPopupFn(buildFallbackPopupPayload(currentState));
      await renderedPopup;
    },
    async fail(message, detail) {
      currentState = {
        ...currentState,
        body: message,
        detail,
        kind: "error",
        status: "error"
      };
      renderedPopup = showPopupFn(buildFallbackPopupPayload(currentState));
      await renderedPopup;
    },
    async waitForClose() {
      await renderedPopup;
    },
    async close() {
      return undefined;
    }
  };
}

function buildFallbackPopupPayload(state: StreamingPopupState): Parameters<typeof showPopup>[0] {
  return {
    title: state.title,
    body: state.body,
    kind: state.status === "error" ? "error" : state.kind,
    detail: state.detail,
    copyText: state.copyText,
    openUrl: state.openUrl
  };
}

function resolveDependencies(overrides: Partial<StreamingPopupDependencies>): StreamingPopupDependencies {
  return {
    fsModule: overrides.fsModule ?? fs,
    spawnProcess: overrides.spawnProcess ?? spawn,
    showPopup: overrides.showPopup ?? showPopup,
    getRuntimeTmpDir: overrides.getRuntimeTmpDir ?? getRuntimeTmpDir
  };
}

async function waitForChildSpawn(child: ChildProcess): Promise<"spawned" | "failed"> {
  if (child.pid) {
    return "spawned";
  }

  return new Promise((resolve) => {
    let settled = false;

    child.once("spawn", () => {
      if (!settled) {
        settled = true;
        resolve("spawned");
      }
    });
    child.once("error", () => {
      if (!settled) {
        settled = true;
        resolve("failed");
      }
    });
    child.once("exit", () => {
      if (!settled) {
        settled = true;
        resolve("failed");
      }
    });
  });
}
