import type { OpenClawClient, OpenClawClientFactoryOptions } from "./client";
import { MockOpenClawClient } from "./mock-client";
import { RealOpenClawClient } from "./real-client";

export function createOpenClawClient(options: OpenClawClientFactoryOptions = {}): OpenClawClient {
  if (options.mode === "real") {
    return new RealOpenClawClient({
      baseUrl: options.baseUrl,
      gatewayUrl: options.gatewayUrl,
      authToken: options.gatewayToken,
      authPassword: options.gatewayPassword,
      agentId: options.agentId,
      requestTimeoutMs: options.requestTimeoutMs,
      responsesPath: options.responsesPath,
      sendToClawMaxOutputTokens: options.sendToClawMaxOutputTokens,
      generationMaxOutputTokens: options.generationMaxOutputTokens
    });
  }

  return new MockOpenClawClient({
    baseUrl: options.baseUrl
  });
}
