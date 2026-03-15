import type { CredentialProvider, CredentialRequest, ResolvedCredential } from "../provider";

export interface ApiKeyCredentialValue {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface ApiKeyCredentialProviderOptions {
  env?: NodeJS.ProcessEnv;
}

export class ApiKeyCredentialProvider implements CredentialProvider<ApiKeyCredentialValue> {
  public readonly name = "api_key";
  private readonly env: NodeJS.ProcessEnv;

  public constructor(options: ApiKeyCredentialProviderOptions = {}) {
    this.env = options.env ?? process.env;
  }

  public canResolve(input: CredentialRequest): boolean {
    if (input.executor !== "model") {
      return false;
    }

    return hasValue(this.env.RIGHTONCLAW_MODEL_API_KEY);
  }

  public async resolve(_input: CredentialRequest): Promise<ResolvedCredential<ApiKeyCredentialValue>> {
    return {
      provider: this.name,
      kind: "api_key",
      value: {
        apiKey: this.env.RIGHTONCLAW_MODEL_API_KEY?.trim() ?? "",
        baseUrl: readValue(this.env.RIGHTONCLAW_MODEL_BASE_URL),
        model: readValue(this.env.RIGHTONCLAW_MODEL_NAME)
      },
      meta: {
        sources: [
          "RIGHTONCLAW_MODEL_API_KEY",
          ...(hasValue(this.env.RIGHTONCLAW_MODEL_BASE_URL) ? ["RIGHTONCLAW_MODEL_BASE_URL"] : []),
          ...(hasValue(this.env.RIGHTONCLAW_MODEL_NAME) ? ["RIGHTONCLAW_MODEL_NAME"] : [])
        ]
      }
    };
  }
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function readValue(value: string | undefined): string | undefined {
  return hasValue(value) ? value?.trim() : undefined;
}
