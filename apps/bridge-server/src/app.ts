import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import {
  loadBackendConfig,
  createLogger,
  createActionResponse,
  loadBridgeConfig,
  normalizeError,
  type BridgeConfig
} from "@rightonclaw/core";
import {
  ApiKeyCredentialProvider,
  ConfiguredApiKeyCredentialProvider,
  CredentialProviderRegistry,
  SharedCredentialProvider
} from "@rightonclaw/credential-layer";
import {
  ActionRuntime,
  BackendSelectionRouter,
  BuiltInActionDefinitionResolver,
  ExecutorRegistry,
  HttpOpenClawResponsesClient,
  HttpModelClient,
  ModelExecutor,
  OpenClawResponsesExecutor,
  OpenClawExecutor
} from "@rightonclaw/action-runtime";
import { createOpenClawClient, type OpenClawClient } from "@rightonclaw/openclaw-client";
import type { ActionName } from "@rightonclaw/types";

import { BackendDiscoveryService } from "./backends/discovery";
import { OpenClawBackendPlugin } from "./backends/plugins/openclaw-plugin";
import { OpenAICompatibleBackendPlugin } from "./backends/plugins/openai-compatible-plugin";
import { BackendPluginRegistry } from "./backends/registry";
import { BackendSelectionService, createStaticBackendSelectionResolver } from "./backends/selection";
import type { BackendSelectionResolver } from "./backends/types";
import { registerTracing } from "./plugins/tracing";
import { registerValidation } from "./plugins/validation";
import { registerActionRoutes } from "./routes/actions";
import { registerBackendConfigRoutes } from "./routes/backend-config";
import { registerBackendRoutes } from "./routes/backends";
import { registerCapabilitiesRoutes } from "./routes/capabilities";
import { registerHealthRoutes } from "./routes/health";

export interface BuildAppOptions {
  config?: BridgeConfig;
  backendConfig?: ReturnType<typeof loadBackendConfig>;
  client?: OpenClawClient;
  runtime?: ActionRuntime;
  credentialProviderRegistry?: CredentialProviderRegistry;
  backendSelectionResolver?: BackendSelectionResolver;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadBridgeConfig();
  const backendConfig = options.backendConfig ?? loadBackendConfig();
  const client =
    options.client ??
    createOpenClawClient({
      mode: config.openClawClientMode,
      baseUrl: config.openClawBaseUrl,
      gatewayUrl: config.openClawGatewayUrl,
      gatewayToken: config.openClawGatewayToken,
      gatewayPassword: config.openClawGatewayPassword,
      agentId: config.openClawAgentId,
      requestTimeoutMs: config.openClawRequestTimeoutMs,
      responsesPath: config.openClawResponsesPath,
      sendToClawMaxOutputTokens: config.openClawSendToClawMaxOutputTokens,
      generationMaxOutputTokens: config.openClawGenerationMaxOutputTokens
    });
  const credentialProviderRegistry =
    options.credentialProviderRegistry ??
    new CredentialProviderRegistry([
      new SharedCredentialProvider({
        env: process.env
      }),
      new ConfiguredApiKeyCredentialProvider({
        backendConfig
      }),
      new ApiKeyCredentialProvider({
        env: process.env
      })
    ]);
  const backendDiscoveryService =
    options.client || options.backendSelectionResolver
      ? null
      : new BackendDiscoveryService({
          registry: new BackendPluginRegistry([new OpenClawBackendPlugin(), new OpenAICompatibleBackendPlugin()]),
          context: {
            config,
            backendConfig,
            credentialProviderRegistry,
            env: process.env
          }
        });
  const backendSelectionResolver =
    options.backendSelectionResolver ??
    (options.client
      ? createStaticBackendSelectionResolver({
          default_backend: "openclaw"
        })
      : new BackendSelectionService({
          discovery: backendDiscoveryService!,
          selectionMode: backendConfig.selection_mode ?? "auto",
          selectedBackend: backendConfig.selected_backend ?? null,
          backendConfig,
          summarizeFastPathEnabled: config.summarizeFastPathEnabled,
          explainFastPathEnabled: config.explainFastPathEnabled
        }));
  const runtime =
    options.runtime ??
    new ActionRuntime({
      executorRegistry: new ExecutorRegistry([
        new OpenClawExecutor(client, credentialProviderRegistry),
        new OpenClawResponsesExecutor(
          new HttpOpenClawResponsesClient({
            requestTimeoutMs: config.openClawRequestTimeoutMs,
            responsesPath: config.openClawResponsesPath
          }),
          credentialProviderRegistry
        ),
        new ModelExecutor(
          new HttpModelClient({
            requestTimeoutMs: config.requestTimeoutMs,
            responsesPath: config.openClawResponsesPath
          }),
          credentialProviderRegistry
        )
      ]),
      backendSelectionRouter: new BackendSelectionRouter({
        backendSelectionResolver
      }),
      definitionResolver: new BuiltInActionDefinitionResolver({
        summarizeFastPathEnabled: config.summarizeFastPathEnabled,
        explainFastPathEnabled: config.explainFastPathEnabled
      }),
      credentialProviderRegistry,
      fastPathMaxInputLength: config.fastPathMaxInputLength,
      logger: createLogger("action-runtime")
    });

  const app = Fastify({
    logger: true,
    bodyLimit: config.bodyLimitBytes,
    requestTimeout: config.requestTimeoutMs
  });

  registerTracing(app);
  registerValidation(app, config);
  registerHealthRoutes(app, config);
  registerBackendRoutes(app, {
    backendSelectionResolver
  });
  registerBackendConfigRoutes(app, {
    backendConfig,
    refreshBackendSnapshot: async () => {
      backendDiscoveryService?.invalidate();
      return backendSelectionResolver.resolve();
    }
  });
  registerCapabilitiesRoutes(app, {
    backendSelectionResolver
  });
  registerActionRoutes(app, {
    runtime,
    config,
    logger: createLogger("action-runtime")
  });

  app.setErrorHandler(async (error, request, reply) => {
    const normalized = normalizeError(error);
    const durationMs = typeof request.rocStartedAt === "number" ? Date.now() - request.rocStartedAt : 0;
    const inferredAction = inferActionFromRequest(request);

    request.log.error({
      request_id: request.rocRequestId,
      action: inferredAction,
      code: normalized.code,
      phase: normalized.phase,
      retryable: normalized.retryable
    });

    if (inferredAction) {
      reply.status(normalized.statusCode).send(
        createActionResponse({
          requestId: request.rocRequestId,
          action: inferredAction,
          status: "error",
          result: null,
          error: normalized.toActionError(),
          meta: {
            duration_ms: durationMs,
            fallback_used: false
          }
        })
      );
      return;
    }

    reply.status(normalized.statusCode).send({
      request_id: request.rocRequestId,
      status: "error",
      error: normalized.toActionError(),
      meta: {
        duration_ms: durationMs
      }
    });
  });

  return app;
}

function inferActionFromRequest(request: FastifyRequest): ActionName | null {
  if (request.url.includes("/actions/ask-claw")) {
    return "ask_claw";
  }

  if (request.url.includes("/actions/send-to-claw")) {
    return "send_to_claw";
  }

  if (request.url.includes("/actions/summarize")) {
    return "summarize";
  }

  if (request.url.includes("/actions/rewrite")) {
    return "rewrite";
  }

  if (request.url.includes("/actions/explain")) {
    return "explain";
  }

  return null;
}
