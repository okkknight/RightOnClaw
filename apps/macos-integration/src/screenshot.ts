import fs from "node:fs/promises";
import path from "node:path";

import { runCommand } from "./command";
import { getRuntimeTmpDir } from "./paths";

export type ScreenshotCaptureResult =
  | {
      status: "ok";
      path: string;
    }
  | {
      status: "cancel";
    }
  | {
      status: "error";
      message: string;
      detail?: string;
    };

export interface ScreenshotDependencies {
  fsModule: typeof fs;
  runCommand: typeof runCommand;
  getRuntimeTmpDir: typeof getRuntimeTmpDir;
  setTimeoutFn: typeof setTimeout;
}

export async function captureScreenshot(
  overrides: Partial<ScreenshotDependencies> = {}
): Promise<ScreenshotCaptureResult> {
  const dependencies = resolveDependencies(overrides);
  const runtimeTmpDir = dependencies.getRuntimeTmpDir();
  await dependencies.fsModule.mkdir(runtimeTmpDir, { recursive: true });
  const targetPath = path.join(runtimeTmpDir, `screenshot-${Date.now()}.png`);

  try {
    await dependencies.runCommand("/usr/sbin/screencapture", ["-i", targetPath]);
    const stats = await dependencies.fsModule.stat(targetPath);
    if (!stats.isFile() || stats.size === 0) {
      await dependencies.fsModule.rm(targetPath, { force: true });
      return { status: "cancel" };
    }

    scheduleScreenshotCleanup(targetPath, dependencies);
    return {
      status: "ok",
      path: targetPath
    };
  } catch (error) {
    const missingArtifact = await isMissingScreenshotArtifact(targetPath, dependencies);
    await dependencies.fsModule.rm(targetPath, { force: true }).catch(() => undefined);

    if (isLikelyUserCancel(error, missingArtifact)) {
      return {
        status: "cancel"
      };
    }

    return {
      status: "error",
      message: "Screenshot capture failed. Check macOS screen capture permissions and try again.",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function scheduleScreenshotCleanup(targetPath: string, dependencies: ScreenshotDependencies): void {
  dependencies.setTimeoutFn(() => {
    void dependencies.fsModule.rm(targetPath, { force: true }).catch(() => undefined);
  }, 10 * 60 * 1000);
}

function resolveDependencies(overrides: Partial<ScreenshotDependencies>): ScreenshotDependencies {
  return {
    fsModule: overrides.fsModule ?? fs,
    runCommand: overrides.runCommand ?? runCommand,
    getRuntimeTmpDir: overrides.getRuntimeTmpDir ?? getRuntimeTmpDir,
    setTimeoutFn: overrides.setTimeoutFn ?? setTimeout
  };
}

async function isMissingScreenshotArtifact(
  targetPath: string,
  dependencies: ScreenshotDependencies
): Promise<boolean> {
  try {
    const stats = await dependencies.fsModule.stat(targetPath);
    return !stats.isFile() || stats.size === 0;
  } catch {
    return true;
  }
}

function isLikelyUserCancel(error: unknown, missingArtifact: boolean): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.length === 0) {
    return true;
  }

  if (isLikelyPermissionFailure(message)) {
    return false;
  }

  return (
    /exited with code (1|2)/i.test(message) ||
    /cancel/i.test(message) ||
    /user canceled/i.test(message) ||
    /no such file/i.test(message) ||
    missingArtifact
  );
}

function isLikelyPermissionFailure(message: string): boolean {
  return /not permitted|permission|screen capture|screen recording|tcc|privacy|denied|authorization/i.test(message);
}
