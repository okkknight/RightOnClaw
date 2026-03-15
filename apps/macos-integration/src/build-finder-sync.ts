import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { getPackageRoot, getProjectRoot } from "./paths";
import {
  buildFinderHostInfoPlist,
  buildFinderSyncExtensionEntitlements,
  buildFinderSyncExtensionInfoPlist,
  buildFinderSyncGeneratedSwift,
  getFinderSyncBuildDefinition
} from "./finder-sync-template";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const packageRoot = getPackageRoot();
  const projectRoot = getProjectRoot();
  const definition = getFinderSyncBuildDefinition(packageRoot, projectRoot, process.execPath);

  await fs.rm(definition.buildRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(definition.hostExecutablePath), { recursive: true });
  await fs.mkdir(path.dirname(definition.extensionExecutablePath), { recursive: true });

  await fs.writeFile(definition.generatedSwiftPath, buildFinderSyncGeneratedSwift(definition), "utf8");
  await writePlist(definition.hostInfoPlistPath, buildFinderHostInfoPlist());
  await writePlist(definition.extensionInfoPlistPath, buildFinderSyncExtensionInfoPlist());
  await writePlist(definition.extensionEntitlementsPath, buildFinderSyncExtensionEntitlements());

  await compileHostApp(packageRoot, definition.generatedSwiftPath, definition.hostExecutablePath);
  await compileFinderExtension(packageRoot, definition.generatedSwiftPath, definition.extensionExecutablePath);
  await codesignBundles(definition);

  console.log(`Built RightOnClaw Finder Sync PoC into ${definition.buildRoot}`);
}

async function compileHostApp(packageRoot: string, generatedSwiftPath: string, outputPath: string): Promise<void> {
  await execFileAsync("/usr/bin/xcrun", [
    "swiftc",
    "-O",
    "-framework",
    "AppKit",
    "-module-name",
    "RightOnClawFinderHost",
    generatedSwiftPath,
    path.join(packageRoot, "finder-sync", "RightOnClawFinderHost.swift"),
    "-o",
    outputPath
  ]);
}

async function compileFinderExtension(packageRoot: string, generatedSwiftPath: string, outputPath: string): Promise<void> {
  await execFileAsync("/usr/bin/xcrun", [
    "swiftc",
    "-O",
    "-framework",
    "AppKit",
    "-framework",
    "FinderSync",
    "-module-name",
    "RightOnClawFinderExtension",
    generatedSwiftPath,
    path.join(packageRoot, "finder-sync", "RightOnClawFinderSync.swift"),
    "-o",
    outputPath
  ]);
}

async function codesignBundles(definition: ReturnType<typeof getFinderSyncBuildDefinition>): Promise<void> {
  await execFileAsync("/usr/bin/codesign", [
    "--force",
    "--sign",
    "-",
    "--timestamp=none",
    "--entitlements",
    definition.extensionEntitlementsPath,
    definition.extensionBundlePath
  ]);

  await execFileAsync("/usr/bin/codesign", [
    "--force",
    "--sign",
    "-",
    "--timestamp=none",
    definition.hostAppBundlePath
  ]);
}

async function writePlist(targetPath: string, payload: Record<string, unknown>): Promise<void> {
  const tempJsonPath = `${targetPath}.json`;

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(tempJsonPath, JSON.stringify(payload, null, 2), "utf8");
    await execFileAsync("/usr/bin/plutil", ["-convert", "xml1", "-o", targetPath, tempJsonPath], {
      maxBuffer: 1024 * 1024
    });
  } finally {
    await fs.rm(tempJsonPath, { force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
