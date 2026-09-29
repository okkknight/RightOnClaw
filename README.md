# RightOnClaw

RightOnClaw is a local AI action layer for macOS: select text, choose files in Finder, or capture a screenshot, then ask Claw without first packaging that context into a separate chat.

The selection goes through a local bridge and comes back in a native AskPanel. `ask_claw` is the main flow, with a conversational window for follow-up questions; summarize, explain, rewrite, and send to Claw are direct actions for the same captured context. Services give it broad text and Finder coverage, while the menu bar, hotkeys, screenshot capture, and Finder Sync extension make the entry point feel native where they fit.

The macOS layer stays focused on capture and delivery. OpenClaw is the preferred backend, with a configured OpenAI-compatible backend also supported; `send_to_claw` needs OpenClaw.

## Things worth trying

- Select text in an app that supports macOS Services and send it to Ask Claw.
- Select files or folders in Finder and pass their context to the same action flow.
- Capture a screenshot from the menu bar or hotkey flow.
- Read a streamed answer in AskPanel; use the result popup for direct actions.
- Try the optional Finder Sync integration for a Finder toolbar and context-menu entry.

macOS Services are the most dependable way in. Selection behavior differs between Mac apps, and the Finder Sync integration is still a proof of concept.

## Set it up locally

You need macOS, Node.js 20+, Corepack/pnpm, and Xcode Command Line Tools. OpenClaw is optional if you plan to configure an API-key backend.

```bash
corepack pnpm install
cp .env.example .env
corepack pnpm build
corepack pnpm dev
```

The local bridge listens on `http://127.0.0.1:48765/v1` by default. In another terminal, build and install the macOS Services:

```bash
corepack pnpm --filter @rightonclaw/macos-integration build
corepack pnpm --filter @rightonclaw/macos-integration install-workflows
```

You can also start the menu bar app with:

```bash
node apps/macos-integration/dist/workflow-cli.js menu-bar
```

Then select some text and look for the RightOnClaw Service in the app's Services menu. On first use, configure a backend if the setup panel asks for one. [Local setup](docs/LOCAL_SETUP.md) covers dependencies and bridge configuration; [macOS setup](docs/MACOS_SETUP.md) covers Services, permissions, hotkeys, and the optional Finder Sync extension.

## How it fits together

```text
macOS selection or screenshot
  → Service / menu bar entry
  → local bridge
  → OpenClaw or configured API backend
  → native result window
```

`apps/macos-integration/` owns capture and native UI. `apps/bridge-server/` exposes the local `/v1` API; `packages/action-runtime/` routes actions to the active backend. The bridge binds to `127.0.0.1` by default. Keep API keys and local tokens out of Git.

For the full package map and current behavior, see the [project context](docs/PROJECT_CONTEXT.md) and [architecture notes](docs/RIGHTONCLAW_ARCHITECTURE.md). Contributions are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Development commands

```bash
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
```

The bridge also exposes `GET /v1/health`, `GET /v1/capabilities`, and `GET /v1/backends` for local inspection. Action and configuration endpoints are described in the architecture docs.

## License

[MIT](LICENSE).
