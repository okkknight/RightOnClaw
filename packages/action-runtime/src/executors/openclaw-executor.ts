import type { CredentialProviderRegistry } from "@rightonclaw/credential-layer";
import type { OpenClawClient } from "@rightonclaw/openclaw-client";

import type { ActionExecutor, ActionExecutorInput, ExecutorExecutionResult } from "./types";

export class OpenClawExecutor implements ActionExecutor {
  public readonly runner = "openclaw" as const;

  public constructor(
    private readonly client: OpenClawClient,
    private readonly credentialProviderRegistry?: CredentialProviderRegistry
  ) {}

  public async execute(input: ActionExecutorInput): Promise<ExecutorExecutionResult> {
    void this.credentialProviderRegistry;
    const sessionId = await resolveSessionId(input.request, this.client, input.manifest.sessionTitle);
    const prompt = input.manifest.buildPrompt(input.request);

    await this.client.sendMessage({
      sessionId,
      role: "user",
      content: prompt
    });

    let generatedText: string | undefined;
    let model: string | undefined;

    if (input.manifest.responseMode === "generate_text") {
      const generated = await this.client.generateAssistantResponse({ sessionId });
      generatedText = generated.text;
      model = generated.model;
    }

    const webuiUrl = await this.client.getSessionWebUrl({ sessionId });

    return {
      sessionId,
      webuiUrl,
      generatedText,
      model
    };
  }
}

async function resolveSessionId(
  request: ActionExecutorInput["request"],
  client: OpenClawClient,
  title: string
): Promise<string> {
  if (request.options?.session_strategy === "reuse_latest") {
    const latest = await client.getLatestSession();
    if (latest) {
      return latest.sessionId;
    }
  }

  const created = await client.createSession({ title });
  return created.sessionId;
}
