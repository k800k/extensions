<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 MangaReader Extension Contributors -->

# Development

This monorepo contains the MangaReader content-extension API v1 SDK, publisher CLI, signed catalog, and VitePress documentation app. The built-in catalog is empty. Tracker and theme extension APIs are intentionally unsupported.

## Repository layout

```text
extensions/
└── content/          # Reviewed content-extension directories
packages/
├── cli/              # Validation, bundling, and publishing commands
└── sdk/              # MangaReader content-extension API v1 types and helpers
dist/v1/stable/
├── catalog.json      # Public catalog consumed by this website
├── icons/            # Published content-extension icons
└── packages/         # Deterministic .mrx artifacts
website/              # VitePress documentation app
```

Create a content scaffold with:

```sh
node packages/cli/bin/mr-ext.mjs new --id ExampleSource --name "Example Source"
```

The CLI rejects `--kind tracker` and `--kind theme`. Never place publisher private keys or offline MangaReader approval keys in the repository.

## Validation workflow

From the repository root:

```sh
npm ci
npm run check
npm test
npm run bundle
npm run docs:build
npm run publish:dry-run
```

- `check` validates the content-only directory layout and package contracts.
- `test` verifies SDK and generated-catalog behavior.
- `bundle` produces deterministic content packages and empty or populated catalog artifacts.
- `docs:build` produces the local documentation site.
- `publish:dry-run` checks the publisher signature and package hashes without releasing anything.

## Publishing

The generated `dist/v1/stable/catalog.json` file is the website's built-in catalog source. Publishing must preserve stable unique IDs, package hashes, declared permissions and HTTPS hosts, rights-review records, and offline MangaReader approval boundaries.

See the repository [Review Policy](https://github.com/k800k/extensions/blob/main/EXTENSION_REVIEW_POLICY.md), [Contributing Guide](https://github.com/k800k/extensions/blob/main/CONTRIBUTING.md), and [Security Policy](https://github.com/k800k/extensions/blob/main/SECURITY.md) before proposing a release.
