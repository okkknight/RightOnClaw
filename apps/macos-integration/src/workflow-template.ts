import type { WorkflowInvocation } from "./types";

const TEXT_SEND_TYPES = ["NSStringPboardType", "public.text", "public.plain-text", "public.utf8-plain-text"];
const FINDER_SEND_FILE_TYPES = ["public.item", "public.directory", "com.apple.resolvable"];
const QUICK_ACTION_ICON_NAME = "NSActionTemplate";

export type WorkflowType = "servicesMenu" | "quickAction";

export interface WorkflowDefinition {
  workflowType: WorkflowType;
  bundleFileName: string;
  bundleIdentifier: string;
  menuTitle: string;
  inputMode: WorkflowInvocation["inputMode"];
  action: WorkflowInvocation["action"];
  cliCommand?: "run" | "screenshot";
  cliArgs?: string[];
  applicationBundleId: string;
  applicationPath: string;
  serviceInputTypeIdentifier: string;
  serviceOutputTypeIdentifier?: string;
  nSServicesEntry?: Record<string, unknown>;
}

export function getWorkflowDefinitions(nodeBinary: string, projectRoot: string): Array<{
  definition: WorkflowDefinition;
  infoPlist: Record<string, unknown>;
  document: Record<string, unknown>;
}> {
  return createDefinitions().map((definition) => ({
    definition,
    infoPlist: buildInfoPlist(definition),
    document: buildDocument(definition, nodeBinary, projectRoot)
  }));
}

function createDefinitions(): WorkflowDefinition[] {
  return [
    {
      workflowType: "servicesMenu",
      bundleFileName: "RightOnClaw Text.workflow",
      bundleIdentifier: "com.rightonclaw.service.rightonclaw-text",
      menuTitle: "Ask Claw",
      inputMode: "text",
      action: "ask_claw",
      cliCommand: "run",
      applicationBundleId: "",
      applicationPath: "",
      serviceInputTypeIdentifier: "com.apple.Automator.text",
      nSServicesEntry: {
        NSSendTypes: TEXT_SEND_TYPES
      }
    },
    {
      workflowType: "servicesMenu",
      bundleFileName: "RightOnClaw Files.workflow",
      bundleIdentifier: "com.rightonclaw.service.rightonclaw-files",
      menuTitle: "Ask Claw",
      inputMode: "paths",
      action: "ask_claw",
      cliCommand: "run",
      applicationBundleId: "com.apple.finder",
      applicationPath: "/System/Library/CoreServices/Finder.app",
      serviceInputTypeIdentifier: "com.apple.Automator.fileSystemObject",
      nSServicesEntry: {
        NSRequiredContext: {
          NSApplicationIdentifier: "com.apple.finder",
          NSTextContent: "FilePath"
        },
        NSSendFileTypes: FINDER_SEND_FILE_TYPES,
        NSSendTypes: ["public.file-url", "public.plain-text"]
      }
    },
    {
      workflowType: "quickAction",
      bundleFileName: "Ask Claw.workflow",
      bundleIdentifier: "com.rightonclaw.quick-action.ask-claw",
      menuTitle: "Ask Claw",
      inputMode: "paths",
      action: "ask_claw",
      cliCommand: "run",
      applicationBundleId: "com.apple.finder",
      applicationPath: "/System/Library/CoreServices/Finder.app",
      serviceInputTypeIdentifier: "com.apple.Automator.fileSystemObject",
      nSServicesEntry: {
        NSIconName: QUICK_ACTION_ICON_NAME,
        NSRequiredContext: {
          NSApplicationIdentifier: "com.apple.finder",
          NSTextContent: "FilePath"
        },
        NSSendFileTypes: FINDER_SEND_FILE_TYPES,
        NSSendTypes: ["public.file-url", "public.plain-text"]
      }
    }
  ];
}

function buildInfoPlist(definition: WorkflowDefinition): Record<string, unknown> {
  return {
    CFBundleIdentifier: definition.bundleIdentifier,
    CFBundleName: definition.bundleFileName.replace(/\.workflow$/, ""),
    NSSupportsAutomaticTermination: true,
    NSServices: [
      {
        NSMessage: "runWorkflowAsService",
        NSMenuItem: {
          default: definition.menuTitle
        },
        ...definition.nSServicesEntry
      }
    ]
  };
}

function buildDocument(
  definition: WorkflowDefinition,
  nodeBinary: string,
  projectRoot: string
): Record<string, unknown> {
  const acceptsType =
    definition.inputMode === "paths"
      ? "com.apple.cocoa.path"
      : definition.inputMode === "manual"
        ? "com.apple.Automator.nothing"
        : "com.apple.cocoa.string";
  const providesType =
    definition.serviceOutputTypeIdentifier === "com.apple.Automator.text" ? "com.apple.cocoa.string" : acceptsType;

  return {
    AMApplicationBuild: "521.3",
    AMApplicationVersion: "2.10",
    AMDocumentVersion: "2",
    actions: [
      {
        action: {
          ActionBundlePath: "/System/Library/Automator/Run Shell Script.action",
          ActionName: "Run Shell Script",
          ActionParameters: {
            COMMAND_STRING: buildShellCommand(definition, nodeBinary, projectRoot),
            CheckedForUserDefaultShell: true,
            inputMethod: definition.inputMode === "paths" ? 1 : 0,
            shell: "/bin/bash",
            source: buildShellCommand(definition, nodeBinary, projectRoot)
          },
          AMAccepts: {
            Container: "List",
            Optional: 1,
            Types: [acceptsType]
          },
          AMActionVersion: "2.0.3",
          AMApplication: ["Automator"],
          AMProvides: {
            Container: "List",
            Types: [providesType]
          },
          ActionVersion: "2.0.3",
          ApplicationBundleIDs: ["com.apple.AutomatorRunner"],
          BundleIdentifier: "com.apple.RunShellScript",
          CFBundleVersion: "2.0.3",
          CanShowSelectedItemsWhenRun: false,
          CanShowWhenRun: true,
          Category: "AMCategoryUtilities",
          "Class Name": "RunShellScriptAction",
          DescriptionData: {
            AMDHighlightColor: "0.450980 0.450980 0.450980",
            AMDNote: "This action executes a Unix shell script.",
            AMDWarnOnDirectAction: true,
            AMDWarnOnDirectActionMessage: "When run directly, this action executes an external shell script."
          },
          HasView: true,
          InputUUID: "00000000-0000-0000-0000-000000000000",
          Keywords: ["Shell", "Script", "Command", "Run", "Unix"],
          OutputUUID: "00000000-0000-0000-0000-000000000000",
          UUID: cryptoRandomId()
        },
        isViewVisible: true
      }
    ],
    connectors: {},
    workflowMetaData: {
      serviceApplicationBundleID: definition.applicationBundleId,
      serviceApplicationPath: definition.applicationPath,
      serviceInputTypeIdentifier: definition.serviceInputTypeIdentifier,
      serviceOutputTypeIdentifier: definition.serviceOutputTypeIdentifier ?? "com.apple.Automator.nothing",
      serviceProcessesInput: definition.inputMode === "text" ? 1 : 0,
      workflowTypeIdentifier:
        definition.workflowType === "quickAction"
          ? "com.apple.Automator.quickAction"
          : "com.apple.Automator.servicesMenu"
    }
  };
}

function buildShellCommand(definition: WorkflowDefinition, nodeBinary: string, projectRoot: string): string {
  const cliCommand = definition.cliCommand ?? "run";
  const cliArgs =
    cliCommand === "run"
      ? [cliCommand, definition.action, definition.inputMode]
      : [cliCommand, ...(definition.cliArgs ?? [])];

  return [
    "set -euo pipefail",
    'export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"',
    `NODE_BIN=${shellQuote(nodeBinary)}`,
    'if [ ! -x "$NODE_BIN" ]; then NODE_BIN="$(command -v node)"; fi',
    `PROJECT_ROOT=${shellQuote(projectRoot)}`,
    'exec "$NODE_BIN" "$PROJECT_ROOT/apps/macos-integration/dist/workflow-cli.js" ' +
      `${cliArgs.map(shellQuote).join(" ")} "$@"`
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function cryptoRandomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16).toUpperCase();
  });
}
