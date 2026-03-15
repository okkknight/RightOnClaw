export const BACKEND_IDS = ["openclaw", "openai_compatible"] as const;
export type BackendId = (typeof BACKEND_IDS)[number];

export const BACKEND_SELECTION_MODES = ["auto", "manual"] as const;
export type BackendSelectionMode = (typeof BACKEND_SELECTION_MODES)[number];

export const BACKEND_SOURCES = ["auto", "manual"] as const;
export type BackendSource = (typeof BACKEND_SOURCES)[number];

export interface BackendStatus {
  id: BackendId;
  display_name: string;
  configured: boolean;
  healthy: boolean;
  available: boolean;
  preferred: boolean;
  source: BackendSource;
  reason?: string;
  supported_actions: string[];
  supports_fast_path: boolean;
  default_runner: string;
  fast_path_runner?: string | null;
}

export interface BackendSelectionError {
  code: string;
  message: string;
  backend_id?: BackendId | null;
}

export interface BackendSelectionSnapshot {
  selection_mode: BackendSelectionMode;
  requested_backend: BackendId | null;
  default_backend: BackendId | null;
  fast_path_backend: BackendId | null;
  fast_path_available: boolean;
  setup_required: boolean;
  selection_error?: BackendSelectionError;
  backends: BackendStatus[];
}

export interface BackendCapabilitiesSummary {
  default_backend: BackendId | null;
  fast_path_backend: BackendId | null;
  fast_path_available: boolean;
  setup_required: boolean;
  backends: BackendStatus[];
}
