import { CredentialResolutionError } from "./errors";
import type { CredentialProvider, CredentialRequest, ResolvedCredential } from "./provider";

export class CredentialProviderRegistry {
  private readonly providers: CredentialProvider[];

  public constructor(providers: CredentialProvider[] = []) {
    this.providers = [...providers];
  }

  public register(provider: CredentialProvider): void {
    this.providers.push(provider);
  }

  public list(): string[] {
    return this.providers.map((provider) => provider.name);
  }

  public async resolve(input: CredentialRequest): Promise<ResolvedCredential> {
    if (input.preferredProvider) {
      const provider = this.providers.find((entry) => entry.name === input.preferredProvider);

      if (!provider) {
        throw new CredentialResolutionError({
          code: "CREDENTIAL_PROVIDER_NOT_FOUND",
          message: `Credential provider ${input.preferredProvider} is not registered.`,
          request: input,
          attemptedProviders: this.list()
        });
      }

      if (!(await provider.canResolve(input))) {
        throw new CredentialResolutionError({
          code: "NO_CREDENTIAL_PROVIDER_RESOLVED",
          message: `Credential provider ${provider.name} could not resolve credentials for ${input.executor}.`,
          request: input,
          attemptedProviders: [provider.name]
        });
      }

      return provider.resolve(input);
    }

    const attemptedProviders: string[] = [];

    for (const provider of this.providers) {
      attemptedProviders.push(provider.name);
      if (await provider.canResolve(input)) {
        return provider.resolve(input);
      }
    }

    throw new CredentialResolutionError({
      code: "NO_CREDENTIAL_PROVIDER_RESOLVED",
      message: `No credential provider resolved credentials for ${input.executor}.`,
      request: input,
      attemptedProviders
    });
  }
}
