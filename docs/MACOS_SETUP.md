# macOS Setup

This document is specifically about enabling the macOS-facing parts of RightOnClaw.

It covers:

- Services
- menu bar + hotkeys
- Finder Sync enhancement layer
- screenshot flow prerequisites

## 1. Build the macOS package

```bash
corepack pnpm --filter @rightonclaw/macos-integration build
```

## 2. Install Finder/Text Services

```bash
corepack pnpm --filter @rightonclaw/macos-integration install-workflows
```

This installs workflow bundles into:

```text
~/Library/Services
```

Current workflows:

- `RightOnClaw Text.workflow`
- `RightOnClaw Files.workflow`
- `Ask Claw.workflow`

After install:

- restart Finder if needed
- in some cases, toggle the related entries in macOS Services settings so the menu refreshes cleanly

## 3. Launch the menu bar app

```bash
node apps/macos-integration/dist/workflow-cli.js menu-bar
```

Current hotkeys are managed from the native menu bar binary.

Common defaults in the local setup have been:

- Ask Claw: `cmd+shift+c`
- Screenshot: `cmd+shift+x`

## 4. Finder Sync enhancement layer PoC

This is Finder-only and is meant to sit on top of the existing Service layer.

### Build it

```bash
corepack pnpm --filter @rightonclaw/macos-integration build-finder-sync
```

### Install it

```bash
corepack pnpm --filter @rightonclaw/macos-integration install-finder-sync
```

### Enable it

Go to:

```text
System Settings -> Privacy & Security -> Extensions -> Finder Extensions
```

Enable the RightOnClaw Finder extension, then restart Finder:

```bash
killall Finder
```

### What it should add

- Finder toolbar `Ask Claw`
- Finder right-click contextual `Ask Claw`

This Finder Sync layer still routes into the existing chain:

```text
Finder Sync -> host app -> workflow-cli run ask_claw paths -> workflow-runner -> AskPanel -> bridge
```

## 5. Screenshot prerequisites

Screenshot capture is separate from right-click entry and depends on macOS screen capture permissions.

If screenshot capture fails:

- check macOS Screen Recording permissions
- retry the screenshot flow

Pressing `Esc` during screenshot capture should cancel cleanly.

## 6. Setup / backend configuration

You can open setup/settings manually:

```bash
node apps/macos-integration/dist/workflow-cli.js setup
```

The setup UI reads backend state from:

- `GET /v1/backends`

and can configure:

- `openai_compatible`

OpenClaw remains the preferred backend when healthy.

## 7. If something looks wrong

Quick sanity checks:

```bash
curl http://127.0.0.1:48765/v1/health
curl http://127.0.0.1:48765/v1/backends
```

Then verify:

- Swift binaries were rebuilt
- Services are installed
- Finder extension is enabled
- menu bar app is actually running
