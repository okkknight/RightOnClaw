import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function openUrl(url: string): Promise<void> {
  if (process.env.RIGHTONCLAW_DISABLE_OPEN === "1") {
    console.log(`RIGHTONCLAW_DISABLE_OPEN=1 skipped open: ${url}`);
    return;
  }

  await execFileAsync("/usr/bin/open", [url]);
}
