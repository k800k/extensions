<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 MangaReader Extension Contributors -->

# Development

This monorepo contains the MangaReader content/tracker Extension API 1.0/1.1 SDK, package CLI, catalog, and VitePress documentation app. The catalog contains 15 content packages and two tracker packages. Theme extension APIs are unsupported.

## Repository layout

```text
extensions/
├── content/          # Content-extension directories
└── tracker/          # Tracker-extension directories
packages/
├── cli/              # Validation, bundling, and publishing commands
└── sdk/              # MangaReader content/tracker API types and helpers
dist/v1/stable/
├── catalog.json      # Public catalog consumed by this website
├── icons/            # Published extension icons
└── packages/         # Deterministic .mrx artifacts
website/              # VitePress documentation app
```

Create content or tracker scaffolds with:

```sh
node packages/cli/bin/mr-ext.mjs new --id ExampleSource --name "Example Source"
node packages/cli/bin/mr-ext.mjs new --kind tracker --id ExampleTracker --name "Example Tracker"
```

The CLI rejects `--kind theme`. Never commit OAuth client secrets or user tokens. Public OAuth client IDs are injected into the MangaReader app build, not package code.

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

- `check` validates content/tracker layout and package contracts.
- `test` verifies SDK, tracker runtime, and generated-catalog behavior.
- `bundle` produces deterministic extension packages and catalog artifacts.
- `docs:build` produces the local documentation site.
- `publish:dry-run` checks package sizes, hashes, and compatibility metadata without releasing anything.

## Publishing

The generated `dist/v1/stable/catalog.json` file is the website's built-in catalog source. Publishing must preserve stable unique IDs, exact source revisions, package hashes, declared permissions and HTTPS hosts, and audit records. Checksums establish artifact consistency only; compatibility validation does not certify safety.

The Pages workflow rebuilds packages with `MR_SOURCE_REVISION` set to the full deployment commit SHA, so every published source link is a GitHub permalink to the code used for that deployment. Local checked-in artifacts use `main` until the release workflow replaces that development reference.

See the repository [Review Policy](https://github.com/k800k/extensions/blob/main/EXTENSION_REVIEW_POLICY.md), [Contributing Guide](https://github.com/k800k/extensions/blob/main/CONTRIBUTING.md), and [Security Policy](https://github.com/k800k/extensions/blob/main/SECURITY.md) before proposing a release.
