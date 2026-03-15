import type { ActionRequest } from "@rightonclaw/types";

import { getBuiltInActionDefinition, getExperimentalActionDefinition, type BuiltInActionDefinitionOptions } from "./builtins";
import type {
  ActionDefinitionResolver,
  BuiltInActionDefinition,
  ExperimentalActionDefinition,
  ExperimentalActionDefinitionResolver,
  ExperimentalActionName
} from "./types";

export class BuiltInActionDefinitionResolver implements ActionDefinitionResolver {
  private readonly options: BuiltInActionDefinitionOptions;

  public constructor(options: BuiltInActionDefinitionOptions = {}) {
    this.options = options;
  }

  public resolve(action: ActionRequest["action"]): BuiltInActionDefinition {
    return getBuiltInActionDefinition(action, this.options);
  }
}

export class BuiltInExperimentalActionDefinitionResolver implements ExperimentalActionDefinitionResolver {
  public resolve(action: ExperimentalActionName): ExperimentalActionDefinition {
    return getExperimentalActionDefinition(action);
  }
}
