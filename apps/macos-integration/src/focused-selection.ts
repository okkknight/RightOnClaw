import { randomUUID } from "node:crypto";

import type { ActionSelection, SelectionCaptureMode } from "@rightonclaw/types";

import { runAppleScript } from "./apple-script";
import { readClipboardText, writeClipboardText } from "./clipboard";
import { getFrontmostAppContext } from "./frontmost-app";
import { buildManualSelection, buildPathSelection, buildTextSelection } from "./selection";

export interface FocusedSelectionCaptureResult {
  selection: ActionSelection;
  captureMode: SelectionCaptureMode;
  sourceAppName?: string;
  bundleId?: string;
}

export interface FocusedSelectionDependencies {
  getFrontmostAppContext: typeof getFrontmostAppContext;
  readClipboardText: typeof readClipboardText;
  writeClipboardText: typeof writeClipboardText;
  runAppleScript: typeof runAppleScript;
  buildManualSelection: typeof buildManualSelection;
  buildPathSelection: typeof buildPathSelection;
  buildTextSelection: typeof buildTextSelection;
}

export async function captureFocusedSelection(
  overrides: Partial<FocusedSelectionDependencies> = {}
): Promise<FocusedSelectionCaptureResult> {
  const dependencies = resolveDependencies(overrides);
  const frontmostApp = await dependencies.getFrontmostAppContext();

  if (frontmostApp.bundleId === "com.apple.finder") {
    const selectedPaths = await captureFinderSelectionPaths(dependencies.runAppleScript);
    if (selectedPaths.length > 0) {
      return {
        selection: await dependencies.buildPathSelection(selectedPaths),
        captureMode: "finder",
        sourceAppName: frontmostApp.appName,
        bundleId: frontmostApp.bundleId
      };
    }
  }

  const selectedText = await captureSelectedText(dependencies);
  if (selectedText && selectedText.trim().length > 0) {
    return {
      selection: await dependencies.buildTextSelection(selectedText),
      captureMode: "selection",
      sourceAppName: frontmostApp.appName,
      bundleId: frontmostApp.bundleId
    };
  }

  return {
    selection: await dependencies.buildManualSelection(),
    captureMode: "manual",
    sourceAppName: frontmostApp.appName,
    bundleId: frontmostApp.bundleId
  };
}

async function captureFinderSelectionPaths(runAppleScriptFn: typeof runAppleScript): Promise<string[]> {
  try {
    const output = await runAppleScriptFn(`
set AppleScript's text item delimiters to linefeed
tell application "Finder"
  set selectedItems to selection
  if (count of selectedItems) is 0 then
    return ""
  end if

  set selectedPaths to {}
  repeat with selectedItem in selectedItems
    set end of selectedPaths to POSIX path of (selectedItem as alias)
  end repeat

  return selectedPaths as text
end tell
`);

    return output
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function captureSelectedText(dependencies: FocusedSelectionDependencies): Promise<string | null> {
  const originalClipboard = await dependencies.readClipboardText();
  if (originalClipboard === null) {
    return captureSelectedTextWithoutMarker(dependencies);
  }

  const marker = `__rightonclaw_selection_marker_${randomUUID()}__`;

  try {
    await dependencies.writeClipboardText(marker);
    await triggerCopyKeystroke(dependencies.runAppleScript);
    const clipboardText = await waitForClipboardText(
      dependencies.readClipboardText,
      (value) => value !== null && value !== marker && value.trim().length > 0
    );

    if (clipboardText === null || clipboardText === marker) {
      return null;
    }

    return clipboardText;
  } catch {
    return null;
  } finally {
    try {
      await dependencies.writeClipboardText(originalClipboard);
    } catch {
      // Ignore clipboard restore failures on the best-effort capture path.
    }
  }
}

async function captureSelectedTextWithoutMarker(dependencies: FocusedSelectionDependencies): Promise<string | null> {
  try {
    await triggerCopyKeystroke(dependencies.runAppleScript);
    return waitForClipboardText(
      dependencies.readClipboardText,
      (value) => value !== null && value.trim().length > 0
    );
  } catch {
    return null;
  }
}

async function triggerCopyKeystroke(runAppleScriptFn: typeof runAppleScript): Promise<void> {
  await runAppleScriptFn(`
tell application "System Events"
  keystroke "c" using command down
end tell
`);
}

async function waitForClipboardText(
  readClipboardTextFn: typeof readClipboardText,
  predicate: (value: string | null) => boolean
): Promise<string | null> {
  const delays = [80, 120, 180, 220];

  for (const delayMs of delays) {
    await sleep(delayMs);
    const currentValue = await readClipboardTextFn();
    if (predicate(currentValue)) {
      return currentValue;
    }
  }

  return null;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function resolveDependencies(overrides: Partial<FocusedSelectionDependencies>): FocusedSelectionDependencies {
  return {
    getFrontmostAppContext: overrides.getFrontmostAppContext ?? getFrontmostAppContext,
    readClipboardText: overrides.readClipboardText ?? readClipboardText,
    writeClipboardText: overrides.writeClipboardText ?? writeClipboardText,
    runAppleScript: overrides.runAppleScript ?? runAppleScript,
    buildManualSelection: overrides.buildManualSelection ?? buildManualSelection,
    buildPathSelection: overrides.buildPathSelection ?? buildPathSelection,
    buildTextSelection: overrides.buildTextSelection ?? buildTextSelection
  };
}
