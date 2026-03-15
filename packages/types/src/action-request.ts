import type {
  ActionName,
  PromptPreset,
  RewriteMode,
  SelectionCaptureMode,
  SelectionContextKind,
  SelectionItemKind,
  SessionStrategy
} from "./enums";

export interface ActionSource {
  platform: string;
  entry: string;
  app_name?: string;
  window_title?: string;
  bundle_id?: string;
}

export interface FileSelection {
  kind: "file";
  text: null;
  paths: string[];
  mime?: string | null;
  encoding?: string | null;
  char_count?: null;
}

export interface DirectorySelection {
  kind: "directory";
  text: null;
  paths: string[];
  mime?: string | null;
  encoding?: string | null;
  char_count?: null;
}

export interface TextSelection {
  kind: "text";
  text: string;
  paths: string[];
  mime?: string | null;
  encoding?: string | null;
  char_count?: number | null;
}

export interface ManualSelection {
  kind: "manual";
  text: null;
  paths: [];
  mime?: string | null;
  encoding?: string | null;
  char_count?: null;
}

export type ActionSelection = FileSelection | DirectorySelection | TextSelection | ManualSelection;

export interface SelectionContextText {
  value: string;
  char_count: number;
}

export interface SelectionContextItem {
  item_kind: SelectionItemKind;
  path?: string;
  name?: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  extension?: string | null;
  inline_text_preview?: string | null;
}

export interface SelectionCapture {
  mode: SelectionCaptureMode;
  created_at: string;
}

export interface SelectionContext {
  kind: SelectionContextKind;
  text?: SelectionContextText | null;
  items?: SelectionContextItem[];
  source_app?: string;
  capture?: SelectionCapture | null;
  summary?: string;
}

export interface ActionOptions {
  open_webui?: boolean;
  show_popup?: boolean;
  replace_selection?: boolean;
  session_strategy?: SessionStrategy;
  rewrite_mode?: RewriteMode;
  prompt_preset?: PromptPreset;
  timeout_ms?: number;
}

export interface ActionRequest {
  version: string;
  request_id: string;
  action: ActionName;
  source: ActionSource;
  selection: ActionSelection;
  selection_context?: SelectionContext;
  prompt?: string;
  stream?: boolean;
  options?: ActionOptions;
}
