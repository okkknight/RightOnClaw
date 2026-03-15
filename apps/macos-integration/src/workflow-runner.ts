import type { ActionResponse, ActionSelection, ActionSource, PromptPreset, SelectionCaptureMode, SelectionContext } from "@rightonclaw/types";

import { createAskClawPanelSession, promptForAskClawFallback, type AskClawPanelSession } from "./ask-claw-ui";
import { BridgeRequestError, postAction, streamAction } from "./bridge-client";
import { writeClipboardText } from "./clipboard";
import { captureFocusedSelection } from "./focused-selection";
import { createLoadingHud, type LoadingHudHandle } from "./loading-hud";
import { openUrl } from "./open";
import { showPopup } from "./popup";
import { buildSelectionContext } from "./selection-context";
import { buildManualSelection, buildPathSelection, buildTextSelection } from "./selection";
import { captureScreenshot } from "./screenshot";
import { createStreamingPopup } from "./streaming-popup";
import type { ActionFailure, WorkflowInvocation, WorkflowRunResult } from "./types";

class StructuredActionError extends Error {
  public readonly code?: string;
  public readonly retryable?: boolean;
  public readonly details?: Record<string, unknown> | null;
  public readonly response?: ActionResponse;

  public constructor(input: {
    message: string;
    code?: string;
    retryable?: boolean;
    details?: Record<string, unknown> | null;
    response?: ActionResponse;
  }) {
    super(input.message);
    this.name = "StructuredActionError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.details = input.details;
    this.response = input.response;
  }
}

const TRANSIENT_GENERATION_FAILURE_CODES = new Set([
  "OPENCLAW_UNAVAILABLE",
  "OPENCLAW_TIMEOUT",
  "GENERATION_FAILED"
]);

export interface WorkflowRunnerDependencies {
  postAction: typeof postAction;
  streamAction: typeof streamAction;
  writeClipboardText: typeof writeClipboardText;
  openUrl: typeof openUrl;
  showPopup: typeof showPopup;
  createAskClawPanelSession: typeof createAskClawPanelSession;
  promptForAskClawFallback: typeof promptForAskClawFallback;
  captureFocusedSelection: typeof captureFocusedSelection;
  buildSelectionContext: typeof buildSelectionContext;
  buildPathSelection: typeof buildPathSelection;
  buildTextSelection: typeof buildTextSelection;
  buildManualSelection: typeof buildManualSelection;
  captureScreenshot: typeof captureScreenshot;
  createLoadingHud: typeof createLoadingHud;
  createStreamingPopup: typeof createStreamingPopup;
}

export async function runWorkflow(
  invocation: WorkflowInvocation,
  rawInput: string,
  pathArgs: string[],
  overrides: Partial<WorkflowRunnerDependencies> = {}
): Promise<WorkflowRunResult> {
  const dependencies = resolveDependencies(overrides);
  let failure: ActionFailure | null = null;
  let workflowResult: WorkflowRunResult = {};

  try {
    const resolvedSelection = await resolveSelection(invocation.inputMode, rawInput, pathArgs, dependencies);
    const selectionContext = await dependencies.buildSelectionContext(resolvedSelection.selection, {
      captureMode: resolvedSelection.captureMode,
      sourceApp: resolvedSelection.source.app_name
    });

    if (invocation.action === "ask_claw") {
      workflowResult = await runAskClawFlow(
        resolvedSelection.selection,
        selectionContext,
        dependencies,
        resolvedSelection.source
      );
    } else {
      workflowResult = await runDirectActionFlow(
        invocation.action,
        resolvedSelection.selection,
        selectionContext,
        dependencies,
        resolvedSelection.source
      );
    }
  } catch (error) {
    failure = toActionFailure(error);
  }

  if (failure) {
    await showErrorPopupSafely(dependencies, failure);
  }

  return workflowResult;
}

async function resolveSelection(
  inputMode: WorkflowInvocation["inputMode"],
  rawInput: string,
  pathArgs: string[],
  dependencies: WorkflowRunnerDependencies
): Promise<{
  selection: ActionSelection;
  captureMode: SelectionCaptureMode;
  source: ActionSource;
}> {
  if (inputMode === "auto") {
    const captured = await dependencies.captureFocusedSelection();
    return {
      selection: captured.selection,
      captureMode: captured.captureMode,
      source: buildSource("hotkey", {
        appName: captured.sourceAppName,
        bundleId: captured.bundleId
      })
    };
  }

  if (inputMode === "manual") {
    return {
      selection: await dependencies.buildManualSelection(),
      captureMode: "manual",
      source: buildSource("context_menu")
    };
  }

  if (inputMode === "text") {
    const text = rawInput;
    if (text.length === 0) {
      throw new Error("No selected text was provided to the macOS helper.");
    }
    return {
      selection: await dependencies.buildTextSelection(text),
      captureMode: "selection",
      source: buildSource("context_menu")
    };
  }

  if (pathArgs.length === 0) {
    throw new Error("No selected files or folders were provided to the macOS helper.");
  }

  return {
    selection: await dependencies.buildPathSelection(pathArgs),
    captureMode: "finder",
    source: buildSource("context_menu")
  };
}

function buildOptions(
  action: WorkflowInvocation["action"],
  input: {
    promptPreset?: PromptPreset;
  } = {}
) {
  switch (action) {
    case "ask_claw":
      return {
        show_popup: true,
        session_strategy: "new" as const,
        prompt_preset: input.promptPreset ?? "freeform"
      };
    case "send_to_claw":
      return {
        open_webui: true,
        session_strategy: "new" as const,
        prompt_preset: input.promptPreset
      };
    case "summarize":
    case "explain":
      return {
        show_popup: true,
        session_strategy: "new" as const,
        prompt_preset: input.promptPreset
      };
    case "rewrite":
      return {
        show_popup: true,
        session_strategy: "new" as const,
        rewrite_mode: "rewrite" as const,
        prompt_preset: input.promptPreset
      };
  }
}

async function handleActionResponse(
  action: WorkflowInvocation["action"],
  response: ActionResponse,
  loadingHud: LoadingHudHandle,
  dependencies: WorkflowRunnerDependencies
): Promise<WorkflowRunResult> {
  if (response.status === "error" || !response.result) {
    throw toStructuredActionError(response, "Bridge request failed without a structured error.");
  }

  if (action === "send_to_claw") {
    await loadingHud.dismiss();
    return handleSendToClawResult(response.result, dependencies);
  }

  if (!response.result.content) {
    throw new StructuredActionError({
      message: `Bridge returned no content for ${action}.`
    });
  }

  if (action === "summarize" || action === "explain") {
    await loadingHud.dismiss();
    await dependencies.showPopup({
      title: response.result.title ?? (action === "explain" ? "Explanation" : "Summary"),
      body: response.result.content,
      kind: action === "explain" ? "explanation" : "summary",
      copyText: response.result.content,
      openUrl: response.result.webui_url ?? undefined
    });
    return {};
  }

  await loadingHud.dismiss();
  const popupAction = await dependencies.showPopup({
    title: response.result.title ?? "Rewrite",
    body: response.result.content,
    kind: "rewrite",
    copyText: response.result.content,
    openUrl: response.result.webui_url ?? undefined,
    allowReplaceSelection: true,
    detail:
      response.status === "partial"
        ? `The bridge generated the rewrite preview. ${response.error?.message ?? ""}`.trim()
        : "Review the rewritten text below. Choose Replace Selection to overwrite the current selection, or Copy to paste it manually."
  });

  if (popupAction === "replace_selection") {
    return {
      replacementText: response.result.content
    };
  }

  return {};
}

async function handleSendToClawResult(
  result: NonNullable<ActionResponse["result"]>,
  dependencies: WorkflowRunnerDependencies
): Promise<WorkflowRunResult> {
  if (!result.webui_url) {
    await dependencies.showPopup({
      title: "Sent to Claw",
      body:
        result.content ??
        "The message was sent to Claw, but RightOnClaw could not open a session URL automatically.",
      kind: "summary",
      detail: "OpenClaw accepted the request, but no WebUI URL was available for automatic opening."
    });
    return {};
  }

  try {
    await dependencies.openUrl(result.webui_url);
  } catch (error) {
    await dependencies.writeClipboardText(result.webui_url);
    await dependencies.showPopup({
      title: "Sent to Claw",
      body: "The message was sent to Claw, but the WebUI could not be opened automatically.",
      kind: "error",
      copyText: result.webui_url,
      openUrl: result.webui_url,
      detail: error instanceof Error ? error.message : "Unknown WebUI open failure.",
      clipboardNotice: "The session URL has been copied to your clipboard."
    });
  }

  return {};
}

function buildLoadingHudMessage(action: WorkflowInvocation["action"]): string {
  switch (action) {
    case "ask_claw":
      return "Asking Claw...";
    case "send_to_claw":
      return "Sending to Claw...";
    case "summarize":
      return "Summarizing...";
    case "rewrite":
      return "Rewriting...";
    case "explain":
      return "Explaining...";
  }
}

function resolveDependencies(overrides: Partial<WorkflowRunnerDependencies>): WorkflowRunnerDependencies {
  return {
    postAction: overrides.postAction ?? postAction,
    streamAction: overrides.streamAction ?? streamAction,
    writeClipboardText: overrides.writeClipboardText ?? writeClipboardText,
    openUrl: overrides.openUrl ?? openUrl,
    showPopup: overrides.showPopup ?? showPopup,
    createAskClawPanelSession: overrides.createAskClawPanelSession ?? createAskClawPanelSession,
    promptForAskClawFallback: overrides.promptForAskClawFallback ?? promptForAskClawFallback,
    captureFocusedSelection: overrides.captureFocusedSelection ?? captureFocusedSelection,
    buildSelectionContext: overrides.buildSelectionContext ?? buildSelectionContext,
    buildPathSelection: overrides.buildPathSelection ?? buildPathSelection,
    buildTextSelection: overrides.buildTextSelection ?? buildTextSelection,
    buildManualSelection: overrides.buildManualSelection ?? buildManualSelection,
    captureScreenshot: overrides.captureScreenshot ?? captureScreenshot,
    createLoadingHud: overrides.createLoadingHud ?? createLoadingHud,
    createStreamingPopup: overrides.createStreamingPopup ?? createStreamingPopup
  };
}

function toActionFailure(error: unknown): ActionFailure {
  if (error instanceof StructuredActionError || error instanceof BridgeRequestError) {
    return {
      response: error.response,
      code: error.code,
      retryable: error.retryable,
      message: error.message,
      details: error.details ?? null
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      detail: error.stack
    };
  }

  return {
    message: "Unknown macOS helper failure."
  };
}

async function showErrorPopupSafely(
  dependencies: WorkflowRunnerDependencies,
  failure: ActionFailure
): Promise<void> {
  try {
    const normalized = getUserFacingFailure(failure);
    await dependencies.showPopup({
      title: "RightOnClaw Error",
      body: normalized.message,
      detail: normalized.detail,
      kind: "error"
    });
  } catch (popupError) {
    const popupFailure = popupError instanceof Error ? popupError.message : String(popupError);
    console.log(`[RightOnClaw] Failed to show error popup: ${popupFailure}`);
    console.log(`[RightOnClaw] Original error: ${failure.message}`);
    if (failure.detail) {
      console.log(failure.detail);
    }
  }
}

export async function readStdIn(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function runScreenshotFlow(
  preset: PromptPreset = "freeform",
  overrides: Partial<WorkflowRunnerDependencies> = {}
): Promise<WorkflowRunResult> {
  const dependencies = resolveDependencies(overrides);
  let failure: ActionFailure | null = null;

  try {
    const capture = await dependencies.captureScreenshot();

    if (capture.status === "cancel") {
      return {};
    }

    if (capture.status === "error") {
      throw new Error(capture.message);
    }

    const selection = await dependencies.buildPathSelection([capture.path]);
    const selectionContext = await dependencies.buildSelectionContext(selection, {
      captureMode: "screenshot"
    });

    if (preset === "freeform") {
      return runAskClawFlow(selection, selectionContext, dependencies, buildSource("screenshot"));
    }

    if (preset === "send_to_claw") {
      return runDirectActionFlow("send_to_claw", selection, selectionContext, dependencies, buildSource("screenshot"), {
        promptPreset: "send_to_claw"
      });
    }

    return runDirectActionFlow(preset, selection, selectionContext, dependencies, buildSource("screenshot"), {
      promptPreset: preset
    });
  } catch (error) {
    failure = toActionFailure(error);
  }

  if (failure) {
    await showErrorPopupSafely(dependencies, failure);
  }

  return {};
}

async function runAskClawFlow(
  selection: Awaited<ReturnType<typeof buildTextSelection>> | Awaited<ReturnType<typeof buildPathSelection>> | Awaited<ReturnType<typeof buildManualSelection>>,
  selectionContext: SelectionContext,
  dependencies: WorkflowRunnerDependencies,
  source: ActionSource
): Promise<WorkflowRunResult> {
  const conversationHistory: Array<{
    prompt: string;
    response: string;
  }> = [];
  let panel: AskClawPanelSession;

  try {
    panel = await dependencies.createAskClawPanelSession({
      selectionContext
    });
  } catch {
    return runAskClawFallbackFlow(selection, selectionContext, dependencies, source);
  }

  try {
    for await (const event of panel.events()) {
      if (event.preset === "summarize" || event.preset === "explain") {
        const responseBody = await runAskPanelStreamingAction(
          {
            action: event.preset,
            title: event.preset === "explain" ? "Explanation" : "Summary",
            selection,
            selectionContext,
            source,
            prompt: event.prompt,
            options: buildOptions(event.preset, {
              promptPreset: event.preset
            })
          },
          panel,
          dependencies
        );
        recordConversationTurn(conversationHistory, event.prompt, responseBody);
        continue;
      }

      if (event.preset === "send_to_claw") {
        const responseBody = await runAskPanelSendToClawAction(
          {
            selection,
            selectionContext,
            source,
            prompt: event.prompt,
            options: buildOptions("send_to_claw", {
              promptPreset: "send_to_claw"
            })
          },
          panel,
          dependencies
        );
        recordConversationTurn(conversationHistory, event.prompt, responseBody);
        continue;
      }

      const responseBody = await runAskPanelStreamingAction(
        {
          action: "ask_claw",
          title: "Ask Claw",
          selection,
          selectionContext,
          source,
          prompt: event.prompt,
          requestPrompt: buildConversationAwarePrompt(conversationHistory, event.prompt),
          options: buildOptions("ask_claw", {
            promptPreset: "freeform"
          })
        },
        panel,
        dependencies
      );
      recordConversationTurn(conversationHistory, event.prompt, responseBody);
    }
  } finally {
    await panel.close();
  }

  return {};
}

async function runDirectActionFlow(
  action: Exclude<WorkflowInvocation["action"], "ask_claw">,
  selection: Awaited<ReturnType<typeof buildTextSelection>> | Awaited<ReturnType<typeof buildPathSelection>> | Awaited<ReturnType<typeof buildManualSelection>>,
  selectionContext: SelectionContext,
  dependencies: WorkflowRunnerDependencies,
  source: ActionSource,
  input: {
    promptPreset?: PromptPreset;
  } = {}
): Promise<WorkflowRunResult> {
  if (action === "summarize" || action === "explain") {
    return runStreamingTextAction(
      {
        action,
        title: action === "explain" ? "Explanation" : "Summary",
        kind: action === "explain" ? "explanation" : "summary",
        selection,
        selectionContext,
        source,
        options: buildOptions(action, {
          promptPreset: input.promptPreset ?? action
        })
      },
      dependencies
    );
  }

  const loadingHud = dependencies.createLoadingHud(buildLoadingHudMessage(action));

  try {
    const response = await dependencies.postAction({
      action,
      source,
      selection,
      selection_context: selectionContext,
      options: buildOptions(action, {
        promptPreset: input.promptPreset
      })
    });

    return await handleActionResponse(action, response, loadingHud, dependencies);
  } finally {
    await loadingHud.dismiss();
  }
}

async function runAskPanelStreamingAction(
  input: {
    action: "ask_claw" | "summarize" | "explain";
    title: string;
    selection: Awaited<ReturnType<typeof buildTextSelection>> | Awaited<ReturnType<typeof buildPathSelection>> | Awaited<ReturnType<typeof buildManualSelection>>;
    selectionContext: SelectionContext;
    source: ActionSource;
    prompt?: string;
    requestPrompt?: string;
    options: ReturnType<typeof buildOptions>;
  },
  panel: AskClawPanelSession,
  dependencies: WorkflowRunnerDependencies
): Promise<string | null> {
  let streamedContent = "";
  await panel.setStatus("running");

  try {
    for await (const event of dependencies.streamAction({
      action: input.action,
      source: input.source,
      selection: input.selection,
      selection_context: input.selectionContext,
      prompt: input.requestPrompt ?? input.prompt,
      options: input.options,
      stream: true
    })) {
      if (event.type === "delta") {
        if (event.delta_kind === "content") {
          streamedContent += event.delta ?? "";
          await panel.updateAssistantMessage({
            body: streamedContent
          });
        }
        continue;
      }

      if (event.type === "error") {
        await handleAskPanelFailure(
          input,
          panel,
          toStructuredStreamError(event, "The bridge reported a streaming error.")
        );
        return null;
      }

      if (event.type === "complete") {
        const result = event.result;
        if (!result?.content) {
          await panel.completeAssistantMessage({
            body: `Bridge returned no content for ${input.action}.`,
            tone: "error"
          });
          await panel.setStatus("error");
          return null;
        }

        await panel.completeAssistantMessage({
          body: result.content,
          copyText: result.content,
          openUrl: result.webui_url ?? undefined
        });
        await panel.setStatus("ready");
        return result.content;
      }
    }
  } catch (error) {
    try {
      const response = await dependencies.postAction({
        action: input.action,
        source: input.source,
        selection: input.selection,
        selection_context: input.selectionContext,
        prompt: input.requestPrompt ?? input.prompt,
        options: input.options
      });

      if (response.status === "error" || !response.result?.content) {
        await handleAskPanelFailure(
          input,
          panel,
          error instanceof BridgeRequestError
            ? error
            : toStructuredActionError(response, "Bridge request failed without a structured error.")
        );
        return null;
      }

      await panel.completeAssistantMessage({
        body: response.result.content,
        copyText: response.result.content,
        openUrl: response.result.webui_url ?? undefined
      });
      await panel.setStatus("ready");
      return response.result.content;
    } catch (fallbackError) {
      await handleAskPanelFailure(
        input,
        panel,
        fallbackError instanceof BridgeRequestError
          ? fallbackError
          : error instanceof BridgeRequestError
            ? error
            : new StructuredActionError({
                message: fallbackError instanceof Error ? fallbackError.message : "Streaming failed."
              })
      );
      return null;
    }
  }

  await panel.completeAssistantMessage({
    body: "Streaming ended before the bridge returned a final result.",
    tone: "error"
  });
  await panel.setStatus("error");
  return null;
}

async function runAskPanelSendToClawAction(
  input: {
    selection: Awaited<ReturnType<typeof buildTextSelection>> | Awaited<ReturnType<typeof buildPathSelection>> | Awaited<ReturnType<typeof buildManualSelection>>;
    selectionContext: SelectionContext;
    source: ActionSource;
    prompt?: string;
    options: ReturnType<typeof buildOptions>;
  },
  panel: AskClawPanelSession,
  dependencies: WorkflowRunnerDependencies
): Promise<string | null> {
  await panel.setStatus("running");

  try {
    const response = await dependencies.postAction({
      action: "send_to_claw",
      source: input.source,
      selection: input.selection,
      selection_context: input.selectionContext,
      options: input.options
    });

    if (response.status === "error" || !response.result) {
      await handleAskPanelFailure(
        {
          action: "send_to_claw",
          title: "Ask Claw",
          selection: input.selection,
          selectionContext: input.selectionContext,
          source: input.source,
          prompt: input.prompt,
          options: buildOptions("send_to_claw", {
            promptPreset: "send_to_claw"
          })
        },
        panel,
        toStructuredActionError(response, "Bridge request failed without a structured error.")
      );
      return null;
    }

    const result = response.result;
    if (result.webui_url) {
      try {
        await dependencies.openUrl(result.webui_url);
        const message = "Sent to Claw. Opening the OpenClaw session now.";
        await panel.completeAssistantMessage({
          body: message,
          copyText: result.webui_url,
          openUrl: result.webui_url
        });
        await panel.setStatus("ready");
        return message;
      } catch (error) {
        const message =
          "Sent to Claw, but the session URL could not be opened automatically. The URL has been copied to your clipboard.";
        await dependencies.writeClipboardText(result.webui_url);
        await panel.completeAssistantMessage({
          body: message,
          copyText: result.webui_url,
          openUrl: result.webui_url,
          tone: "error"
        });
        await panel.setStatus("ready");
        return message;
      }
    }

    const message =
      result.content ??
      "The message was sent to Claw, but RightOnClaw could not build a session URL automatically.";
    await panel.completeAssistantMessage({
      body: message
    });
    await panel.setStatus("ready");
    return message;
  } catch (error) {
    await handleAskPanelFailure(
      {
        action: "send_to_claw",
        title: "Ask Claw",
        selection: input.selection,
        selectionContext: input.selectionContext,
        source: input.source,
        prompt: input.prompt,
        options: buildOptions("send_to_claw", {
          promptPreset: "send_to_claw"
        })
      },
      panel,
      error instanceof BridgeRequestError
        ? error
        : new StructuredActionError({
            message: error instanceof Error ? error.message : "Send to Claw failed."
          })
    );
    return null;
  }
}

async function runAskClawFallbackFlow(
  selection: Awaited<ReturnType<typeof buildTextSelection>> | Awaited<ReturnType<typeof buildPathSelection>> | Awaited<ReturnType<typeof buildManualSelection>>,
  selectionContext: SelectionContext,
  dependencies: WorkflowRunnerDependencies,
  source: ActionSource
): Promise<WorkflowRunResult> {
  const promptResult = await dependencies.promptForAskClawFallback({
    selectionContext
  });

  if (promptResult.outcome !== "submit" || !promptResult.prompt?.trim()) {
    return {};
  }

  return runStreamingTextAction(
    {
      action: "ask_claw",
      title: "Ask Claw",
      kind: "summary",
      selection,
      selectionContext,
      source,
      prompt: promptResult.prompt.trim(),
      options: buildOptions("ask_claw", {
        promptPreset: promptResult.preset
      })
    },
    dependencies
  );
}

async function handleAskPanelFailure(
  input: {
    action: "ask_claw" | "summarize" | "explain" | "send_to_claw";
    title: string;
    selection: Awaited<ReturnType<typeof buildTextSelection>> | Awaited<ReturnType<typeof buildPathSelection>> | Awaited<ReturnType<typeof buildManualSelection>>;
    selectionContext: SelectionContext;
    source: ActionSource;
    prompt?: string;
    options: ReturnType<typeof buildOptions>;
  },
  panel: AskClawPanelSession,
  error: StructuredActionError | BridgeRequestError
): Promise<void> {
  if (input.action === "ask_claw" && shouldFallbackAskClawToManualHandoff(error)) {
    const userFacing = getUserFacingFailure(toActionFailure(error));
    await panel.completeAssistantMessage({
      body: userFacing.message,
      tone: "error",
      copyText: buildAskClawManualHandoffText(input.selectionContext, input.prompt)
    });
    await panel.setStatus("error");
    return;
  }

  const userFacing = getUserFacingFailure(toActionFailure(error));
  const body = [userFacing.message, userFacing.detail].filter(Boolean).join("\n\n");
  await panel.completeAssistantMessage({
    body,
    tone: "error"
  });
  await panel.setStatus("error");
}

async function runStreamingTextAction(
  input: {
    action: "ask_claw" | "summarize" | "explain";
    title: string;
    kind: "summary" | "explanation";
    selection: Awaited<ReturnType<typeof buildTextSelection>> | Awaited<ReturnType<typeof buildPathSelection>> | Awaited<ReturnType<typeof buildManualSelection>>;
    selectionContext: SelectionContext;
    source: ActionSource;
    prompt?: string;
    options: ReturnType<typeof buildOptions>;
  },
  dependencies: WorkflowRunnerDependencies
): Promise<WorkflowRunResult> {
  const popup = await dependencies.createStreamingPopup({
    title: input.title,
    kind: input.kind,
    detail: "Preparing request..."
  });
  let streamedContent = "";

  await popup.update({
    body: buildStreamingPlaceholder(input.action, input.selectionContext),
    detail: "Preparing request..."
  });

  try {
    for await (const event of dependencies.streamAction({
      action: input.action,
      source: input.source,
      selection: input.selection,
      selection_context: input.selectionContext,
      prompt: input.prompt,
      options: input.options,
      stream: true
    })) {
      if (event.type === "delta") {
        if (event.delta_kind === "content") {
          streamedContent += event.delta ?? "";
          await popup.update({
            body: streamedContent,
            copyText: streamedContent,
            detail: "Streaming response..."
          });
          continue;
        }

        await popup.update({
          body: streamedContent || event.delta || buildStreamingPlaceholder(input.action, input.selectionContext),
          detail: event.delta ?? "Generating response..."
        });
        continue;
      }

      if (event.type === "error") {
        return handleStreamingFailure(
          input,
          popup,
          dependencies,
          toStructuredStreamError(event, "The bridge reported a streaming error.")
        );
      }

      if (event.type === "complete") {
        const result = event.result;
        if (!result?.content) {
          await popup.fail(`Bridge returned no content for ${input.action}.`);
          await popup.waitForClose();
          return {};
        }

        await popup.complete({
          title: result.title ?? input.title,
          body: result.content,
          copyText: result.content,
          openUrl: result.webui_url ?? undefined,
          detail: undefined
        });
        await popup.waitForClose();
        return {};
      }
    }
  } catch (error) {
    await popup.update({
      body: streamedContent || buildStreamingPlaceholder(input.action, input.selectionContext),
      detail: "Streaming is unavailable. Showing the final result when ready."
    });

    const response = await dependencies.postAction({
      action: input.action,
      source: input.source,
      selection: input.selection,
      selection_context: input.selectionContext,
      prompt: input.prompt,
      options: input.options
    });

    if (response.status === "error" || !response.result?.content) {
      return handleStreamingFailure(
        input,
        popup,
        dependencies,
        error instanceof BridgeRequestError
          ? error
          : toStructuredActionError(response, "Bridge request failed without a structured error.")
      );
    }

    await popup.complete({
      title: response.result.title ?? input.title,
      body: response.result.content,
      copyText: response.result.content,
      openUrl: response.result.webui_url ?? undefined,
      detail: undefined
    });
    await popup.waitForClose();
    return {};
  }

  await popup.fail("Streaming ended before the bridge returned a final result.");
  await popup.waitForClose();
  return {};
}

async function handleStreamingFailure(
  input: {
    action: "ask_claw" | "summarize" | "explain";
    title: string;
    kind: "summary" | "explanation";
    selection: Awaited<ReturnType<typeof buildTextSelection>> | Awaited<ReturnType<typeof buildPathSelection>> | Awaited<ReturnType<typeof buildManualSelection>>;
    selectionContext: SelectionContext;
    source: ActionSource;
    prompt?: string;
    options: ReturnType<typeof buildOptions>;
  },
  popup: Awaited<ReturnType<typeof createStreamingPopup>>,
  _dependencies: WorkflowRunnerDependencies,
  error: StructuredActionError | BridgeRequestError
): Promise<WorkflowRunResult> {
  if (input.action === "ask_claw" && shouldFallbackAskClawToManualHandoff(error)) {
    return fallbackAskClawToManualHandoff(input, popup, error);
  }

  const userFacing = getUserFacingFailure(toActionFailure(error));
  await popup.fail(userFacing.message, userFacing.detail);
  await popup.waitForClose();
  return {};
}

async function fallbackAskClawToManualHandoff(
  input: {
    action: "ask_claw" | "summarize" | "explain";
    title: string;
    kind: "summary" | "explanation";
    selectionContext: SelectionContext;
    prompt?: string;
  },
  popup: Awaited<ReturnType<typeof createStreamingPopup>>,
  error: StructuredActionError | BridgeRequestError
): Promise<WorkflowRunResult> {
  const userFacing = getUserFacingFailure(toActionFailure(error));
  const handoffText = buildAskClawManualHandoffText(input.selectionContext, input.prompt);

  await popup.complete({
    title: input.title,
    body: userFacing.message,
    copyText: handoffText,
    detail: [userFacing.detail, "Use Copy, then paste this into Claw manually."].filter(Boolean).join(" ")
  });
  await popup.waitForClose();
  return {};
}

function shouldFallbackAskClawToManualHandoff(error: StructuredActionError | BridgeRequestError): boolean {
  return Boolean(error.code && TRANSIENT_GENERATION_FAILURE_CODES.has(error.code));
}

function buildAskClawManualHandoffText(selectionContext: SelectionContext, prompt?: string): string {
  const lines = [
    "RightOnClaw Ask Claw handoff",
    `Selection: ${selectionContext.summary ?? "No captured selection summary."}`
  ];

  if (selectionContext.source_app) {
    lines.push(`Source app: ${selectionContext.source_app}`);
  }

  if (selectionContext.text?.value) {
    lines.push("");
    lines.push("Selected text:");
    lines.push(selectionContext.text.value);
  } else if ((selectionContext.items ?? []).length > 0) {
    lines.push("");
    lines.push("Selected items:");
    for (const item of selectionContext.items ?? []) {
      lines.push(`- ${item.name ?? item.path ?? item.item_kind}`);
    }
  }

  if (prompt?.trim()) {
    lines.push("");
    lines.push("User request:");
    lines.push(prompt.trim());
  }

  return lines.join("\n");
}

function buildStreamingPlaceholder(action: "ask_claw" | "summarize" | "explain", selectionContext: SelectionContext): string {
  const selectionSummary = selectionContext.summary ?? "your selection";

  switch (action) {
    case "ask_claw":
      return `Preparing Claw with ${selectionSummary}...`;
    case "explain":
      return `Preparing an explanation for ${selectionSummary}...`;
    case "summarize":
    default:
      return `Preparing a summary for ${selectionSummary}...`;
  }
}

function recordConversationTurn(
  history: Array<{
    prompt: string;
    response: string;
  }>,
  prompt: string | undefined,
  response: string | null
): void {
  const normalizedPrompt = prompt?.trim();
  const normalizedResponse = response?.trim();

  if (!normalizedPrompt || !normalizedResponse) {
    return;
  }

  history.push({
    prompt: normalizedPrompt,
    response: normalizedResponse
  });
}

function buildConversationAwarePrompt(
  history: Array<{
    prompt: string;
    response: string;
  }>,
  prompt: string
): string {
  const normalizedPrompt = prompt.trim();
  if (history.length === 0) {
    return normalizedPrompt;
  }

  const historyLines = history.slice(-4).flatMap((turn) => [
    "User:",
    truncateConversationSegment(turn.prompt),
    "Claw:",
    truncateConversationSegment(turn.response)
  ]);

  return [
    "Continue the conversation using the previous turns as context when helpful.",
    "Previous conversation:",
    ...historyLines,
    "",
    "Latest user request:",
    normalizedPrompt
  ].join("\n");
}

function truncateConversationSegment(input: string, maxChars = 700): string {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars - 3).trimEnd()}...`;
}

function toStructuredActionError(response: ActionResponse, fallbackMessage: string): StructuredActionError {
  return new StructuredActionError({
    message: response.error?.message ?? fallbackMessage,
    code: response.error?.code,
    retryable: response.error?.retryable,
    details:
      response.error?.details && typeof response.error.details === "object"
        ? (response.error.details as Record<string, unknown>)
        : null,
    response
  });
}

function toStructuredStreamError(
  event: {
    error_code?: string;
    message?: string;
    retryable?: boolean;
    details?: Record<string, unknown> | null;
  },
  fallbackMessage: string
): StructuredActionError {
  return new StructuredActionError({
    message: event.message ?? fallbackMessage,
    code: event.error_code,
    retryable: event.retryable,
    details: event.details ?? null
  });
}

function getUserFacingFailure(failure: ActionFailure): {
  message: string;
  detail?: string;
} {
  const isInternalGenerationFailure =
    (failure.code === "OPENCLAW_UNAVAILABLE" || failure.code === "GENERATION_FAILED" || failure.code === "OPENCLAW_TIMEOUT") &&
    (/internal error/i.test(failure.message) ||
      typeof failure.details?.upstream_status === "number");

  if (isInternalGenerationFailure) {
    return {
      message: "Claw could not generate a response right now.",
      detail: "Open the OpenClaw app and check authentication or model access, then try again."
    };
  }

  if (failure.code === "OPENCLAW_TIMEOUT") {
    return {
      message: "Claw took too long to respond.",
      detail: "Try again in a moment, or continue in the OpenClaw app."
    };
  }

  return {
    message: failure.message,
    detail: isLikelyStackTrace(failure.detail) ? undefined : failure.detail
  };
}

function isLikelyStackTrace(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return value.includes("\n    at ");
}

function buildSource(
  entry: "context_menu" | "screenshot" | "hotkey",
  input: {
    appName?: string;
    bundleId?: string;
  } = {}
): ActionSource {
  return {
    platform: "macos",
    entry,
    app_name: input.appName,
    bundle_id: input.bundleId
  };
}
