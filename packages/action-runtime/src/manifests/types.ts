import type { ActionRequest } from "@rightonclaw/types";

export type ActionRunner = "openclaw" | "openclaw_responses" | "model";
export type ActionResponseMode = "message_only" | "generate_text";

export interface ActionManifest {
  id: ActionRequest["action"] | "summarize_fast" | "explain_fast";
  title: string;
  runner: ActionRunner;
  sessionTitle: string;
  responseMode: ActionResponseMode;
  maxOutputTokens?: number;
  preferredCredentialProviders?: string[];
  buildPrompt(request: ActionRequest): string;
}

export interface ActionManifestLoader {
  load(action: ActionRequest["action"]): ActionManifest;
}
