import type { FastifyInstance } from "fastify";

import type { BackendSelectionResolver } from "../backends/types";

interface CapabilitiesRouteDependencies {
  backendSelectionResolver: BackendSelectionResolver;
}

export function registerCapabilitiesRoutes(app: FastifyInstance, dependencies: CapabilitiesRouteDependencies): void {
  app.get("/v1/capabilities", async () => {
    const snapshot = await dependencies.backendSelectionResolver.resolve();

    return {
      status: "ok",
      actions: ["ask_claw", "summarize", "explain", "rewrite", "send_to_claw"],
      delivery_modes: ["open_webui", "popup", "apply_selection", "clipboard"],
      selection_kinds: ["file", "directory", "text"],
      backend_summary: {
        default_backend: snapshot.default_backend,
        fast_path_backend: snapshot.fast_path_backend,
        fast_path_available: snapshot.fast_path_available,
        setup_required: snapshot.setup_required,
        backends: snapshot.backends
      },
      action_details: {
        ask_claw: {
          selection_kinds: ["text", "file", "folder", "image", "screenshot", "mixed"],
          delivery_modes: ["popup", "open_webui", "clipboard"],
          streaming: true
        },
        summarize: {
          selection_kinds: ["text", "file", "folder", "image", "screenshot", "mixed"],
          delivery_modes: ["popup", "clipboard", "open_webui"],
          streaming: true
        },
        explain: {
          selection_kinds: ["text", "file", "folder", "image", "screenshot", "mixed"],
          delivery_modes: ["popup", "clipboard", "open_webui"],
          streaming: true
        },
        rewrite: {
          selection_kinds: ["text"],
          delivery_modes: ["apply_selection", "popup", "clipboard"],
          streaming: false
        },
        send_to_claw: {
          selection_kinds: ["text", "file", "folder", "image", "screenshot", "mixed"],
          delivery_modes: ["open_webui", "popup", "clipboard"],
          streaming: false
        }
      }
    };
  });
}
