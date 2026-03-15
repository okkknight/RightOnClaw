import { loadBridgeConfig } from "@rightonclaw/core";

import { buildApp } from "./app";

async function start(): Promise<void> {
  const config = loadBridgeConfig();
  const app = buildApp({ config });

  try {
    await app.listen({
      host: config.host,
      port: config.port
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
