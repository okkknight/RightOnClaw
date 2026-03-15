import type { BackendStatus } from "@rightonclaw/core";
import { probeOpenClawGateway, probeOpenClawResponses } from "@rightonclaw/openclaw-client";

import type { BackendPlugin, BackendPluginContext } from "../types";

const OPENCLAW_ENV_KEYS = [
  "RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN",
  "RIGHTONCLAW_OPENCLAW_GATEWAY_PASSWORD",
  "RIGHTONCLAW_OPENCLAW_GATEWAY_URL",
  "RIGHTONCLAW_OPENCLAW_BASE_URL",
  "RIGHTONCLAW_OPENCLAW_AGENT_ID"
] as const;

export class OpenClawBackendPlugin implements BackendPlugin {
  public readonly id = "openclaw" as const;
  public readonly displayName = "OpenClaw";

  public async detect(context: BackendPluginContext): Promise<BackendStatus> {
    if (context.config.openClawClientMode === "mock") {
      return {
        id: this.id,
        display_name: this.displayName,
        configured: false,
        healthy: false,
        available: false,
        preferred: false,
        source: hasExplicitOpenClawConfig(context.env) ? "manual" : "auto",
        reason: "mock_mode_forced",
        supported_actions: ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"],
        supports_fast_path: false,
        default_runner: "openclaw",
        fast_path_runner: "openclaw_responses"
      };
    }

    const source = hasExplicitOpenClawConfig(context.env) ? "manual" : "auto";
    const gatewayProbe = await probeOpenClawGateway({
      gatewayUrl: context.config.openClawGatewayUrl,
      authToken: context.config.openClawGatewayToken,
      authPassword: context.config.openClawGatewayPassword,
      requestTimeoutMs: Math.min(context.config.openClawRequestTimeoutMs, 3_000)
    });
    const responsesProbe =
      gatewayProbe.healthy &&
      (context.config.summarizeFastPathEnabled || context.config.explainFastPathEnabled)
        ? await probeOpenClawResponses({
            gatewayUrl: context.config.openClawGatewayUrl,
            responsesPath: context.config.openClawResponsesPath,
            authToken: context.config.openClawGatewayToken,
            authPassword: context.config.openClawGatewayPassword,
            agentId: context.config.openClawAgentId,
            requestTimeoutMs: Math.min(context.config.openClawRequestTimeoutMs, 5_000)
          })
        : null;
    const configured = gatewayProbe.reachable || source === "manual";

    return {
      id: this.id,
      display_name: this.displayName,
      configured,
      healthy: gatewayProbe.healthy,
      available: configured && gatewayProbe.healthy,
      preferred: false,
      source,
      reason: gatewayProbe.reason,
      supported_actions: ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"],
      supports_fast_path: responsesProbe?.healthy ?? false,
      default_runner: "openclaw",
      fast_path_runner: "openclaw_responses"
    };
  }
}

function hasExplicitOpenClawConfig(env: NodeJS.ProcessEnv): boolean {
  return OPENCLAW_ENV_KEYS.some((key) => typeof env[key] === "string" && env[key]?.trim());
}
