# Publishing RightOnClaw as a Standalone Repository

Right now this project lives inside a larger local workspace, but it is already structured like its own pnpm workspace.

That means you can publish **this directory** as a standalone repository without redesigning the package structure.

## What already works in standalone form

This folder already contains:

- root `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `apps/*`
- `packages/*`

Internal dependencies use `workspace:*`, which is correct for a standalone monorepo rooted at this folder.

## Recommended way to split it out

Create a clean copy of this directory as the new repo root:

```bash
cd /path/to/parent/of-this-folder
cp -R rightonclaw /path/to/rightonclaw-public
cd /path/to/rightonclaw-public
git init
git add .
git commit -m "Initial import"
```

Then add the remote:

```bash
git remote add origin git@github.com:<your-name>/rightonclaw.git
git branch -M main
git push -u origin main
```

## What to double-check before pushing

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `.env.example`
- `.gitignore`
- `docs/*.md`
- `.github/workflows/ci.yml`

## What not to carry over accidentally

Do not copy machine-local state such as:

- `dist/`
- `.DS_Store`
- `node_modules/`
- local `.env`
- installed `.app` / `.appex` / `.workflow` artifacts
- launchd plists from `~/Library/LaunchAgents`
- local archives or snapshot folders outside this project root

The current `.gitignore` already covers most of the important local artifacts.

## What this repo still will not magically solve

Splitting it into its own GitHub repo does not automatically:

- package the macOS app for end users
- sign / notarize Finder Sync for distribution
- install workflows or Finder extensions for contributors

It only gives you a clean standalone source repository.

## Current practical recommendation

Treat the standalone repo as:

- source of truth for code
- docs + CI + tests
- developer build instructions

Then handle signed distribution separately later if needed.
