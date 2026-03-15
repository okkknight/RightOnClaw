import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import * as readline from "node:readline";

import type { PromptPreset, SelectionContext } from "@rightonclaw/types";

import type { AskClawDialogResult } from "./types";
import { getRuntimeTmpDir } from "./paths";
import { escapeAppleScriptString, runAppleScript } from "./apple-script";
import { buildSelectionDisplay } from "./selection-context";

export interface AskClawPanelInput {
  selectionContext: SelectionContext;
  initialPrompt?: string;
}

export interface AskClawPanelSuggestion {
  title: string;
  prompt: string;
  preset: PromptPreset;
}

export interface AskClawPanelPayload {
  title: string;
  summary: string;
  detail: string;
  initialPrompt: string;
  previewImagePath?: string;
  suggestions: AskClawPanelSuggestion[];
}

export interface AskClawPanelSessionEvent {
  type: "submit";
  prompt: string;
  preset: PromptPreset;
}

export interface AskClawPanelSession {
  events(): AsyncGenerator<AskClawPanelSessionEvent>;
  setStatus(state: "ready" | "running" | "error"): Promise<void>;
  updateAssistantMessage(input: {
    body: string;
    tone?: "normal" | "error";
  }): Promise<void>;
  completeAssistantMessage(input: {
    body: string;
    tone?: "normal" | "error";
    copyText?: string;
    openUrl?: string;
  }): Promise<void>;
  close(): Promise<void>;
}

interface AskClawPanelProcessEvent {
  type?: string;
  prompt?: string;
  preset?: PromptPreset;
}

class AsyncEventQueue<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (error: Error) => void;
  }> = [];
  private closed = false;
  private failure: Error | null = null;

  public push(value: T): void {
    if (this.closed) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
      return;
    }

    this.values.push(value);
  }

  public close(): void {
    if (this.closed || this.failure) {
      return;
    }

    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.resolve({ value: undefined, done: true });
    }
  }

  public fail(error: Error): void {
    if (this.closed || this.failure) {
      return;
    }

    this.failure = error;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(error);
    }
  }

  public async next(): Promise<IteratorResult<T>> {
    if (this.values.length > 0) {
      const value = this.values.shift() as T;
      return { value, done: false };
    }

    if (this.closed) {
      return { value: undefined, done: true };
    }

    if (this.failure) {
      throw this.failure;
    }

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiters.push({
        resolve,
        reject
      });
    });
  }

  public async *iterate(): AsyncGenerator<T> {
    while (true) {
      const next = await this.next();
      if (next.done) {
        return;
      }

      yield next.value;
    }
  }
}

export async function createAskClawPanelSession(input: AskClawPanelInput): Promise<AskClawPanelSession> {
  if (process.env.RIGHTONCLAW_DISABLE_ASK_PANEL === "1") {
    throw new Error("Ask Claw panel is disabled.");
  }

  const payload = buildAskClawPanelPayload(input);
  await fs.mkdir(getRuntimeTmpDir(), { recursive: true });
  const payloadPath = path.join(getRuntimeTmpDir(), `ask-claw-${Date.now()}.json`);
  await fs.writeFile(payloadPath, JSON.stringify(payload), "utf8");

  const askPanelBinary = path.join(__dirname, "bin", "rightonclaw-ask-panel");
  const child = spawn(askPanelBinary, ["--payload", payloadPath], {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const queue = new AsyncEventQueue<AskClawPanelSessionEvent>();
  let closed = false;
  let closedByUi = false;
  let startupError: Error | null = null;
  let stderrBuffer = "";
  let spawned = false;

  const exitPromise = new Promise<void>((resolve) => {
    child.once("exit", async (code, signal) => {
      closed = true;
      const trimmedStderr = stderrBuffer.trim();
      if (!closedByUi) {
        startupError = new Error(
          trimmedStderr || `Ask Claw panel exited unexpectedly${code !== null ? ` with code ${code}` : signal ? ` with signal ${signal}` : "."}`
        );
        queue.fail(startupError);
      } else {
        queue.close();
      }

      try {
        await fs.rm(payloadPath, { force: true });
      } finally {
        resolve();
      }
    });
  });

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      const parsed = JSON.parse(trimmed) as AskClawPanelProcessEvent;
      if (parsed.type === "submit" && parsed.prompt) {
        queue.push({
          type: "submit",
          prompt: parsed.prompt,
          preset: parsed.preset ?? "freeform"
        });
        return;
      }

      if (parsed.type === "closed") {
        closedByUi = true;
        queue.close();
      }
    } catch {
      // Ignore malformed UI events; stderr remains available for debugging.
    }
  });

  child.stderr.on("data", (chunk: Buffer | string) => {
    stderrBuffer += chunk.toString();
    if (stderrBuffer.length > 8_000) {
      stderrBuffer = stderrBuffer.slice(-8_000);
    }
  });

  await new Promise<void>((resolve, reject) => {
    child.once("spawn", () => {
      spawned = true;
      resolve();
    });
    child.once("error", reject);
    child.once("exit", () => {
      if (!spawned) {
        reject(startupError ?? new Error("Ask Claw panel exited before startup completed."));
      }
    });
  });

  if (startupError) {
    throw startupError;
  }

  const sendCommand = async (command: Record<string, unknown>): Promise<void> => {
    if (closed || !child.stdin.writable) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      child.stdin.write(`${JSON.stringify(command)}\n`, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  };

  return {
    events() {
      return queue.iterate();
    },
    async setStatus(state) {
      await sendCommand({
        type: "status",
        state
      });
    },
    async updateAssistantMessage(input) {
      await sendCommand({
        type: "assistant_update",
        body: input.body,
        tone: input.tone
      });
    },
    async completeAssistantMessage(input) {
      await sendCommand({
        type: "assistant_complete",
        body: input.body,
        tone: input.tone,
        copyText: input.copyText,
        openUrl: input.openUrl
      });
    },
    async close() {
      if (!closed) {
        closed = true;
        closedByUi = true;
        rl.close();
        child.stdin.end();
        if (!child.killed) {
          child.kill("SIGTERM");
        }
      }

      await exitPromise;
    }
  };
}

export function buildAskClawPanelPayload(input: AskClawPanelInput): AskClawPanelPayload {
  const display = buildSelectionDisplay(input.selectionContext);
  const previewImagePath = resolvePreviewImagePath(input.selectionContext);

  return {
    title: "Ask Claw",
    summary: display.summary,
    detail: display.detail,
    initialPrompt: input.initialPrompt ?? "",
    previewImagePath: previewImagePath ?? undefined,
    suggestions: buildSuggestions(input.selectionContext, display)
  };
}

export async function promptForAskClawFallback(input: AskClawPanelInput): Promise<AskClawDialogResult> {
  const payload = buildAskClawPanelPayload(input);
  const message = buildAskClawFallbackMessage(payload);
  const script = `
set dialogResult to display dialog "${escapeAppleScriptString(message)}" default answer "${escapeAppleScriptString(payload.initialPrompt)}" buttons {"Cancel", "Run"} default button "Run" cancel button "Cancel" with title "${escapeAppleScriptString(payload.title)}"
return text returned of dialogResult
`;

  try {
    const prompt = await runAppleScript(script);
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      return {
        outcome: "cancel",
        preset: "freeform"
      };
    }

    return {
      outcome: "submit",
      preset: "freeform",
      prompt: normalizedPrompt
    };
  } catch {
    return {
      outcome: "cancel",
      preset: "freeform"
    };
  }
}

function resolvePreviewImagePath(context: SelectionContext): string | null {
  if (context.kind !== "screenshot" && context.kind !== "image") {
    return null;
  }

  const imageItem = (context.items ?? []).find((item) => item.item_kind === "image" && item.path);
  return imageItem?.path ?? null;
}

function buildSuggestions(
  selectionContext: SelectionContext,
  display: {
    summary: string;
    detail: string;
  }
): AskClawPanelSuggestion[] {
  if (selectionContext.kind === "screenshot") {
    return [
      {
        title: "Describe what is happening in this screenshot",
        prompt: "Describe what is happening in this screenshot.",
        preset: "freeform"
      },
      {
        title: "Explain the important visual details",
        prompt: "Explain the important visual details in this screenshot.",
        preset: "explain"
      },
      {
        title: "Extract the key information",
        prompt: "Extract the key information from this screenshot.",
        preset: "freeform"
      }
    ];
  }

  if (selectionContext.kind === "folder") {
    return [
      {
        title: "Summarize what is in this folder",
        prompt: "Summarize what is in this folder.",
        preset: "summarize"
      },
      {
        title: "Explain which files matter most",
        prompt: "Explain which files in this folder matter most and why.",
        preset: "explain"
      },
      {
        title: "Suggest how I should explore it",
        prompt: "Suggest how I should explore this folder efficiently.",
        preset: "freeform"
      }
    ];
  }

  if (selectionContext.kind === "text") {
    return [
      {
        title: "Summarize this selection",
        prompt: "Summarize this selection.",
        preset: "summarize"
      },
      {
        title: "Explain the key ideas",
        prompt: "Explain the key ideas in this selection.",
        preset: "explain"
      },
      {
        title: "Extract action items",
        prompt: "Extract the action items from this selection.",
        preset: "freeform"
      }
    ];
  }

  if (selectionContext.kind === "mixed" && (selectionContext.items ?? []).length === 0) {
    return [
      {
        title: "Help me think through an idea",
        prompt: "Help me think through an idea.",
        preset: "freeform"
      },
      {
        title: "Draft a better prompt for me",
        prompt: "Draft a better prompt for me.",
        preset: "freeform"
      },
      {
        title: "Help me get unstuck",
        prompt: "Help me get unstuck on a problem.",
        preset: "freeform"
      }
    ];
  }

  const contextLabel = normalizeContextLabel(selectionContext, display);
  const fileName = normalizeFileName(selectionContext);

  if (selectionContext.kind === "file" && looksLikeConfigName(selectionContext)) {
    return [
      {
        title: "Summarize this config",
        prompt: `Summarize the purpose of ${fileName ?? "this config"}.`,
        preset: "summarize"
      },
      {
        title: "Explain the key settings",
        prompt: "Explain the key settings in this config file.",
        preset: "explain"
      },
      {
        title: "What should I pay attention to?",
        prompt: "What should I pay attention to in this config file?",
        preset: "freeform"
      }
    ];
  }

  return [
    {
      title: `Summarize ${contextLabel}`,
      prompt: `Summarize ${contextLabel}.`,
      preset: "summarize"
    },
    {
      title: buildExplainSuggestionTitle(selectionContext, contextLabel),
      prompt: buildExplainSuggestionPrompt(selectionContext, contextLabel),
      preset: "explain"
    },
    {
      title: looksLikeTaskLikeDocument(selectionContext) ? "Extract action items" : `Find the key points in ${contextLabel}`,
      prompt: looksLikeTaskLikeDocument(selectionContext)
        ? `Extract the action items from ${contextLabel}.`
        : `Find the key points in ${contextLabel}.`,
      preset: "freeform"
    }
  ];
}

function normalizeContextLabel(
  selectionContext: SelectionContext,
  display: {
    summary: string;
    detail: string;
  }
): string {
  if (selectionContext.kind === "screenshot") {
    return "this screenshot";
  }

  if (selectionContext.kind === "image") {
    return "this image";
  }

  if (selectionContext.kind === "folder") {
    return "this folder";
  }

  if (selectionContext.kind === "file") {
    return "this file";
  }

  if (selectionContext.kind === "text") {
    return "this selection";
  }

  const detail = display.detail.trim();
  if (detail) {
    return detail.length > 48 ? "this selection" : `"${detail}"`;
  }

  return "this selection";
}

function buildExplainSuggestionTitle(selectionContext: SelectionContext, contextLabel: string): string {
  if (selectionContext.kind === "file" && looksLikeConfigName(selectionContext)) {
    return "Explain what this config does";
  }

  return `Explain ${contextLabel}`;
}

function buildExplainSuggestionPrompt(selectionContext: SelectionContext, contextLabel: string): string {
  if (selectionContext.kind === "file" && looksLikeConfigName(selectionContext)) {
    return "Explain what this config does.";
  }

  return `Explain ${contextLabel}.`;
}

function looksLikeConfigName(selectionContext: SelectionContext): boolean {
  return (selectionContext.items ?? []).some((item) => {
    const name = (item.name ?? item.path ?? "").toLowerCase();
    return (
      name.endsWith(".json") ||
      name.endsWith(".yaml") ||
      name.endsWith(".yml") ||
      name.endsWith(".toml") ||
      name.endsWith(".ini") ||
      name.includes("config")
    );
  });
}

function looksLikeTaskLikeDocument(selectionContext: SelectionContext): boolean {
  return (selectionContext.items ?? []).some((item) => {
    const name = (item.name ?? item.path ?? "").toLowerCase();
    return (
      name.endsWith(".md") ||
      name.endsWith(".txt") ||
      name.endsWith(".doc") ||
      name.endsWith(".docx") ||
      name.includes("plan") ||
      name.includes("spec") ||
      name.includes("notes") ||
      name.includes("todo")
    );
  });
}

function normalizeFileName(selectionContext: SelectionContext): string | null {
  const firstItem = (selectionContext.items ?? []).find((item) => item.name || item.path);
  if (!firstItem) {
    return null;
  }

  return firstItem.name?.trim() || firstItem.path?.split("/").pop() || null;
}

function buildAskClawFallbackMessage(payload: AskClawPanelPayload): string {
  const sections = [payload.summary];

  if (payload.detail.trim()) {
    sections.push(payload.detail.trim());
  }

  sections.push("Ask anything about this selection.");
  return sections.join("\n\n");
}
