import { readClipboardText, writeClipboardText } from "./clipboard";
import { runAppleScript } from "./apple-script";

export type ApplySelectionStatus = "applied" | "uncertain" | "failed" | "skipped";

export interface ApplySelectionResult {
  status: ApplySelectionStatus;
  reason: string;
  verificationPossible: boolean;
  clipboardRestore: "scheduled" | "restored" | "skipped";
  restoreDelayMs?: number;
}

export interface ApplySelectionDependencies {
  readClipboardText: typeof readClipboardText;
  writeClipboardText: typeof writeClipboardText;
  runAppleScript: typeof runAppleScript;
  setTimeoutFn: typeof setTimeout;
  restoreDelayMs: number;
}

const DEFAULT_CLIPBOARD_RESTORE_DELAY_MS = resolveRestoreDelayMs(process.env.RIGHTONCLAW_CLIPBOARD_RESTORE_DELAY_MS);

export async function applySelectionText(
  text: string,
  overrides: Partial<ApplySelectionDependencies> = {}
): Promise<ApplySelectionResult> {
  const dependencies = resolveDependencies(overrides);

  if (process.env.RIGHTONCLAW_DISABLE_APPLY === "1") {
    return {
      status: "skipped",
      reason: "RIGHTONCLAW_DISABLE_APPLY=1 skipped direct replacement.",
      verificationPossible: false,
      clipboardRestore: "skipped"
    };
  }

  const originalClipboard = await dependencies.readClipboardText();

  try {
    await dependencies.writeClipboardText(text);
    await dependencies.runAppleScript(`
tell application "System Events"
  keystroke "v" using command down
end tell
`);

    if (originalClipboard !== null) {
      scheduleClipboardRestore({
        originalClipboard,
        pastedText: text,
        dependencies
      });
    }

    return {
      status: "uncertain",
      reason: "The paste command was sent, but RightOnClaw could not verify that the target app replaced the current selection.",
      verificationPossible: false,
      clipboardRestore: originalClipboard !== null ? "scheduled" : "skipped",
      restoreDelayMs: originalClipboard !== null ? dependencies.restoreDelayMs : undefined
    };
  } catch (error) {
    if (originalClipboard !== null) {
      try {
        await dependencies.writeClipboardText(originalClipboard);
      } catch {
        // Ignore clipboard restore failures on the fallback path.
      }
    }

    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Unknown apply-selection failure.",
      verificationPossible: false,
      clipboardRestore: originalClipboard !== null ? "restored" : "skipped"
    };
  }
}

function resolveDependencies(overrides: Partial<ApplySelectionDependencies>): ApplySelectionDependencies {
  return {
    readClipboardText: overrides.readClipboardText ?? readClipboardText,
    writeClipboardText: overrides.writeClipboardText ?? writeClipboardText,
    runAppleScript: overrides.runAppleScript ?? runAppleScript,
    setTimeoutFn: overrides.setTimeoutFn ?? setTimeout,
    restoreDelayMs: overrides.restoreDelayMs ?? DEFAULT_CLIPBOARD_RESTORE_DELAY_MS
  };
}

function scheduleClipboardRestore(input: {
  originalClipboard: string;
  pastedText: string;
  dependencies: ApplySelectionDependencies;
}): void {
  input.dependencies.setTimeoutFn(() => {
    void safelyRestoreClipboard(input).catch(() => {
      // Ignore delayed clipboard restore errors.
    });
  }, input.dependencies.restoreDelayMs);
}

async function safelyRestoreClipboard(input: {
  originalClipboard: string;
  pastedText: string;
  dependencies: ApplySelectionDependencies;
}): Promise<void> {
  const currentClipboard = await input.dependencies.readClipboardText();

  if (currentClipboard !== input.pastedText) {
    return;
  }

  await input.dependencies.writeClipboardText(input.originalClipboard);
}

function resolveRestoreDelayMs(input: string | undefined): number {
  const fallback = 1500;
  if (!input) {
    return fallback;
  }

  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}
