export interface OpenClawClient {
  createSession(input?: { title?: string }): Promise<{ sessionId: string }>;
  getLatestSession(): Promise<{ sessionId: string } | null>;
  sendMessage(input: { sessionId: string; role: "user"; content: string }): Promise<void>;
  generateAssistantResponse(input: { sessionId: string }): Promise<{ text: string; model?: string }>;
  getSessionWebUrl(input: { sessionId: string }): Promise<string | null>;
}

export type OpenClawClientMode = "mock" | "real";

export interface OpenClawClientFactoryOptions {
  mode?: OpenClawClientMode;
  baseUrl?: string;
  gatewayUrl?: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  agentId?: string;
  requestTimeoutMs?: number;
  responsesPath?: string;
  sendToClawMaxOutputTokens?: number;
  generationMaxOutputTokens?: number;
}

export interface OpenClawSessionRecord {
  sessionId: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    createdAt: number;
  }>;
}
