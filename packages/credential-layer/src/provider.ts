export interface CredentialProvider<T = unknown> {
  name: string;
  canResolve(input: CredentialRequest): Promise<boolean> | boolean;
  resolve(input: CredentialRequest): Promise<ResolvedCredential<T>>;
}

export interface CredentialRequest {
  executor: "openclaw" | "model" | "skill" | "script";
  target?: string;
  purpose?: "generation" | "session" | "skill_call";
  preferredProvider?: string;
}

export interface ResolvedCredential<T = unknown> {
  provider: string;
  kind: "bearer_token" | "api_key" | "shared_reference" | "none";
  value?: T;
  meta?: Record<string, unknown>;
}
