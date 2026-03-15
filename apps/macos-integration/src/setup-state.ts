import type { BackendsResponse } from "./bridge-client";
import { resolveBackendUiState } from "./backend-state";

export interface SetupPanelDefaults {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  errorMessage?: string;
}

export interface SetupPanelPayload {
  title: string;
  headline: string;
  detail: string;
  recommendation: string;
  alternative: string;
  openClawActionLabel?: string;
  cancelActionLabel: string;
  errorMessage?: string;
  initialApiKey: string;
  initialBaseUrl: string;
  initialModel: string;
}

export interface SetupPanelResult {
  outcome: "cancel" | "skip" | "install_openclaw" | "configure_api_key";
  api_key?: string;
  base_url?: string;
  model?: string;
}

export function shouldShowSetupFlow(snapshot: BackendsResponse): boolean {
  return resolveBackendUiState(snapshot).kind === "setup_required";
}

export function buildSetupPanelPayload(
  snapshot: BackendsResponse,
  defaults: SetupPanelDefaults = {},
  options: {
    mode?: "auto" | "manual";
  } = {}
): SetupPanelPayload {
  const setupCopy = resolveSetupCopy(snapshot, options.mode ?? "auto");

  return {
    title: setupCopy.title,
    headline: setupCopy.headline,
    detail: setupCopy.detail,
    recommendation: setupCopy.recommendation,
    alternative: setupCopy.alternative,
    openClawActionLabel: setupCopy.openClawActionLabel,
    cancelActionLabel: setupCopy.cancelActionLabel,
    errorMessage: normalizeOptionalString(defaults.errorMessage),
    initialApiKey: defaults.apiKey?.trim() ?? "",
    initialBaseUrl: defaults.baseUrl?.trim() ?? "",
    initialModel: defaults.model?.trim() ?? ""
  };
}

function resolveSetupCopy(snapshot: BackendsResponse, mode: "auto" | "manual"): {
  title: string;
  headline: string;
  detail: string;
  recommendation: string;
  alternative: string;
  openClawActionLabel?: string;
  cancelActionLabel: string;
} {
  const uiState = resolveBackendUiState(snapshot);
  const openClawStatus = snapshot.backends.find((backend) => backend.id === "openclaw") ?? null;
  const apiBackendStatus = snapshot.backends.find((backend) => backend.id === "openai_compatible") ?? null;

  if (mode === "manual") {
    if (uiState.kind === "openclaw_connected") {
      return {
        title: "RightOnClaw Settings",
        headline: "OpenClaw is active.",
        detail: uiState.detail,
        recommendation: "Keep OpenClaw enabled for the full RightOnClaw experience.",
        alternative: "You can also save an API key backend as a fallback below.",
        cancelActionLabel: "Close"
      };
    }

    if (uiState.kind === "api_backend_active") {
      return {
        title: "RightOnClaw Settings",
        headline: "API Key backend is active.",
        detail: uiState.detail,
        recommendation: openClawStatus?.configured
          ? "Fix OpenClaw to restore the full RightOnClaw experience."
          : "Install OpenClaw to unlock the full RightOnClaw experience.",
        alternative: "Or update the API key backend below.",
        openClawActionLabel: openClawStatus?.configured ? "Fix OpenClaw" : "Install OpenClaw",
        cancelActionLabel: "Close"
      };
    }

    if (apiBackendStatus?.configured && !apiBackendStatus.healthy) {
      return {
        title: "RightOnClaw Settings",
        headline: "Your API key backend needs attention.",
        detail: uiState.detail,
        recommendation: openClawStatus?.configured
          ? "Fix OpenClaw to return to the default backend."
          : "Install OpenClaw for the best default experience.",
        alternative: "Or update the API key backend below.",
        openClawActionLabel: openClawStatus?.configured ? "Fix OpenClaw" : "Install OpenClaw",
        cancelActionLabel: "Close"
      };
    }
  }

  if (openClawStatus?.configured && !openClawStatus.healthy) {
    return {
      title: "RightOnClaw Setup",
      headline: "OpenClaw was detected, but it is currently unavailable.",
      detail: buildOpenClawUnavailableDetail(openClawStatus.reason, uiState.detail),
      recommendation: "Fix OpenClaw to keep the full RightOnClaw experience.",
      alternative: "Or use an API key backend until OpenClaw is healthy again.",
      openClawActionLabel: "Fix OpenClaw",
      cancelActionLabel: mode === "manual" ? "Close" : "Skip for now"
    };
  }

  return {
    title: mode === "manual" ? "RightOnClaw Settings" : "RightOnClaw Setup",
    headline: "RightOnClaw needs an AI backend.",
    detail: uiState.detail,
    recommendation: "Install OpenClaw for the best experience.",
    alternative: "Or use an API key backend.",
    openClawActionLabel: "Install OpenClaw",
    cancelActionLabel: mode === "manual" ? "Close" : "Skip for now"
  };
}

function buildOpenClawUnavailableDetail(reason: string | undefined, fallbackDetail: string): string {
  switch (reason) {
    case "timeout":
      return "OpenClaw is installed, but the gateway did not respond in time. RightOnClaw cannot use it until it becomes healthy again.";
    case "http_500":
      return "OpenClaw is installed, but the gateway returned an internal error. RightOnClaw cannot use it until that error is resolved.";
    case "http_401":
    case "http_403":
      return "OpenClaw is installed, but authentication is failing. Re-authenticate OpenClaw, then try again.";
    default:
      return fallbackDetail;
  }
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
