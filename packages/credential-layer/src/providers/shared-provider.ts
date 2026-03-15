import type { CredentialProvider, CredentialRequest, ResolvedCredential } from "../provider";

export interface SharedCredentialValue {
  gatewayToken?: string;
  gatewayPassword?: string;
  gatewayUrl?: string;
  baseUrl?: string;
  agentId?: string;
}

export interface SharedCredentialProviderOptions {
  env?: NodeJS.ProcessEnv;
}

const SHARED_KEYS = [
  "RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN",
  "RIGHTONCLAW_OPENCLAW_GATEWAY_PASSWORD",
  "RIGHTONCLAW_OPENCLAW_GATEWAY_URL",
  "RIGHTONCLAW_OPENCLAW_BASE_URL",
  "RIGHTONCLAW_OPENCLAW_AGENT_ID"
] as const;

export class SharedCredentialProvider implements CredentialProvider<SharedCredentialValue> {
  public readonly name = "shared";
  private readonly env: NodeJS.ProcessEnv;

  public constructor(options: SharedCredentialProviderOptions = {}) {
    this.env = options.env ?? process.env;
  }

  public canResolve(input: CredentialRequest): boolean {
    if (input.executor !== "openclaw" && input.executor !== "model") {
      return false;
    }

    return SHARED_KEYS.some((key) => hasValue(this.env[key]));
  }

  public async resolve(_input: CredentialRequest): Promise<ResolvedCredential<SharedCredentialValue>> {
    const value: SharedCredentialValue = {
      gatewayToken: readValue(this.env.RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN),
      gatewayPassword: readValue(this.env.RIGHTONCLAW_OPENCLAW_GATEWAY_PASSWORD),
      gatewayUrl: readValue(this.env.RIGHTONCLAW_OPENCLAW_GATEWAY_URL),
      baseUrl: readValue(this.env.RIGHTONCLAW_OPENCLAW_BASE_URL),
      agentId: readValue(this.env.RIGHTONCLAW_OPENCLAW_AGENT_ID)
    };

    return {
      provider: this.name,
      kind: "shared_reference",
      value,
      meta: {
        sources: SHARED_KEYS.filter((key) => hasValue(this.env[key]))
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
