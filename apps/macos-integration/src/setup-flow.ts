import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { BridgeRequestError, configureBackend, getBackends, type BackendsResponse } from "./bridge-client";
import { escapeAppleScriptString, runAppleScript } from "./apple-script";
import { openUrl } from "./open";
import { getRuntimeTmpDir } from "./paths";
import {
  buildSetupPanelPayload,
  shouldShowSetupFlow,
  type SetupPanelDefaults,
  type SetupPanelPayload,
  type SetupPanelResult
} from "./setup-state";

const execFileAsync = promisify(execFile);
const DEFAULT_OPENCLAW_INSTALL_URL = "https://github.com/openclaw/openclaw";

export interface SetupFlowDependencies {
  getBackends: typeof getBackends;
  configureBackend: typeof configureBackend;
  showSetupPanel: typeof showSetupPanel;
  openUrl: typeof openUrl;
  log: (message: string) => void;
}

export interface RunSetupFlowOptions extends Partial<SetupFlowDependencies> {
  mode?: "auto" | "manual";
}

export async function runSetupFlow(options: RunSetupFlowOptions = {}): Promise<BackendsResponse | null> {
  const dependencies = resolveDependencies(options);
  const mode = options.mode ?? "auto";

  let snapshot: BackendsResponse;
  try {
    snapshot = await dependencies.getBackends();
  } catch (error) {
    dependencies.log(formatLogMessage("Skipping setup flow because backend discovery failed.", error));
    return null;
  }

  let shouldPresent = mode === "manual" || shouldShowSetupFlow(snapshot);
  if (!shouldPresent) {
    return snapshot;
  }

  let defaults: SetupPanelDefaults = {};

  while (shouldPresent) {
    const result = await dependencies.showSetupPanel(buildSetupPanelPayload(snapshot, defaults, { mode }));

    if (result.outcome === "cancel" || result.outcome === "skip") {
      return snapshot;
    }

    if (result.outcome === "install_openclaw") {
      try {
        await dependencies.openUrl(getOpenClawInstallUrl());
        return snapshot;
      } catch (error) {
        defaults = {
          ...defaults,
          errorMessage: formatUserErrorMessage(error, "Could not open the OpenClaw install page automatically.")
        };
        continue;
      }
    }

    defaults = {
      apiKey: result.api_key,
      baseUrl: result.base_url,
      model: result.model
    };

    try {
      const configured = await dependencies.configureBackend({
        backend: "openai_compatible",
        api_key: result.api_key ?? "",
        base_url: result.base_url,
        model: result.model
      });
      snapshot = configured.backends;

      if (!shouldShowSetupFlow(snapshot)) {
        return snapshot;
      }

      defaults = {
        ...defaults,
        errorMessage:
          snapshot.selection_error?.message ??
          "The API key backend was saved, but RightOnClaw still needs additional setup."
      };
    } catch (error) {
      defaults = {
        ...defaults,
        errorMessage: formatUserErrorMessage(error, "RightOnClaw could not save this backend configuration.")
      };
    }

    shouldPresent = shouldShowSetupFlow(snapshot);
  }

  return snapshot;
}

export async function showSetupPanel(payload: SetupPanelPayload): Promise<SetupPanelResult> {
  if (process.env.RIGHTONCLAW_DISABLE_SETUP_PANEL === "1") {
    return showSetupPanelFallback(payload);
  }

  await fs.mkdir(getRuntimeTmpDir(), { recursive: true });
  const payloadPath = path.join(getRuntimeTmpDir(), `setup-panel-${Date.now()}.json`);

  try {
    await fs.writeFile(payloadPath, JSON.stringify(payload), "utf8");
    const setupPanelBinary = path.join(__dirname, "bin", "rightonclaw-setup-panel");
    const { stdout } = await execFileAsync(setupPanelBinary, ["--payload", payloadPath], {
      env: process.env,
      maxBuffer: 1024 * 1024
    });
    return parseSetupPanelResult(stdout);
  } catch {
    return showSetupPanelFallback(payload);
  } finally {
    await fs.rm(payloadPath, { force: true });
  }
}

function resolveDependencies(overrides: Partial<SetupFlowDependencies>): SetupFlowDependencies {
  return {
    getBackends: overrides.getBackends ?? getBackends,
    configureBackend: overrides.configureBackend ?? configureBackend,
    showSetupPanel: overrides.showSetupPanel ?? showSetupPanel,
    openUrl: overrides.openUrl ?? openUrl,
    log: overrides.log ?? console.warn
  };
}

function parseSetupPanelResult(stdout: string): SetupPanelResult {
  try {
    const parsed = JSON.parse(stdout.trim()) as SetupPanelResult;
    if (
      parsed.outcome === "cancel" ||
      parsed.outcome === "skip" ||
      parsed.outcome === "install_openclaw" ||
      parsed.outcome === "configure_api_key"
    ) {
      return parsed;
    }
  } catch {
    // Fall through.
  }

  return {
    outcome: "cancel"
  };
}

async function showSetupPanelFallback(payload: SetupPanelPayload): Promise<SetupPanelResult> {
  try {
    const action = await runAppleScript(buildSetupChoiceScript(payload));
    const normalizedAction = action.trim();

    if (payload.openClawActionLabel && normalizedAction === payload.openClawActionLabel) {
      return {
        outcome: "install_openclaw"
      };
    }

    if (normalizedAction === payload.cancelActionLabel) {
      return {
        outcome: "skip"
      };
    }

    const apiKey = await runPromptScript("API Key", payload.initialApiKey);
    if (apiKey === null) {
      return {
        outcome: "cancel"
      };
    }

    const baseUrl = await runPromptScript("Base URL (optional)", payload.initialBaseUrl);
    if (baseUrl === null) {
      return {
        outcome: "cancel"
      };
    }

    const model = await runPromptScript("Model (optional)", payload.initialModel);
    if (model === null) {
      return {
        outcome: "cancel"
      };
    }

    return {
      outcome: "configure_api_key",
      api_key: apiKey,
      base_url: baseUrl,
      model
    };
  } catch {
    return {
      outcome: "cancel"
    };
  }
}

async function runPromptScript(label: string, initialValue: string): Promise<string | null> {
  const script = `
set dialogResult to display dialog "${escapeAppleScriptString(label)}" default answer "${escapeAppleScriptString(initialValue)}" buttons {"Cancel", "OK"} default button "OK" cancel button "Cancel" with title "RightOnClaw Setup"
return text returned of dialogResult
`;

  try {
    return await runAppleScript(script);
  } catch {
    return null;
  }
}

function buildSetupChoiceScript(payload: SetupPanelPayload): string {
  const message = [payload.headline, payload.detail, payload.recommendation, payload.alternative, payload.errorMessage]
    .filter(Boolean)
    .join("\\n\\n");

  const primaryActionLabel = payload.openClawActionLabel?.trim();
  if (!primaryActionLabel) {
    return `
set dialogResult to display dialog "${escapeAppleScriptString(message)}" buttons {"${escapeAppleScriptString(payload.cancelActionLabel)}", "Use API Key"} default button "Use API Key" cancel button "${escapeAppleScriptString(payload.cancelActionLabel)}" with title "${escapeAppleScriptString(payload.title)}"
return button returned of dialogResult
`;
  }

  return `
set dialogResult to display dialog "${escapeAppleScriptString(message)}" buttons {"${escapeAppleScriptString(payload.cancelActionLabel)}", "Use API Key", "${escapeAppleScriptString(primaryActionLabel)}"} default button "${escapeAppleScriptString(primaryActionLabel)}" cancel button "${escapeAppleScriptString(payload.cancelActionLabel)}" with title "${escapeAppleScriptString(payload.title)}"
return button returned of dialogResult
`;
}

function getOpenClawInstallUrl(): string {
  return process.env.RIGHTONCLAW_OPENCLAW_INSTALL_URL?.trim() || DEFAULT_OPENCLAW_INSTALL_URL;
}

function formatUserErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof BridgeRequestError && error.message.trim()) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function formatLogMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return `[RightOnClaw] ${prefix} ${error.message}`;
  }

  return `[RightOnClaw] ${prefix}`;
}
