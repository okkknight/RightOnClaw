import { runCommand } from "./command";

export async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await runCommand("/usr/bin/osascript", ["-"], {
    input: script
  });

  return stdout.trim();
}

export function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
