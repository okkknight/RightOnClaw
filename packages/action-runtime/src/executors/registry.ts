import { AppError, ERROR_CODES } from "@rightonclaw/core";

import type { ActionRunner } from "../manifests/types";
import type { ActionExecutor } from "./types";

export class ExecutorRegistry {
  private readonly executors = new Map<ActionRunner, ActionExecutor>();

  public constructor(executors: ActionExecutor[] = []) {
    executors.forEach((executor) => this.register(executor));
  }

  public register(executor: ActionExecutor): void {
    this.executors.set(executor.runner, executor);
  }

  public get(runner: ActionRunner): ActionExecutor {
    const executor = this.executors.get(runner);

    if (!executor) {
      throw new AppError({
        code: ERROR_CODES.GENERATION_FAILED,
        message: `No executor is registered for runner ${runner}.`,
        phase: "generation",
        retryable: false,
        statusCode: 500,
        details: {
          runner
        }
      });
    }

    return executor;
  }
}
