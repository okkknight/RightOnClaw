import fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { DEFAULT_HOTKEYS } from "./hotkeys";
import { getRuntimeLogDir } from "./paths";

export interface MenuBarLaunchOptions {
  nodeBinary?: string;
  cliPath?: string;
  askHotkey?: string;
  screenshotHotkey?: string;
  logDir?: string;
  spawnProcess?: typeof spawn;
  log?: (message: string) => void;
}

export function launchMenuBar(options: MenuBarLaunchOptions = {}): ChildProcess {
  const nodeBinary = options.nodeBinary ?? process.execPath;
  const cliPath = options.cliPath ?? path.join(__dirname, "workflow-cli.js");
  const askHotkey = options.askHotkey ?? DEFAULT_HOTKEYS.ask_claw;
  const screenshotHotkey = options.screenshotHotkey ?? DEFAULT_HOTKEYS.screenshot;
  const spawnProcess = options.spawnProcess ?? spawn;
  const menuBarBinary = path.join(__dirname, "bin", "rightonclaw-menubar");
  const logDir = options.logDir ?? getRuntimeLogDir();

  fs.mkdirSync(logDir, { recursive: true });
  const stdoutFd = fs.openSync(path.join(logDir, "rightonclaw-menubar.log"), "a");
  const stderrFd = fs.openSync(path.join(logDir, "rightonclaw-menubar.err.log"), "a");

  const child = spawnProcess(menuBarBinary, [
    "--node-bin",
    nodeBinary,
    "--cli-path",
    cliPath,
    "--ask-hotkey",
    askHotkey,
    "--screenshot-hotkey",
    screenshotHotkey
  ], {
    env: process.env,
    stdio: ["ignore", stdoutFd, stderrFd],
    detached: true
  });

  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);

  child.on("error", (error) => {
    options.log?.(
      `[RightOnClaw] Failed to launch menu bar app: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  child.unref();

  return child;
}
