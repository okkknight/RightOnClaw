import { runCommand } from "./command";

export async function readClipboardText(): Promise<string | null> {
  try {
    const { stdout } = await runCommand("/usr/bin/pbpaste", []);
    return stdout;
  } catch {
    return null;
  }
}

export async function writeClipboardText(text: string): Promise<void> {
  await runCommand("/usr/bin/pbcopy", [], {
    input: text
  });
}
