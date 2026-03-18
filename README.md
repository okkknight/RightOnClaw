# RightOnClaw

RightOnClaw is a local macOS AI action layer built around one simple idea:

**select something, then ask Claw.**

AI should live inside the OS, not inside another window.

It sits between macOS entry points and a local AI bridge, so text selections, Finder items, and screenshots can all flow into the same `ask_claw` / `summarize` / `explain` / `rewrite` / `send_to_claw` pipeline.

The project is:

- local-first
- macOS-native on the UI side
- OpenClaw-first, but not OpenClaw-only
- intentionally incremental rather than a big framework rewrite

## What Works Today

Right now, RightOnClaw already has:

- Finder file/folder entry through Automator Services
- text-selection entry for apps that support macOS `NSServices`
- screenshot capture flow
- a single-window AskPanel for `ask_claw`
- backend discovery and selection via the local bridge
- fallback support for an API-key backend when OpenClaw is unavailable
- a Finder Sync enhancement-layer PoC for a more product-like Finder entry

In practice, the main flow is:

```text
Select or capture something
  -> Ask Claw
  -> native AskPanel
  -> local bridge
  -> runtime / executor
  -> stream the answer back into the same window
```

## Repository Layout

- `apps/macos-integration`
  - macOS workflows, menu bar, hotkeys, AskPanel, popup UI, screenshot capture, Finder Sync PoC
- `apps/bridge-server`
  - local HTTP bridge under `/v1`
- `packages/action-runtime`
  - action definitions, routing, executor dispatch
- `packages/core`
  - config, errors, backend config/types, shared helpers
- `packages/credential-layer`
  - credential provider registry
- `packages/openclaw-client`
  - OpenClaw client contract and probe helpers

If you want a current architecture walkthrough, start here:

- [docs/PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md)
- [docs/RIGHTONCLAW_ARCHITECTURE.md](./docs/RIGHTONCLAW_ARCHITECTURE.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [docs/LOCAL_SETUP.md](./docs/LOCAL_SETUP.md)
- [docs/MACOS_SETUP.md](./docs/MACOS_SETUP.md)
- [docs/REPO_PUBLISHING.md](./docs/REPO_PUBLISHING.md)

## Quick Start

### 1. Install dependencies

```bash
corepack pnpm install
```

If you want a starting point for local config, copy:

```bash
cp .env.example .env
```

### 2. Build the workspace

```bash
corepack pnpm build
```

### 3. Start the local bridge

```bash
corepack pnpm dev
```

By default the bridge listens on:

```text
http://127.0.0.1:48765/v1
```

## macOS Integration

### Install Services

This is still the broad-coverage base layer for Finder and text selection.

```bash
corepack pnpm --filter @rightonclaw/macos-integration build
corepack pnpm --filter @rightonclaw/macos-integration install-workflows
```

Current generated workflows:

- `RightOnClaw Text.workflow`
- `RightOnClaw Files.workflow`
- `Ask Claw.workflow`

### Launch the menu bar app

```bash
node apps/macos-integration/dist/workflow-cli.js menu-bar
```

That gives you:

- Ask Claw hotkey
- screenshot hotkey
- setup/settings entry

### Install the Finder Sync enhancement PoC

This is Finder-only. It does **not** replace the existing Services layer.

```bash
corepack pnpm --filter @rightonclaw/macos-integration build
corepack pnpm --filter @rightonclaw/macos-integration build-finder-sync
corepack pnpm --filter @rightonclaw/macos-integration install-finder-sync
```

After install, enable the extension in macOS Finder Extensions settings if needed, then restart Finder.

## Backends

RightOnClaw currently exposes two user-facing backends:

- `openclaw`
- `openai_compatible`

The bridge decides which backend is active and exposes that state through:

- `GET /v1/backends`
- `POST /v1/backends/configure`
- `GET /v1/capabilities`

Important behavior:

- if OpenClaw is installed and healthy, RightOnClaw prefers it
- if OpenClaw is unavailable, an API-key backend can be configured as fallback
- `send_to_claw` remains OpenClaw-only in the current MVP

## Useful Commands

```bash
# build everything
corepack pnpm build

# run tests
corepack pnpm test

# typecheck
corepack pnpm typecheck

# start bridge only
corepack pnpm dev

# run OpenClaw smoke checks
corepack pnpm smoke:openclaw

# run experimental runtime smoke checks
corepack pnpm smoke:experimental
```

## Important Environment Variables

You do not need every env var on day one. These are the main ones.

### Bridge

- `RIGHTONCLAW_HOST` default `127.0.0.1`
- `RIGHTONCLAW_PORT` default `48765`
- `RIGHTONCLAW_BODY_LIMIT_BYTES`
- `RIGHTONCLAW_REQUEST_TIMEOUT_MS`
- `RIGHTONCLAW_LOCAL_TOKEN`

### OpenClaw

- `RIGHTONCLAW_OPENCLAW_CLIENT_MODE`
- `RIGHTONCLAW_OPENCLAW_BASE_URL`
- `RIGHTONCLAW_OPENCLAW_GATEWAY_URL`
- `RIGHTONCLAW_OPENCLAW_GATEWAY_TOKEN`
- `RIGHTONCLAW_OPENCLAW_GATEWAY_PASSWORD`
- `RIGHTONCLAW_OPENCLAW_AGENT_ID`
- `RIGHTONCLAW_OPENCLAW_RESPONSES_PATH`
- `RIGHTONCLAW_OPENCLAW_REQUEST_TIMEOUT_MS`

### Fast path

- `RIGHTONCLAW_SUMMARIZE_FAST_PATH`
- `RIGHTONCLAW_EXPLAIN_FAST_PATH`
- `RIGHTONCLAW_FAST_PATH_MAX_INPUT_LENGTH`

### API-key backend / model path

- `RIGHTONCLAW_MODEL_API_KEY`
- `RIGHTONCLAW_MODEL_BASE_URL`
- `RIGHTONCLAW_MODEL_NAME`

## Endpoints

Current public bridge endpoints:

- `GET /v1/health`
- `GET /v1/capabilities`
- `GET /v1/backends`
- `POST /v1/backends/configure`
- `POST /v1/actions/ask-claw`
- `POST /v1/actions/ask-claw/stream`
- `POST /v1/actions/send-to-claw`
- `POST /v1/actions/summarize`
- `POST /v1/actions/summarize/stream`
- `POST /v1/actions/explain`
- `POST /v1/actions/explain/stream`
- `POST /v1/actions/rewrite`



RightOnClaw works best with **OpenClaw**, but it does not require it.

If OpenClaw is installed, RightOnClaw connects automatically.If not, you can configure an **API key backend during the first‑run setup** and start using it immediately.

This is the first public version and feedback is very welcome.
