import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { getProjectRoot } from "./paths";
import { getWorkflowDefinitions } from "./workflow-template";

const execFileAsync = promisify(execFile);
const VERSION_PLIST = {
  BuildVersion: "1",
  CFBundleShortVersionString: "1.0",
  ProjectName: "Automator",
  SourceVersion: "521003000000000"
};

const LEGACY_WORKFLOW_BUNDLE_FILE_NAMES = [
  "RightOnClaw Ask Claw Text.workflow",
  "RightOnClaw Ask Claw Files.workflow",
  "RightOnClaw Summarize with Claw.workflow",
  "RightOnClaw Explain with Claw.workflow",
  "RightOnClaw Rewrite with Claw.workflow",
  "RightOnClaw Send to Claw Text.workflow",
  "RightOnClaw Send to Claw Files.workflow",
  "RightOnClaw Claw Screenshot.workflow"
];

async function main(): Promise<void> {
  const servicesDir = process.env.RIGHTONCLAW_SERVICES_DIR ?? path.join(os.homedir(), "Library", "Services");
  const nodeBinary = process.execPath;
  const projectRoot = getProjectRoot();

  await fs.mkdir(servicesDir, { recursive: true });

  const workflowDefinitions = getWorkflowDefinitions(nodeBinary, projectRoot);

  for (const bundleFileName of LEGACY_WORKFLOW_BUNDLE_FILE_NAMES) {
    await fs.rm(path.join(servicesDir, bundleFileName), { recursive: true, force: true });
  }

  for (const { definition, infoPlist, document } of workflowDefinitions) {
    const bundleDir = path.join(servicesDir, definition.bundleFileName);
    const workflowDir = path.join(bundleDir, "Contents");
    const resourcesDir = path.join(workflowDir, "Resources");
    await fs.rm(bundleDir, { recursive: true, force: true });
    await fs.mkdir(resourcesDir, { recursive: true });
    await writePlist(path.join(workflowDir, "Info.plist"), infoPlist);
    await writePlist(path.join(resourcesDir, "document.wflow"), document);
    await writePlist(path.join(workflowDir, "version.plist"), VERSION_PLIST);
  }

  console.log(`Installed RightOnClaw workflows into ${servicesDir}`);
}

async function writePlist(targetPath: string, payload: Record<string, unknown>): Promise<void> {
  const tempJsonPath = `${targetPath}.json`;

  try {
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
