import { randomUUID } from "node:crypto";

import { AppError, ERROR_CODES } from "@rightonclaw/core";
import { CredentialResolutionError, type CredentialProviderRegistry } from "@rightonclaw/credential-layer";

import type { ModelClient } from "../model-client";
import type { ActionExecutor, ActionExecutorInput, ExecutorExecutionResult } from "./types";

export class ModelExecutor implements ActionExecutor {
  public readonly runner = "model" as const;

  public constructor(
    private readonly client: ModelClient,
    private readonly credentialProviderRegistry: Pick<CredentialProviderRegistry, "resolve">
  ) {}

  public async execute(input: ActionExecutorInput): Promise<ExecutorExecutionResult> {
    const credential = await this.resolveCredential(input);
    const prompt = input.manifest.buildPrompt(input.request);
    const generated = await this.client.generateText({
      prompt,
      credential,
      target: input.manifest.id,
      requestId: input.request.request_id,
      maxOutputTokens: input.manifest.maxOutputTokens
    });

    return {
      sessionId: `model:${input.manifest.id}:${randomUUID()}`,
      webuiUrl: null,
      generatedText: generated.text,
      model: generated.model,
      credentialProvider: credential.provider
    };
  }

  private async resolveCredential(input: ActionExecutorInput) {
    const preferredProviders = input.manifest.preferredCredentialProviders ?? [];

    for (const preferredProvider of preferredProviders) {
      try {
        return await this.credentialProviderRegistry.resolve({
          executor: "model",
          target: input.manifest.id,
          purpose: "generation",
          preferredProvider
        });
      } catch (error) {
        if (!(error instanceof CredentialResolutionError)) {
          throw error;
        }
      }
    }

    try {
      return await this.credentialProviderRegistry.resolve({
        executor: "model",
        target: input.manifest.id,
        purpose: "generation"
      });
    } catch (error) {
      if (error instanceof CredentialResolutionError) {
        throw new AppError({
          code: ERROR_CODES.GENERATION_FAILED,
          message: `No model credential resolved for ${input.manifest.id}.`,
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
        message: `Model executor failed before generation: ${error instanceof Error ? error.message : String(error)}`,
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
