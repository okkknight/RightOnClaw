import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  FINDER_SYNC_EXTENSION_BUNDLE_IDENTIFIER,
  FINDER_SYNC_EXTENSION_NAME,
  FINDER_SYNC_HOST_APP_NAME,
  getFinderSyncBuildDefinition
} from "./finder-sync-template";
import { getPackageRoot, getProjectRoot } from "./paths";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const packageRoot = getPackageRoot();
  const projectRoot = getProjectRoot();
  const definition = getFinderSyncBuildDefinition(packageRoot, projectRoot, process.execPath);
  const sourceAppPath = definition.hostAppBundlePath;
  const installDir = process.env.RIGHTONCLAW_FINDER_SYNC_INSTALL_DIR ?? await resolveDefaultInstallDir();
  const targetAppPath = path.join(installDir, FINDER_SYNC_HOST_APP_NAME);
  const targetExtensionPath = path.join(targetAppPath, "Contents", "PlugIns", FINDER_SYNC_EXTENSION_NAME);
  const legacyUserAppPath = path.join(os.homedir(), "Applications", FINDER_SYNC_HOST_APP_NAME);
  const legacyUserExtensionPath = path.join(legacyUserAppPath, "Contents", "PlugIns", FINDER_SYNC_EXTENSION_NAME);

  await fs.access(sourceAppPath);
  await fs.mkdir(installDir, { recursive: true });
  await unregisterExtension(legacyUserExtensionPath);
  await unregisterExtension(targetExtensionPath);
  await fs.rm(targetAppPath, { recursive: true, force: true });
  await fs.cp(sourceAppPath, targetAppPath, { recursive: true });

  await execFileAsync("/usr/bin/pluginkit", ["-a", targetExtensionPath]);
  await execFileAsync("/usr/bin/pluginkit", ["-e", "use", "-i", FINDER_SYNC_EXTENSION_BUNDLE_IDENTIFIER]);
  await execFileAsync("/usr/bin/open", ["-gj", targetAppPath]);
  await restartFinder();
  await sleep(1500);

  console.log(`Installed RightOnClaw Finder Sync PoC into ${targetAppPath}`);
  console.log(`Enable it in System Settings -> Privacy & Security -> Extensions -> Finder Extensions if macOS does not auto-enable it.`);
}

async function unregisterExtension(extensionPath: string): Promise<void> {
  try {
    await execFileAsync("/usr/bin/pluginkit", ["-r", extensionPath]);
  } catch {
    // Ignore missing prior registrations; install should remain idempotent.
  }
}

async function resolveDefaultInstallDir(): Promise<string> {
  const systemApplicationsDir = "/Applications";

  try {
    await fs.access(systemApplicationsDir, fs.constants.W_OK);
    return systemApplicationsDir;
  } catch {
    return path.join(os.homedir(), "Applications");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function restartFinder(): Promise<void> {
  try {
    await execFileAsync("/usr/bin/killall", ["Finder"]);
  } catch {
    // Finder may not be running or may restart between attempts.
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
