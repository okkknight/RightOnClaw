# Repository and distribution

RightOnClaw is maintained in its own repository at <https://github.com/okkknight/RightOnClaw>. Its source code is available under the root [MIT license](../LICENSE).

The repository contains the pnpm workspace, macOS integration source, local bridge, documentation and CI. Local credentials belong in `.env`, which Git ignores; `.env.example` contains only example settings. Build outputs, installed apps and workflows are also ignored.

Publishing the source repository does not create a signed macOS app or Finder Sync extension. Packaging, signing and notarization are separate release steps. See [local setup](LOCAL_SETUP.md) and [macOS setup](MACOS_SETUP.md) for development instructions.
