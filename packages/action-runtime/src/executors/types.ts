import type { Logger } from "@rightonclaw/core";
import type { ActionRequest } from "@rightonclaw/types";

import type { ActionManifest, ActionRunner } from "../manifests/types";

export interface ExecutorExecutionResult {
  sessionId: string;
  webuiUrl: string | null;
  generatedText?: string;
  model?: string;
  credentialProvider?: string;
}

export interface ActionExecutorInput {
  request: ActionRequest;
  manifest: ActionManifest;
  logger?: Logger;
}

export interface ActionExecutor {
  readonly runner: ActionRunner;
  execute(input: ActionExecutorInput): Promise<ExecutorExecutionResult>;
}
