import type { Logger } from "@rightonclaw/core";
import type { ActionRequest, ActionResponseMeta, ActionResult, DeliveryPlan } from "@rightonclaw/types";

import type { ExecutorExecutionResult } from "./executors/types";

export interface RawHandlerResult {
  meta?: Partial<ActionResponseMeta>;
}

export interface ActionHandler<TRaw extends RawHandlerResult = RawHandlerResult> {
  readonly action: ActionRequest["action"];
  validate(request: ActionRequest): void;
  buildRawResult(execution: ExecutorExecutionResult, request: ActionRequest, logger?: Logger): TRaw;
  buildResult(raw: TRaw, request: ActionRequest): ActionResult;
  recommendedDelivery(result: ActionResult, request: ActionRequest, raw: TRaw): DeliveryPlan;
}

export interface DispatchActionResult {
  result: ActionResult;
  meta: Partial<ActionResponseMeta>;
}
