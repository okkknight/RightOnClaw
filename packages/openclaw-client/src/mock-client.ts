import { AppError, ERROR_CODES } from "@rightonclaw/core";

import type { OpenClawClient, OpenClawSessionRecord } from "./client";

export interface MockOpenClawClientOptions {
  baseUrl?: string;
  modelName?: string;
}

export class MockOpenClawClient implements OpenClawClient {
  private readonly baseUrl: string;
  private readonly modelName: string;
  private readonly sessions = new Map<string, OpenClawSessionRecord>();
  private sequence = 0;

  public constructor(options: MockOpenClawClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:3000").replace(/\/$/, "");
    this.modelName = options.modelName ?? "mock-openclaw-v1";
  }

  public async createSession(input?: { title?: string }): Promise<{ sessionId: string }> {
    const now = Date.now();
    const sessionId = `sess_${String(++this.sequence).padStart(4, "0")}`;

    this.sessions.set(sessionId, {
      sessionId,
      title: input?.title,
      createdAt: now,
      updatedAt: now,
      messages: []
    });

    return { sessionId };
  }

  public async getLatestSession(): Promise<{ sessionId: string } | null> {
    const latest = [...this.sessions.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0];
    return latest ? { sessionId: latest.sessionId } : null;
  }

  public async sendMessage(input: { sessionId: string; role: "user"; content: string }): Promise<void> {
    const session = this.requireSession(input.sessionId);
    const now = Date.now();

    session.messages.push({
      role: input.role,
      content: input.content,
      createdAt: now
    });
    session.updatedAt = now;
  }

  public async generateAssistantResponse(input: { sessionId: string }): Promise<{ text: string; model?: string }> {
    const session = this.requireSession(input.sessionId);
    const latestUserMessage = [...session.messages].reverse().find((message) => message.role === "user");

    if (!latestUserMessage) {
      throw new AppError({
        code: ERROR_CODES.GENERATION_FAILED,
        message: "No user message available for generation.",
        phase: "generation",
        retryable: false,
        statusCode: 500
      });
    }

    const text = generateMockResponse(latestUserMessage.content);
    session.messages.push({
      role: "assistant",
      content: text,
      createdAt: Date.now()
    });
    session.updatedAt = Date.now();

    return {
      text,
      model: this.modelName
    };
  }

  public async getSessionWebUrl(input: { sessionId: string }): Promise<string | null> {
    this.requireSession(input.sessionId);
    return `${this.baseUrl}/chat?session=${encodeURIComponent(input.sessionId)}`;
  }

  private requireSession(sessionId: string): OpenClawSessionRecord {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new AppError({
        code: ERROR_CODES.OPENCLAW_UNAVAILABLE,
        message: `Unknown OpenClaw session ${sessionId}.`,
        phase: "generation",
        retryable: true,
        statusCode: 502,
        details: {
          session_id: sessionId
        }
      });
    }

    return session;
  }
}

function generateMockResponse(content: string): string {
  if (content.includes("Action: summarize")) {
    const selectedText = extractBlock(content, "SELECTED_TEXT");
    return summarizeText(selectedText);
  }

  if (content.includes("Action: explain")) {
    const selectedText = extractBlock(content, "SELECTED_TEXT");
    return explainText(selectedText);
  }

  if (content.includes("Action: rewrite")) {
    const selectedText = extractBlock(content, "SELECTED_TEXT");
    const mode = extractField(content, "Rewrite mode") ?? "rewrite";
    return rewriteText(selectedText, mode);
  }

  if (content.includes("Action: ask_claw")) {
    const userRequest = extractSection(content, "User request:");
    if (userRequest) {
      return ensureSentence(`Mock Ask Claw response: ${userRequest}`);
    }

    return "Mock Ask Claw response.";
  }

  return "Mock OpenClaw response.";
}

function extractBlock(content: string, label: string): string {
  const start = `BEGIN_${label}`;
  const end = `END_${label}`;
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return content.trim();
  }

  return content.slice(startIndex + start.length, endIndex).trim();
}

function extractField(content: string, label: string): string | null {
  const prefix = `${label}:`;
  const line = content
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix));

  if (!line) {
    return null;
  }

  return line.slice(prefix.length).trim();
}

function extractSection(content: string, label: string): string | null {
  const startIndex = content.indexOf(label);
  if (startIndex === -1) {
    return null;
  }

  return (
    content
      .slice(startIndex + label.length)
      .split("\n")
      .map((entry) => entry.trim())
      .find(Boolean) ?? null
  );
}

function summarizeText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return "No text was available to summarize.";
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 2) {
    return sentences.join(" ");
  }

  const summary = sentences.slice(0, 2).join(" ");
  return summary.length <= 320 ? summary : `${summary.slice(0, 317).trimEnd()}...`;
}

function rewriteText(text: string, mode: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return "No text was available to rewrite.";
  }

  switch (mode) {
    case "polish":
      return ensureSentence(normalized.replace(/\bi\b/g, "I"));
    case "shorten":
      return shortenText(normalized);
    case "expand":
      return `${ensureSentence(normalized)} This version adds a little more connective tissue and emphasis for clarity.`;
    case "formal":
      return ensureSentence(`Please note: ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`);
    case "friendly":
      return ensureSentence(`Here is a friendlier version: ${normalized}`);
    case "rewrite":
    default:
      return ensureSentence(normalized);
  }
}

function explainText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return "No text was available to explain.";
  }

  const looksLikeCodeOrConfig = /[={};]|export\s+[A-Z0-9_]+=|https?:\/\//i.test(normalized);
  if (looksLikeCodeOrConfig) {
    return ensureSentence(
      `This appears to be code or configuration. It is defining a concrete setting or instruction, and in practical terms it tells the system how to behave or where to connect.`
    );
  }

  return ensureSentence(
    `This appears to be prose. It is mainly communicating meaning directly, so the useful explanation is to clarify the main point and any implied intent rather than just shortening it.`
  );
}

function shortenText(text: string): string {
  const words = text.split(" ");
  const shortened = words.slice(0, Math.max(8, Math.ceil(words.length * 0.6))).join(" ");
  return `${shortened.trim()}...`;
}

function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}.`;
}
