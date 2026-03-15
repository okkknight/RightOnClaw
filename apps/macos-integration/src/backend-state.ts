import type { BackendsResponse, BackendStatus } from "./bridge-client";

export interface BackendUiState {
  kind: "openclaw_connected" | "api_backend_active" | "setup_required";
  title: string;
  detail: string;
  defaultBackend: BackendsResponse["default_backend"];
  fastPathAvailable: boolean;
  supportsSendToClaw: boolean;
}

export function resolveBackendUiState(snapshot: BackendsResponse): BackendUiState {
  const selectedBackend = getSelectedBackend(snapshot);

  if (!snapshot.default_backend || snapshot.setup_required || !selectedBackend) {
    return {
      kind: "setup_required",
      title: "Setup Required",
      detail: snapshot.selection_error?.message ?? "No available backend is configured yet.",
      defaultBackend: null,
      fastPathAvailable: false,
      supportsSendToClaw: false
    };
  }

  if (snapshot.default_backend === "openclaw") {
    return {
      kind: "openclaw_connected",
      title: "OpenClaw Connected",
      detail: snapshot.fast_path_available
        ? "OpenClaw is active and the text fast path is available."
        : "OpenClaw is active.",
      defaultBackend: snapshot.default_backend,
      fastPathAvailable: snapshot.fast_path_available,
      supportsSendToClaw: selectedBackend.supported_actions.includes("send_to_claw")
    };
  }

  return {
    kind: "api_backend_active",
    title: "API Key Backend Active",
    detail: `${selectedBackend.display_name} is active as the current fallback backend.`,
    defaultBackend: snapshot.default_backend,
    fastPathAvailable: false,
    supportsSendToClaw: selectedBackend.supported_actions.includes("send_to_claw")
  };
}

function getSelectedBackend(snapshot: BackendsResponse): BackendStatus | null {
  if (!snapshot.default_backend) {
    return null;
  }

  return snapshot.backends.find((backend) => backend.id === snapshot.default_backend) ?? null;
}
