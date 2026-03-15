import type { CredentialRequest } from "./provider";

export class CredentialResolutionError extends Error {
  public readonly code: "CREDENTIAL_PROVIDER_NOT_FOUND" | "NO_CREDENTIAL_PROVIDER_RESOLVED";
  public readonly request: CredentialRequest;
  public readonly attemptedProviders: string[];

  public constructor(input: {
    code: "CREDENTIAL_PROVIDER_NOT_FOUND" | "NO_CREDENTIAL_PROVIDER_RESOLVED";
    message: string;
    request: CredentialRequest;
    attemptedProviders: string[];
  }) {
    super(input.message);
    this.name = "CredentialResolutionError";
    this.code = input.code;
    this.request = input.request;
    this.attemptedProviders = input.attemptedProviders;
  }
}
