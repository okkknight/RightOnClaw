# RightOnClaw Architecture

## 1. Current System Shape

RightOnClaw is a layered local macOS AI system.

It currently consists of:

- macOS entry and UI layer
- workflow generation and installation layer
- workflow CLI / runner layer
- selection normalization layer
- local bridge layer
- runtime / router / executor layer
- backend discovery and selection layer

The important current architectural fact is that entry mechanisms have grown, but the downstream request spine is still unified.

```text
Finder Service / Text Service / Finder Sync / Menu bar / Hotkey / Screenshot
  -> workflow-cli
  -> workflow-runner
  -> selection normalization
  -> selection_context enrichment
  -> AskPanel or direct action delivery flow
  -> bridge-client
  -> bridge-server
  -> ActionRuntime
     -> BackendSelectionRouter
     -> ObjectAwareActionRouter
     -> PublicTextActionRouter
  -> ExecutorRegistry
  -> executor
  -> response stream / result
  -> native macOS UI
```

## 2. Repository-Level Module Map

### `apps/macos-integration`

Owns macOS-specific concerns:

- workflow generation and installation
- menu bar and hotkeys
- screenshot capture
- focused selection capture
- AskPanel and result popups
- setup/settings UI
- Finder Sync PoC layer
- bridge HTTP client

Key files:

- [apps/macos-integration/src/workflow-template.ts](../apps/macos-integration/src/workflow-template.ts)
- [apps/macos-integration/src/install.ts](../apps/macos-integration/src/install.ts)
- [apps/macos-integration/src/workflow-cli.ts](../apps/macos-integration/src/workflow-cli.ts)
- [apps/macos-integration/src/workflow-runner.ts](../apps/macos-integration/src/workflow-runner.ts)
- [apps/macos-integration/src/selection.ts](../apps/macos-integration/src/selection.ts)
- [apps/macos-integration/src/selection-context.ts](../apps/macos-integration/src/selection-context.ts)
- [apps/macos-integration/src/ask-claw-ui.ts](../apps/macos-integration/src/ask-claw-ui.ts)

### `apps/bridge-server`

Owns local HTTP API and bridge composition:

- `/v1/actions/*`
- `/v1/backends`
- `/v1/backends/configure`
- `/v1/capabilities`
- `/v1/health`

Key file:

- [apps/bridge-server/src/app.ts](../apps/bridge-server/src/app.ts)

### `packages/action-runtime`

Owns internal action execution orchestration:

- action definition resolution
- backend-aware routing
- object-aware routing
- public text fast-path routing
- executor registry dispatch

Key file:

- [packages/action-runtime/src/runtime.ts](../packages/action-runtime/src/runtime.ts)

### `packages/core`

Owns shared config, backend config/types, response helpers, and errors.

### `packages/credential-layer`

Owns credential provider resolution only.

### `packages/openclaw-client`

Owns OpenClaw communication contract and probe helpers.

## 3. Entry Layer Architecture

RightOnClaw does not currently use a single macOS entry mechanism. It uses multiple entry mechanisms that all converge into the same CLI/runner spine.

### 3.1 Automator workflows

Current generated workflows:

- `RightOnClaw Text.workflow`
- `RightOnClaw Files.workflow`
- `Ask Claw.workflow`

Generation file:

- [apps/macos-integration/src/workflow-template.ts](../apps/macos-integration/src/workflow-template.ts)

Installation file:

- [apps/macos-integration/src/install.ts](../apps/macos-integration/src/install.ts)

Current workflow types:

- `servicesMenu`
- `quickAction`

The text and files workflows remain Service workflows. The extra `Ask Claw.workflow` is generated as a Quick Action bundle but still uses the same CLI invocation.

### 3.2 Finder Sync enhancement layer

Current Finder Sync implementation:

- [apps/macos-integration/finder-sync/RightOnClawFinderSync.swift](../apps/macos-integration/finder-sync/RightOnClawFinderSync.swift)
- [apps/macos-integration/finder-sync/RightOnClawFinderHost.swift](../apps/macos-integration/finder-sync/RightOnClawFinderHost.swift)

Current purpose:

- Finder toolbar enhancement
- Finder contextual menu enhancement
- Finder-only handoff back into existing `ask_claw paths`

Current handoff model:

```text
Finder Sync extension
  -> URL scheme launch
  -> RightOnClawFinderHost app
  -> workflow-cli run ask_claw paths ...
```

This layer does not replace Services.

### 3.3 Menu bar and hotkeys

Current menu bar/hotkey entry:

- [apps/macos-integration/src/menubar.ts](../apps/macos-integration/src/menubar.ts)
- [apps/macos-integration/swift/RightOnClawMenuBar.swift](../apps/macos-integration/swift/RightOnClawMenuBar.swift)

Used for:

- Ask Claw hotkey
- screenshot hotkey
- setup/settings access

### 3.4 Screenshot entry

Screenshot is its own capture entry:

- [apps/macos-integration/src/screenshot.ts](../apps/macos-integration/src/screenshot.ts)
- [apps/macos-integration/src/workflow-runner.ts](../apps/macos-integration/src/workflow-runner.ts)

It does not depend on Finder or text Services.

## 4. Workflow CLI and Runner

### `workflow-cli`

File:

- [apps/macos-integration/src/workflow-cli.ts](../apps/macos-integration/src/workflow-cli.ts)

Current command surface:

- `run <action> <text|paths|manual|auto>`
- `screenshot [freeform|summarize|explain|send_to_claw]`
- `menu-bar`
- `setup`

`workflow-cli` is intentionally thin. It parses argv, reads stdin for text mode, and then delegates to `workflow-runner`.

### `workflow-runner`

File:

- [apps/macos-integration/src/workflow-runner.ts](../apps/macos-integration/src/workflow-runner.ts)

Current responsibilities:

- resolve incoming selection source
- normalize selection
- build `selection_context`
- choose AskPanel flow vs direct action flow
- stream bridge output into native UI
- handle result delivery and error popup fallback

Current top-level branches:

- `runWorkflow(...)`
- `runScreenshotFlow(...)`
- `runAskClawFlow(...)`
- `runDirectActionFlow(...)`

## 5. Selection Model

RightOnClaw currently models selection in two stages.

### 5.1 `ActionSelection`

Built in macOS integration by:

- [apps/macos-integration/src/selection.ts](../apps/macos-integration/src/selection.ts)

Current constructors:

- `buildTextSelection(text)`
- `buildPathSelection(paths)`
- `buildManualSelection()`

Current base kinds:

- `text`
- `file`
- `directory`
- `manual`

Important current behavior:

- path selections are normalized to resolved absolute paths
- all-directory path sets become `directory`
- anything else becomes `file`

### 5.2 `SelectionContext`

Built by:

- [apps/macos-integration/src/selection-context.ts](../apps/macos-integration/src/selection-context.ts)

This is the richer object-aware model sent downstream.

Current context kinds can become:

- `text`
- `file`
- `folder`
- `image`
- `screenshot`
- `mixed`

Important current behavior:

- image files are recognized from MIME/extension at the `SelectionContext` layer
- mixed file/folder/image sets are represented as `mixed`
- screenshot capture mode explicitly marks the context as `screenshot`

This is why many downstream layers do not care which macOS entry produced the request. They consume normalized `selection_context`.

## 6. AskPanel and Native UI Layer

### AskPanel

Current AskPanel files:

- [apps/macos-integration/src/ask-claw-ui.ts](../apps/macos-integration/src/ask-claw-ui.ts)
- [apps/macos-integration/swift/RightOnClawAskPanel.swift](../apps/macos-integration/swift/RightOnClawAskPanel.swift)
- [apps/macos-integration/swift/RightOnClawConversationUI.swift](../apps/macos-integration/swift/RightOnClawConversationUI.swift)

Current AskPanel architecture:

- `workflow-runner` launches a native helper subprocess
- payload is written to a temp JSON file
- macOS TypeScript side and Swift UI talk over stdio
- AskPanel emits submit events
- runner streams assistant updates back into the same window

Current UX shape:

- single-window AskPanel
- command/conversation hybrid surface
- no popup handoff for `ask_claw`

### Other UI surfaces

Still used for non-Ask flows:

- [apps/macos-integration/swift/RightOnClawPopup.swift](../apps/macos-integration/swift/RightOnClawPopup.swift)
- [apps/macos-integration/swift/RightOnClawStreamPopup.swift](../apps/macos-integration/swift/RightOnClawStreamPopup.swift)
- [apps/macos-integration/swift/RightOnClawHud.swift](../apps/macos-integration/swift/RightOnClawHud.swift)
- [apps/macos-integration/swift/RightOnClawSetupPanel.swift](../apps/macos-integration/swift/RightOnClawSetupPanel.swift)

## 7. Bridge Layer

Bridge composition root:

- [apps/bridge-server/src/app.ts](../apps/bridge-server/src/app.ts)

Current bridge responsibilities:

- load bridge config and backend config
- create OpenClaw client
- create credential provider registry
- create backend discovery + selection services
- assemble runtime and executors
- register HTTP routes

Current route groups:

- [apps/bridge-server/src/routes/actions.ts](../apps/bridge-server/src/routes/actions.ts)
- [apps/bridge-server/src/routes/backends.ts](../apps/bridge-server/src/routes/backends.ts)
- [apps/bridge-server/src/routes/backend-config.ts](../apps/bridge-server/src/routes/backend-config.ts)
- [apps/bridge-server/src/routes/capabilities.ts](../apps/bridge-server/src/routes/capabilities.ts)
- [apps/bridge-server/src/routes/health.ts](../apps/bridge-server/src/routes/health.ts)

## 8. Backend Selection Layer

Bridge-side backend system lives under:

- [apps/bridge-server/src/backends](../apps/bridge-server/src/backends)

Current built-in backend plugins:

- `openclaw`
- `openai_compatible`

Current public backend routes:

- `GET /v1/backends`
- `POST /v1/backends/configure`

Current capabilities route adds:

- `backend_summary`

Current selection policy is owned by bridge, not by the macOS layer.

## 9. Runtime and Routing

Runtime entry:

- [packages/action-runtime/src/runtime.ts](../packages/action-runtime/src/runtime.ts)

Current routing order inside runtime:

1. built-in action definition resolution
2. backend selection routing
3. object-aware routing
4. public text routing
5. executor dispatch

### 9.1 BackendSelectionRouter

File:

- [packages/action-runtime/src/routing/backend-selection-router.ts](../packages/action-runtime/src/routing/backend-selection-router.ts)

Current behavior:

- if selected backend is `openai_compatible`, route `ask_claw` / `summarize` / `explain` / `rewrite` to `model`
- `send_to_claw` remains OpenClaw-only and throws structured backend unsupported error otherwise
- if selected backend is `openclaw`, preserve normal runner or `openclaw_responses` when fast path is available

### 9.2 ObjectAwareActionRouter

This layer preserves object-aware behavior for files, folders, images, screenshots, and mixed selections.

### 9.3 PublicTextActionRouter

This remains the fast-path selector for eligible pure-text `summarize` / `explain`.

Important current rule:

- `openclaw_responses` is still an internal strategy, not a user-facing backend

## 10. Executor Layer

Current executors are still the final execution boundary:

- `OpenClawExecutor`
- `OpenClawResponsesExecutor`
- `ModelExecutor`

The executor registry role has not changed. It is still only a `runner -> executor` lookup.

## 11. Screenshot Flow

Screenshot path is separate at entry and shared downstream.

```text
screenshot hotkey / menu bar
  -> captureScreenshot()
  -> buildPathSelection([path])
  -> buildSelectionContext(... captureMode: screenshot)
  -> ask_claw flow or direct action flow
  -> bridge
  -> runtime
```

So screenshot is not a Finder/text entry mechanism, but it already reuses the same selection-context and bridge spine.

## 12. Setup / Settings Layer

Current setup flow files:

- [apps/macos-integration/src/setup-flow.ts](../apps/macos-integration/src/setup-flow.ts)
- [apps/macos-integration/src/setup-state.ts](../apps/macos-integration/src/setup-state.ts)
- [apps/macos-integration/swift/RightOnClawSetupPanel.swift](../apps/macos-integration/swift/RightOnClawSetupPanel.swift)

Current behavior:

- startup can auto-check `/v1/backends`
- setup panel can configure `openai_compatible`
- manual settings entry is exposed from menu bar / CLI
- setup consumes backend state; it does not own backend orchestration

## 13. Current Stable Boundaries

These parts are already the real architecture boundaries and should be treated as existing system seams:

- macOS entry mechanisms -> `workflow-cli`
- `workflow-cli` -> `workflow-runner`
- selection normalization -> `selection_context`
- AskPanel session protocol
- `bridge-client` -> bridge routes
- bridge backend discovery/selection
- runtime router chain
- executor registry

## 14. Current Real Change Hotspots

From current code structure, future entry-layer changes are most likely to land in:

- [apps/macos-integration/src/workflow-template.ts](../apps/macos-integration/src/workflow-template.ts)
- [apps/macos-integration/src/install.ts](../apps/macos-integration/src/install.ts)
- [apps/macos-integration/finder-sync](../apps/macos-integration/finder-sync)
- [apps/macos-integration/src/install-finder-sync.ts](../apps/macos-integration/src/install-finder-sync.ts)
- [apps/macos-integration/src/menubar.ts](../apps/macos-integration/src/menubar.ts)

While these layers already serve as relatively stable reuse boundaries:

- [apps/bridge-server/src](../apps/bridge-server/src)
- [packages/action-runtime/src](../packages/action-runtime/src)
- [packages/core/src](../packages/core/src)
- [packages/credential-layer/src](../packages/credential-layer/src)
- [packages/openclaw-client/src](../packages/openclaw-client/src)
