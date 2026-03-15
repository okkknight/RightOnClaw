import { randomUUID } from "node:crypto";

import { loadBridgeConfig, normalizeError } from "../packages/core/src/index.ts";
import {
  ApiKeyCredentialProvider,
  CredentialResolutionError,
  CredentialProviderRegistry,
  SharedCredentialProvider
} from "../packages/credential-layer/src/index.ts";
import {
  ActionRuntime,
  BuiltInExperimentalActionDefinitionResolver,
  ExecutorRegistry,
  HttpModelClient,
  ModelExecutor,
  OpenClawExecutor,
  type ExperimentalActionName,
  type ModelClient,
  type ModelClientGenerateInput,
  type ModelClientGenerateResult
} from "../packages/action-runtime/src/index.ts";
import type { ActionRequest, ActionResult } from "../packages/types/src/index.ts";

const SUPPORTED_ACTIONS: ExperimentalActionName[] = ["explain_fast", "summarize_fast"];
const DEFAULT_ACTION: ExperimentalActionName = "explain_fast";

class RecordingModelClient implements ModelClient {
  public called = false;
  public lastInput?: ModelClientGenerateInput;

  public constructor(private readonly delegate: ModelClient) {}

  public async generateText(input: ModelClientGenerateInput): Promise<ModelClientGenerateResult> {
    this.called = true;
    this.lastInput = input;
    return this.delegate.generateText(input);
  }
}

async function main(): Promise<void> {
  const action = parseExperimentalAction(readActionArg(process.argv.slice(2)));
  const definitionResolver = new BuiltInExperimentalActionDefinitionResolver();
  const definition = definitionResolver.resolve(action);
  const config = loadBridgeConfig();
  const credentialRegistry = new CredentialProviderRegistry([
    new SharedCredentialProvider({
      env: process.env
    }),
    new ApiKeyCredentialProvider({
      env: process.env
    })
  ]);
  const modelClient = new RecordingModelClient(
    new HttpModelClient({
      requestTimeoutMs: config.requestTimeoutMs,
      responsesPath: config.openClawResponsesPath
    })
  );
  const runtime = new ActionRuntime({
    executorRegistry: new ExecutorRegistry([
      new OpenClawExecutor(createTrapOpenClawClient(), credentialRegistry),
      new ModelExecutor(modelClient, credentialRegistry)
    ])
  });
  const request = buildRequestForAction(definition.baseAction);
  const credentialPreflight = await resolveCredentialPreflight(credentialRegistry, definition.manifest.id);

  console.log("RightOnClaw experimental action smoke test");
  console.log(`action: ${action}`);
  console.log(`base_action: ${definition.baseAction}`);
  console.log(`manifest_id: ${definition.manifest.id}`);
  console.log(`runner: ${definition.manifest.runner}`);
  if (credentialPreflight.credential) {
    console.log(
      `credential_preflight: ${credentialPreflight.credential.provider} (${credentialPreflight.credential.kind})`
    );
  }
  console.log("");

  try {
    const outcome = await runtime.executeExperimental(action, request);
    assertExperimentalEnvelope(action, outcome.result);

    if (!modelClient.called || !modelClient.lastInput) {
      throw new Error(`Experimental action ${action} completed without invoking the model executor path.`);
    }

    console.log("status: success");
    console.log(`executor_used: ${definition.manifest.runner}`);
    console.log(`credential_provider: ${modelClient.lastInput.credential.provider}`);
    console.log(`credential_kind: ${modelClient.lastInput.credential.kind}`);
    console.log(`title: ${outcome.result.title ?? "(none)"}`);
    console.log(`session_id: ${outcome.result.session_id ?? "(none)"}`);
    console.log(`webui_url: ${outcome.result.webui_url ?? "(none)"}`);
    console.log(`content_preview: ${truncate(outcome.result.content ?? "", 200)}`);
    console.log("");
    console.log("Experimental smoke passed.");
  } catch (error) {
    const normalized = normalizeError(error);

    console.error("status: failure");
    console.error(`executor_expected: ${definition.manifest.runner}`);
    console.error(`model_client_called: ${modelClient.called ? "yes" : "no"}`);
    console.error(`error_code: ${normalized.code}`);
    console.error(`error_phase: ${normalized.phase}`);
    console.error(`error_retryable: ${normalized.retryable ? "yes" : "no"}`);
    console.error(`error_message: ${normalized.message}`);
    console.error(`error_details: ${JSON.stringify(normalized.details ?? {}, null, 2)}`);
    if (credentialPreflight.error) {
      console.error(`credential_error_code: ${credentialPreflight.error.code}`);
      console.error(
        `credential_attempted_providers: ${credentialPreflight.error.attemptedProviders.join(", ") || "(none)"}`
      );
      console.error(`credential_request: ${JSON.stringify(credentialPreflight.error.request)}`);
    }
    process.exit(1);
  }
}

function createTrapOpenClawClient() {
  const fail = async (method: string): Promise<never> => {
    throw new Error(`Experimental smoke should not dispatch through OpenClawExecutor (${method}).`);
  };

  return {
    createSession: () => fail("createSession"),
    getLatestSession: () => fail("getLatestSession"),
    sendMessage: () => fail("sendMessage"),
    generateAssistantResponse: () => fail("generateAssistantResponse"),
    getSessionWebUrl: () => fail("getSessionWebUrl")
  };
}

async function resolveCredentialPreflight(
  credentialRegistry: Pick<CredentialProviderRegistry, "resolve">,
  manifestId: string
): Promise<
  | {
      credential: Awaited<ReturnType<CredentialProviderRegistry["resolve"]>>;
      error?: undefined;
    }
  | {
      credential?: undefined;
      error: CredentialResolutionError;
    }
> {
  try {
    const credential = await credentialRegistry.resolve({
      executor: "model",
      target: manifestId,
      purpose: "generation"
    });

    return { credential };
  } catch (error) {
    if (error instanceof CredentialResolutionError) {
      return { error };
    }

    throw error;
  }
}

function buildRequestForAction(action: ActionRequest["action"]): ActionRequest {
  const text =
    action === "explain"
      ? [
          "Error: ECONNREFUSED 127.0.0.1:5432",
          "at connectDatabase (db.ts:42:11)",
          "at startServer (server.ts:18:3)"
        ].join("\n")
      : "RightOnClaw captures local context, sends it to an executor, and returns a popup-friendly result.";

  return {
    version: "1.0",
    request_id: randomUUID(),
    action,
    source: {
      platform: "smoke-test",
      entry: "experimental_smoke"
    },
    selection: {
      kind: "text",
      text,
      paths: [],
      char_count: text.length
    },
    options: {
      session_strategy: "new"
    }
  };
}

function parseExperimentalAction(input: string | undefined): ExperimentalActionName {
  if (!input) {
    return DEFAULT_ACTION;
  }

  if (SUPPORTED_ACTIONS.includes(input as ExperimentalActionName)) {
    return input as ExperimentalActionName;
  }

  throw new Error(
    `Unsupported experimental action ${input}. Supported values: ${SUPPORTED_ACTIONS.join(", ")}.`
  );
}

function readActionArg(args: string[]): string | undefined {
  return args.find((value) => value !== "--");
}

function assertExperimentalEnvelope(action: ExperimentalActionName, result: ActionResult): void {
  if (typeof result.content !== "string" || result.content.trim().length === 0) {
    throw new Error(`${action} returned an empty result.content.`);
  }

  if (result.delivery.preferred_mode !== "popup") {
    throw new Error(`${action} expected popup delivery, received ${result.delivery.preferred_mode}.`);
  }

  if (!result.delivery.fallback_modes.includes("clipboard")) {
    throw new Error(`${action} expected clipboard fallback in the result envelope.`);
  }

  if (typeof result.session_id !== "string" || !result.session_id.startsWith(`model:${action}:`)) {
    throw new Error(`${action} returned an unexpected session_id: ${String(result.session_id)}.`);
  }

  if (result.webui_url !== null) {
    throw new Error(`${action} expected webui_url to be null for the model executor path.`);
  }

  const expectedTitle = action === "explain_fast" ? "Explanation" : "Summary";
  if (result.title !== expectedTitle) {
    throw new Error(`${action} returned title ${String(result.title)} instead of ${expectedTitle}.`);
  }
}

function truncate(input: string, maxLength: number): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

void main().catch((error) => {
  const normalized = normalizeError(error);
  console.error("status: failure");
  console.error(`error_code: ${normalized.code}`);
  console.error(`error_phase: ${normalized.phase}`);
  console.error(`error_retryable: ${normalized.retryable ? "yes" : "no"}`);
  console.error(`error_message: ${normalized.message}`);
  console.error(`error_details: ${JSON.stringify(normalized.details ?? {}, null, 2)}`);
  process.exit(1);
});
