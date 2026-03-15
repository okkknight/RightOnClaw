import type { BackendId, BackendSelectionMode, BackendSelectionSnapshot, BackendStatus, LoadedBackendConfig } from "@rightonclaw/core";

import type { BackendDiscovery, BackendSelectionResolver, StaticBackendSelectionInput } from "./types";

export interface BackendSelectionServiceOptions {
  discovery: BackendDiscovery;
  selectionMode?: "auto" | "manual";
  selectedBackend: BackendId | null;
  backendConfig?: Pick<LoadedBackendConfig, "selection_mode" | "selected_backend">;
  summarizeFastPathEnabled: boolean;
  explainFastPathEnabled: boolean;
}

export class BackendSelectionService implements BackendSelectionResolver {
  private readonly discovery: BackendDiscovery;
  private readonly selectionMode: "auto" | "manual";
  private readonly selectedBackend: BackendId | null;
  private readonly backendConfig?: Pick<LoadedBackendConfig, "selection_mode" | "selected_backend">;
  private readonly summarizeFastPathEnabled: boolean;
  private readonly explainFastPathEnabled: boolean;

  public constructor(options: BackendSelectionServiceOptions) {
    this.discovery = options.discovery;
    this.selectionMode = options.selectionMode ?? "auto";
    this.selectedBackend = options.selectedBackend;
    this.backendConfig = options.backendConfig;
    this.summarizeFastPathEnabled = options.summarizeFastPathEnabled;
    this.explainFastPathEnabled = options.explainFastPathEnabled;
  }

  public async resolve(): Promise<BackendSelectionSnapshot> {
    const backends = await this.discovery.discover();
    const selectionMode = this.backendConfig?.selection_mode ?? this.selectionMode;
    const selectedBackend = this.backendConfig?.selected_backend ?? this.selectedBackend;

    return selectBackendSnapshot(backends, {
      selectionMode: selectionMode ?? "auto",
      selectedBackend: selectedBackend ?? null,
      summarizeFastPathEnabled: this.summarizeFastPathEnabled,
      explainFastPathEnabled: this.explainFastPathEnabled
    });
  }
}

export function createStaticBackendSelectionResolver(
  input: StaticBackendSelectionInput
): BackendSelectionResolver {
  const defaultBackend = input.default_backend;
  const backends =
    input.backends ??
    (defaultBackend
      ? [
          {
            id: defaultBackend,
            display_name: defaultBackend === "openclaw" ? "OpenClaw" : "API Key",
            configured: true,
            healthy: true,
            available: true,
            preferred: true,
            source: "manual",
            reason: "static_override",
            supported_actions:
              defaultBackend === "openclaw"
                ? ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"]
                : ["ask_claw", "summarize", "explain", "rewrite"],
            supports_fast_path: defaultBackend === "openclaw",
            default_runner: defaultBackend === "openclaw" ? "openclaw" : "model",
            fast_path_runner: defaultBackend === "openclaw" ? "openclaw_responses" : null
          }
        ]
      : []);

  return {
    async resolve() {
      return {
        selection_mode: input.selection_mode ?? "manual",
        requested_backend: input.requested_backend ?? defaultBackend,
        default_backend: defaultBackend,
        fast_path_backend: input.fast_path_backend ?? (defaultBackend === "openclaw" ? "openclaw" : null),
        fast_path_available: input.fast_path_available ?? defaultBackend === "openclaw",
        setup_required: input.setup_required ?? defaultBackend === null,
        selection_error: input.selection_error,
        backends
      };
    }
  };
}

function selectBackendSnapshot(
  backends: BackendStatus[],
  input: {
    selectionMode: BackendSelectionMode;
    selectedBackend: BackendId | null;
    summarizeFastPathEnabled: boolean;
    explainFastPathEnabled: boolean;
  }
): BackendSelectionSnapshot {
  if (input.selectionMode === "manual") {
    const requested = input.selectedBackend;
    const selectedStatus = requested ? backends.find((backend) => backend.id === requested) ?? null : null;

    if (!requested || !selectedStatus || !selectedStatus.available) {
      return {
        selection_mode: "manual",
        requested_backend: requested,
        default_backend: null,
        fast_path_backend: null,
        fast_path_available: false,
        setup_required: true,
        selection_error: {
          code: requested ? "BACKEND_UNAVAILABLE" : "BACKEND_SETUP_REQUIRED",
          message: requested
            ? `Backend ${requested} is selected manually but is not available.`
            : "Manual backend mode requires a selected backend.",
          backend_id: requested
        },
        backends: markPreferred(backends, null)
      };
    }

    const preferredBackends = markPreferred(backends, selectedStatus.id);
    return {
      selection_mode: "manual",
      requested_backend: requested,
      default_backend: selectedStatus.id,
      fast_path_backend: canUseFastPath(selectedStatus, input) ? "openclaw" : null,
      fast_path_available: canUseFastPath(selectedStatus, input),
      setup_required: false,
      backends: preferredBackends
    };
  }

  const openClaw = backends.find((backend) => backend.id === "openclaw" && backend.available) ?? null;
  const apiBackend = backends.find((backend) => backend.id === "openai_compatible" && backend.available) ?? null;
  const selected = openClaw ?? apiBackend;

  return {
    selection_mode: "auto",
    requested_backend: null,
    default_backend: selected?.id ?? null,
    fast_path_backend: selected && canUseFastPath(selected, input) ? "openclaw" : null,
    fast_path_available: Boolean(selected && canUseFastPath(selected, input)),
    setup_required: !selected,
    selection_error: selected
      ? undefined
      : {
          code: "BACKEND_SETUP_REQUIRED",
          message: "No available backend is configured.",
          backend_id: null
        },
    backends: markPreferred(backends, selected?.id ?? null)
  };
}

function canUseFastPath(
  backend: BackendStatus,
  input: {
    summarizeFastPathEnabled: boolean;
    explainFastPathEnabled: boolean;
  }
): boolean {
  if (backend.id !== "openclaw" || !backend.supports_fast_path) {
    return false;
  }

  return input.summarizeFastPathEnabled || input.explainFastPathEnabled;
}

function markPreferred(backends: BackendStatus[], preferredId: BackendId | null): BackendStatus[] {
  return backends.map((backend) => ({
    ...backend,
    preferred: backend.id === preferredId
  }));
}
