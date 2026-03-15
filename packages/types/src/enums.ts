export const ACTION_NAMES = ["summarize", "explain", "rewrite", "send_to_claw", "ask_claw"] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

export const SELECTION_KINDS = ["file", "directory", "text", "manual"] as const;
export type SelectionKind = (typeof SELECTION_KINDS)[number];

export const SELECTION_CONTEXT_KINDS = ["text", "file", "folder", "image", "screenshot", "mixed"] as const;
export type SelectionContextKind = (typeof SELECTION_CONTEXT_KINDS)[number];

export const SELECTION_ITEM_KINDS = ["file", "folder", "image", "text"] as const;
export type SelectionItemKind = (typeof SELECTION_ITEM_KINDS)[number];

export const SELECTION_CAPTURE_MODES = ["selection", "screenshot", "finder", "manual"] as const;
export type SelectionCaptureMode = (typeof SELECTION_CAPTURE_MODES)[number];

export const DELIVERY_MODES = [
  "open_webui",
  "popup",
  "apply_selection",
  "clipboard",
  "notification"
] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const RESPONSE_STATUSES = ["ok", "partial", "error"] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const SESSION_STRATEGIES = ["new", "reuse_latest", "reuse_named"] as const;
export type SessionStrategy = (typeof SESSION_STRATEGIES)[number];

export const REWRITE_MODES = [
  "rewrite",
  "polish",
  "shorten",
  "expand",
  "formal",
  "friendly"
] as const;
export type RewriteMode = (typeof REWRITE_MODES)[number];

export const PROMPT_PRESETS = ["freeform", "summarize", "explain", "send_to_claw"] as const;
export type PromptPreset = (typeof PROMPT_PRESETS)[number];

export const CONTENT_FORMATS = ["plain_text"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const ERROR_PHASES = [
  "capture",
  "validation",
  "generation",
  "delivery",
  "security"
] as const;
export type ErrorPhase = (typeof ERROR_PHASES)[number];
