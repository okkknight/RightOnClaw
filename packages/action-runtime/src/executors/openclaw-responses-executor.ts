import { randomUUID } from "node:crypto";

import { AppError, ERROR_CODES } from "@rightonclaw/core";
import { CredentialResolutionError, type CredentialProviderRegistry, type SharedCredentialValue } from "@rightonclaw/credential-layer";

import type { OpenClawResponsesClient } from "../openclaw-responses-client";
import type { ActionExecutor, ActionExecutorInput, ExecutorExecutionResult } from "./types";

export class OpenClawResponsesExecutor implements ActionExecutor {
  public readonly runner = "openclaw_responses" as const;

  public constructor(
    private readonly client: OpenClawResponsesClient,
    private readonly credentialProviderRegistry: Pick<CredentialProviderRegistry, "resolve">
  ) {}

  public async execute(input: ActionExecutorInput): Promise<ExecutorExecutionResult> {
    const credential = await this.resolveCredential(input);
    const prompt = input.manifest.buildPrompt(input.request);
    const sessionId = buildSessionId(input.manifest.id, credential);
    const generated = await this.client.generateText({
      prompt,
      credential,
      requestId: input.request.request_id,
      sessionId,
      maxOutputTokens: input.manifest.maxOutputTokens
    });

    return {
      sessionId,
      webuiUrl: null,
      generatedText: generated.text,
      model: generated.model,
      credentialProvider: credential.provider
    };
  }

  private async resolveCredential(input: ActionExecutorInput) {
    try {
      return await this.credentialProviderRegistry.resolve({
        executor: "openclaw",
        target: "openclaw",
        purpose: "generation"
      });
    } catch (error) {
      if (error instanceof CredentialResolutionError) {
        throw new AppError({
          code: ERROR_CODES.GENERATION_FAILED,
          message: `No OpenClaw responses credential resolved for ${input.manifest.id}.`,
          phase: "generation",
          retryable: false,
          statusCode: 500,
          details: {
            manifest_id: input.manifest.id,
            credential_error_code: error.code,
            attempted_providers: error.attemptedProviders
          }
        });
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError({
        code: ERROR_CODES.GENERATION_FAILED,
        message: `OpenClaw responses executor failed before generation: ${error instanceof Error ? error.message : String(error)}`,
        phase: "generation",
        retryable: false,
        statusCode: 500,
        details: {
          manifest_id: input.manifest.id
        }
      });
    }
  }
}

function buildSessionId(manifestId: string, credential: { kind: string; value?: unknown }): string {
  if (credential.kind === "shared_reference" && credential.value && typeof credential.value === "object") {
    const value = credential.value as SharedCredentialValue;
    if (typeof value.agentId === "string" && value.agentId.trim()) {
      return `agent:${value.agentId}:rightonclaw:${randomUUID()}`;
    }
  }

  return `openclaw_responses:${manifestId}:${randomUUID()}`;
}
