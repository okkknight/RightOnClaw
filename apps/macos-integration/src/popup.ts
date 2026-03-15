import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { writeClipboardText } from "./clipboard";
import { getRuntimeTmpDir } from "./paths";
import { runAppleScript } from "./apple-script";

const execFileAsync = promisify(execFile);

export interface PopupPayload {
  title: string;
  body: string;
  kind: "summary" | "explanation" | "rewrite" | "error";
  copyText?: string;
  openUrl?: string;
  detail?: string;
  clipboardNotice?: string;
  allowReplaceSelection?: boolean;
}

export type PopupAction = "close" | "copy" | "open" | "replace_selection";

export interface PopupDependencies {
  writeClipboardText: typeof writeClipboardText;
  log: typeof console.log;
}

export async function showPopup(
  payload: PopupPayload,
  overrides: Partial<PopupDependencies> = {}
): Promise<PopupAction> {
  const dependencies = {
    writeClipboardText: overrides.writeClipboardText ?? writeClipboardText,
    log: overrides.log ?? console.log
  };
  const normalizedPayload = normalizePopupPayload(payload);

  if (process.env.RIGHTONCLAW_DISABLE_POPUP === "1") {
    const disabledPayload = normalizeCopiedPayload(normalizedPayload);
    if (disabledPayload.copyText) {
      await dependencies.writeClipboardText(disabledPayload.copyText);
    }
    dependencies.log(JSON.stringify({ popup_disabled: true, payload: disabledPayload }, null, 2));
    return "close";
  }

  await fs.mkdir(getRuntimeTmpDir(), { recursive: true });
  const payloadPath = path.join(getRuntimeTmpDir(), `popup-${Date.now()}.json`);

  try {
    await fs.writeFile(payloadPath, JSON.stringify(normalizedPayload), "utf8");
    const popupBinary = path.join(__dirname, "bin", "rightonclaw-popup");

    const { stdout } = await execFileAsync(popupBinary, ["--payload", payloadPath], {
      env: process.env,
      maxBuffer: 1024 * 1024
    });
    return parsePopupAction(stdout);
  } catch {
    return fallbackPopup(normalizedPayload, dependencies.writeClipboardText);
  } finally {
    await fs.rm(payloadPath, { force: true });
  }
}

async function fallbackPopup(payload: PopupPayload, copyToClipboard: typeof writeClipboardText): Promise<PopupAction> {
  const fallbackPayload = normalizeCopiedPayload(payload);
  if (fallbackPayload.copyText) {
    await copyToClipboard(fallbackPayload.copyText);
  }

  const script = `
display dialog "${escapeDialogText(buildFallbackDialogText(fallbackPayload))}" with title "${escapeDialogText(fallbackPayload.title)}" buttons {"OK"} default button "OK"
`;

  await runAppleScript(script);
  return "close";
}

function normalizePopupPayload(payload: PopupPayload): PopupPayload {
  const detailParts = [payload.detail];

  if (payload.clipboardNotice) {
    detailParts.push(payload.clipboardNotice);
  }

  return {
    ...payload,
    detail: joinDetailParts(detailParts)
  };
}

function buildFallbackDialogText(payload: PopupPayload): string {
  return [payload.body, payload.detail].filter(Boolean).join("\n\n");
}

function normalizeCopiedPayload(payload: PopupPayload): PopupPayload {
  if (!payload.copyText) {
    return payload;
  }

  return {
    ...payload,
    detail: joinDetailParts([payload.detail, payload.clipboardNotice ?? defaultClipboardNotice(payload.kind)])
  };
}

function joinDetailParts(parts: Array<string | undefined>): string | undefined {
  const filtered = parts.map((value) => value?.trim()).filter(Boolean);
  if (filtered.length === 0) {
    return undefined;
  }

  return filtered.join("\n\n");
}

function defaultClipboardNotice(kind: PopupPayload["kind"]): string {
  if (kind === "error") {
    return "The fallback content has been copied to your clipboard.";
  }

  if (kind === "explanation") {
    return "This explanation has already been copied to your clipboard.";
  }

  return "This content has already been copied to your clipboard.";
}

function parsePopupAction(stdout: string): PopupAction {
  const normalized = stdout.trim();
  if (normalized === "copy" || normalized === "open" || normalized === "replace_selection") {
    return normalized;
  }

  return "close";
}

function escapeDialogText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n");
}
