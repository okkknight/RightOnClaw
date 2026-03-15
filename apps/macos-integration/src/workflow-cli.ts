import { launchMenuBar } from "./menubar";
import { runSetupFlow } from "./setup-flow";
import { readStdIn, runScreenshotFlow, runWorkflow } from "./workflow-runner";

async function main(): Promise<void> {
  const [, , command, action, inputMode, ...rest] = process.argv;

  if (command === "menu-bar") {
    await runSetupFlow({
      mode: "auto",
      log: console.warn
    });
    launchMenuBar({
      log: console.warn
    });
    return;
  }

  if (command === "setup") {
    await runSetupFlow({
      mode: "manual",
      log: console.warn
    });
    return;
  }

  if (command === "screenshot") {
    const preset = action && isPromptPreset(action) ? action : "freeform";
    await runScreenshotFlow(preset);
    return;
  }

  if (command !== "run" || !action || !inputMode) {
    printUsage();
    process.exit(1);
  }

  if (!isAction(action) || !isInputMode(inputMode)) {
    printUsage();
    process.exit(1);
  }

  const rawInput = inputMode === "text" ? await readStdIn() : "";
  const result = await runWorkflow({ action, inputMode }, rawInput, rest);

  if (action === "rewrite" && inputMode === "text") {
    process.stdout.write(result.replacementText ?? rawInput);
  }
}

function isAction(value: string): value is "send_to_claw" | "summarize" | "rewrite" | "explain" | "ask_claw" {
  return (
    value === "send_to_claw" ||
    value === "summarize" ||
    value === "rewrite" ||
    value === "explain" ||
    value === "ask_claw"
  );
}

function isInputMode(value: string): value is "text" | "paths" | "manual" | "auto" {
  return value === "text" || value === "paths" || value === "manual" || value === "auto";
}

function isPromptPreset(value: string): value is "freeform" | "summarize" | "explain" | "send_to_claw" {
  return value === "freeform" || value === "summarize" || value === "explain" || value === "send_to_claw";
}

function printUsage(): void {
  console.error(
    "Usage: workflow-cli.js run <ask_claw|send_to_claw|summarize|rewrite|explain> <text|paths|manual> [paths...]\n       workflow-cli.js screenshot [freeform|summarize|explain|send_to_claw]\n       workflow-cli.js menu-bar"
      .replace("<text|paths|manual>", "<text|paths|manual|auto>") + "\n       workflow-cli.js setup"
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
