import type { Logger } from "@rightonclaw/core";
import type { ActionRequest } from "@rightonclaw/types";
import type { OpenClawClient } from "@rightonclaw/openclaw-client";

import { BuiltInActionDefinitionResolver } from "./actions/resolver";
import { getActionHandler } from "./handlers";
import { OpenClawExecutor } from "./executors/openclaw-executor";
import { ExecutorRegistry } from "./executors/registry";
import { ActionRuntime } from "./runtime";
import type { DispatchActionResult } from "./types";
import type { ActionDefinitionResolver } from "./actions/types";

export interface DispatchActionContext {
  runtime?: ActionRuntime;
  client?: OpenClawClient;
  logger?: Logger;
  definitionResolver?: ActionDefinitionResolver;
  executorRegistry?: ExecutorRegistry;
}

export { getActionHandler };

export async function dispatchAction(request: ActionRequest, context: DispatchActionContext): Promise<DispatchActionResult> {
  const runtime = context.runtime ?? createDefaultRuntime(context);
  return runtime.execute(request);
}

function createDefaultRuntime(context: DispatchActionContext): ActionRuntime {
  if (!context.client) {
    throw new Error("dispatchAction requires either an ActionRuntime or an OpenClawClient.");
  }

  const executorRegistry = context.executorRegistry ?? new ExecutorRegistry([new OpenClawExecutor(context.client)]);

  return new ActionRuntime({
    executorRegistry,
    definitionResolver: context.definitionResolver ?? new BuiltInActionDefinitionResolver(),
    logger: context.logger
  });
}
