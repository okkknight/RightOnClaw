# Local Setup

This document is the shortest path to getting RightOnClaw running locally as a developer.

## Prerequisites

- macOS
- Node.js 20+
- Corepack enabled
- Xcode Command Line Tools
- `swiftc` available from `xcrun`

Check the basics:

```bash
node -v
corepack --version
xcrun swiftc --version
```

## 1. Install dependencies

From the repo root:

```bash
corepack pnpm install
```

If you want a local env file:

```bash
cp .env.example .env
```

## 2. Build everything

```bash
corepack pnpm build
```

This builds:

- TypeScript packages
- bridge server
- macOS integration
- native Swift binaries used by AskPanel / popup / setup / menu bar

## 3. Start the bridge

```bash
corepack pnpm dev
```

By default it serves:

```text
http://127.0.0.1:48765/v1
```

Useful quick checks:

```bash
curl http://127.0.0.1:48765/v1/health
curl http://127.0.0.1:48765/v1/capabilities
curl http://127.0.0.1:48765/v1/backends
```

## 4. Run tests

```bash
corepack pnpm test
corepack pnpm typecheck
```

If you only want the main macOS package:

```bash
corepack pnpm --filter @rightonclaw/macos-integration build
corepack pnpm --filter @rightonclaw/macos-integration test
```

## 5. Optional smoke scripts

```bash
corepack pnpm smoke:experimental
corepack pnpm smoke:openclaw
```

The OpenClaw smoke script assumes you already have a working OpenClaw setup and appropriate local env vars.

## 6. Common local entry points

### Start the menu bar app

```bash
node apps/macos-integration/dist/workflow-cli.js menu-bar
```

### Open setup/settings manually

```bash
node apps/macos-integration/dist/workflow-cli.js setup
```

### Trigger screenshot flow from CLI

```bash
node apps/macos-integration/dist/workflow-cli.js screenshot
```

## 7. Important project files

If you are new to the repo, read these next:

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
- [RIGHTONCLAW_ARCHITECTURE.md](./RIGHTONCLAW_ARCHITECTURE.md)
- [../CONTRIBUTING.md](../CONTRIBUTING.md)

## 8. Typical failure points

- Bridge is not running
  - `pnpm dev` first
- Native Swift helper binaries are missing
  - rerun `corepack pnpm build`
- Finder/menu-bar behavior seems stale
  - rebuild macOS integration and restart the relevant macOS process
- OpenClaw backend is unavailable
  - inspect `GET /v1/backends`
  - use setup/settings to configure API-key fallback if needed
