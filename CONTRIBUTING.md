# Contributing to RightOnClaw

Thanks for taking a look at RightOnClaw.

This project already has a working spine. The best contributions usually improve it by extending what's here, not by replacing major layers.

## Before You Change Anything

Read these first:

1. [README.md](./README.md)
2. [docs/PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md)
3. [docs/RIGHTONCLAW_ARCHITECTURE.md](./docs/RIGHTONCLAW_ARCHITECTURE.md)

If you are touching the main request path, also read:

- [apps/macos-integration/src/workflow-cli.ts](./apps/macos-integration/src/workflow-cli.ts)
- [apps/macos-integration/src/workflow-runner.ts](./apps/macos-integration/src/workflow-runner.ts)
- [apps/bridge-server/src/app.ts](./apps/bridge-server/src/app.ts)
- [packages/action-runtime/src/runtime.ts](./packages/action-runtime/src/runtime.ts)

## What RightOnClaw Is Optimizing For

The project is trying to be:

- local-first
- macOS-native
- additive rather than disruptive
- OpenClaw-first, but not OpenClaw-only

That usually means:

- keep the macOS layer thin
- keep the bridge API stable
- keep runtime/executor boundaries intact
- prefer new routers, adapters, helpers, and entry layers over large rewrites

## Current Stable Boundaries

Please treat these as real architecture seams unless there is a very strong reason not to:

- `workflow-cli -> workflow-runner`
- `selection -> selection_context`
- AskPanel session protocol
- `bridge-client -> bridge-server`
- backend discovery/selection owned by the bridge
- `ActionRuntime -> routers -> executors`
- executor registry as a `runner -> executor` lookup only

## What Not to Break

If you change behavior in these areas, be deliberate:

- existing Finder and text Services
- screenshot flow
- AskPanel single-window `ask_claw` flow
- OpenClaw-first compatibility
- summarize/explain fast-path behavior
- public bridge request/response shapes

## Development Commands

From the repo root:

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm test
corepack pnpm typecheck
```

Useful package-level commands:

```bash
corepack pnpm --filter @rightonclaw/macos-integration build
corepack pnpm --filter @rightonclaw/macos-integration test

corepack pnpm --filter @rightonclaw/bridge-server test
corepack pnpm --filter @rightonclaw/action-runtime test
```

## macOS Integration Notes

RightOnClaw currently uses multiple macOS entry layers:

- Automator Services
- an Automator Quick Action workflow bundle
- Finder Sync enhancement PoC
- menu bar + hotkeys
- screenshot capture flow

These are not all the same thing, and they do not all solve the same problem.

If you are changing entry behavior, verify which layer you are actually touching before you edit code.

## Finder Sync Notes

Finder Sync is a Finder-only enhancement layer.

It currently exists to make Finder entry feel more product-like. It does **not** replace:

- text Services
- screenshot entry
- the shared `workflow-cli -> workflow-runner -> AskPanel -> bridge` chain

## Backend Notes

The bridge owns backend discovery and selection.

Current user-facing backends:

- `openclaw`
- `openai_compatible`

Internal execution strategies remain:

- `openclaw`
- `openclaw_responses`
- `model`

If you are working on backend behavior, start in:

- [apps/bridge-server/src/backends](./apps/bridge-server/src/backends)
- [packages/action-runtime/src/routing/backend-selection-router.ts](./packages/action-runtime/src/routing/backend-selection-router.ts)

## UI Notes

The native UI is AppKit-based and already has a shared design system.

If you touch AskPanel, Popup, StreamPopup, SetupPanel, HUD, or MenuBar, prefer reusing:

- [apps/macos-integration/swift/RightOnClawDesignSystem.swift](./apps/macos-integration/swift/RightOnClawDesignSystem.swift)
- [apps/macos-integration/swift/RightOnClawWindowChrome.swift](./apps/macos-integration/swift/RightOnClawWindowChrome.swift)

## Tests

If you touch behavior, update or add tests close to that layer.

Good starting points:

- [apps/macos-integration/test/workflow-template.test.cjs](./apps/macos-integration/test/workflow-template.test.cjs)
- [apps/macos-integration/test/workflow-runner.test.cjs](./apps/macos-integration/test/workflow-runner.test.cjs)
- [apps/macos-integration/test/ask-claw-ui.test.cjs](./apps/macos-integration/test/ask-claw-ui.test.cjs)
- [apps/bridge-server/test/actions-route.test.cjs](./apps/bridge-server/test/actions-route.test.cjs)
- [packages/action-runtime/test/dispatch-action.test.cjs](./packages/action-runtime/test/dispatch-action.test.cjs)

## Before Opening a PR

At minimum:

1. Build the workspace.
2. Run the relevant tests.
3. Update docs if behavior or architecture changed.
4. Make sure you did not leave local absolute paths, tokens, or machine-specific setup in tracked files.

## Style

A good RightOnClaw change usually feels like:

- smaller than the first draft
- explicit about boundaries
- easy to explain from entry point to executor
- careful about compatibility

If a change starts feeling like a rewrite, it probably needs another pass.
