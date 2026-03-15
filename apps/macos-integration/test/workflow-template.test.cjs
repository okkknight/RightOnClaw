const test = require("node:test");
const assert = require("node:assert/strict");

const { getWorkflowDefinitions } = require("../dist/workflow-template.js");

test("workflow template installs Ask Claw workflows for each supported selection surface", () => {
  const workflows = getWorkflowDefinitions("/opt/homebrew/bin/node", "/tmp/rightonclaw");

  assert.equal(workflows.length, 3);
  assert.deepEqual(
    workflows.map(({ definition }) => ({
      bundleFileName: definition.bundleFileName,
      workflowType: definition.workflowType,
      menuTitle: definition.menuTitle,
      inputMode: definition.inputMode,
      action: definition.action
    })),
    [
      {
        bundleFileName: "RightOnClaw Text.workflow",
        workflowType: "servicesMenu",
        menuTitle: "Ask Claw",
        inputMode: "text",
        action: "ask_claw"
      },
      {
        bundleFileName: "RightOnClaw Files.workflow",
        workflowType: "servicesMenu",
        menuTitle: "Ask Claw",
        inputMode: "paths",
        action: "ask_claw"
      },
      {
        bundleFileName: "Ask Claw.workflow",
        workflowType: "quickAction",
        menuTitle: "Ask Claw",
        inputMode: "paths",
        action: "ask_claw"
      }
    ]
  );
});

test("service workflows keep their existing metadata", () => {
  const workflows = getWorkflowDefinitions("/opt/homebrew/bin/node", "/tmp/rightonclaw");
  const textWorkflow = workflows.find(({ definition }) => definition.bundleFileName === "RightOnClaw Text.workflow");
  const filesWorkflow = workflows.find(({ definition }) => definition.bundleFileName === "RightOnClaw Files.workflow");

  assert.ok(textWorkflow);
  assert.ok(filesWorkflow);

  assert.equal(
    textWorkflow.document.workflowMetaData.workflowTypeIdentifier,
    "com.apple.Automator.servicesMenu"
  );
  assert.equal(
    filesWorkflow.document.workflowMetaData.workflowTypeIdentifier,
    "com.apple.Automator.servicesMenu"
  );
  assert.equal(textWorkflow.infoPlist.NSServices[0].NSMenuItem.default, "Ask Claw");
  assert.equal(filesWorkflow.infoPlist.NSServices[0].NSMenuItem.default, "Ask Claw");
  assert.deepEqual(textWorkflow.infoPlist.NSServices[0].NSSendTypes, [
    "NSStringPboardType",
    "public.text",
    "public.plain-text",
    "public.utf8-plain-text"
  ]);
  assert.deepEqual(filesWorkflow.infoPlist.NSServices[0].NSSendFileTypes, [
    "public.item",
    "public.directory",
    "com.apple.resolvable"
  ]);
});

test("finder quick action workflow reuses the ask_claw paths CLI chain", () => {
  const workflows = getWorkflowDefinitions("/opt/homebrew/bin/node", "/tmp/rightonclaw");
  const quickActionWorkflow = workflows.find(({ definition }) => definition.bundleFileName === "Ask Claw.workflow");

  assert.ok(quickActionWorkflow);
  assert.equal(quickActionWorkflow.definition.menuTitle, "Ask Claw");
  assert.equal(quickActionWorkflow.definition.workflowType, "quickAction");
  assert.equal(quickActionWorkflow.document.workflowMetaData.workflowTypeIdentifier, "com.apple.Automator.quickAction");
  assert.equal(quickActionWorkflow.document.workflowMetaData.serviceApplicationBundleID, "com.apple.finder");
  assert.equal(quickActionWorkflow.document.workflowMetaData.serviceInputTypeIdentifier, "com.apple.Automator.fileSystemObject");
  assert.equal(quickActionWorkflow.infoPlist.NSServices[0].NSMenuItem.default, "Ask Claw");
  assert.equal(quickActionWorkflow.infoPlist.NSServices[0].NSIconName, "NSActionTemplate");

  const command =
    quickActionWorkflow.document.actions[0].action.ActionParameters.COMMAND_STRING;
  assert.match(command, /workflow-cli\.js/);
  assert.match(command, /'run' 'ask_claw' 'paths'/);
});
