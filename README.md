# MangaReader Extensions

A content-only MangaReader Extension API 1.0/1.1 repository containing the SDK, publisher CLI, signed catalog, and documentation site.

The catalog contains 13 provenance-pinned content ports. Comix, LNori, and RoyalRoad use API 1.1; the remaining packages retain API 1.0 compatibility. Every entry remains `approvalRequired`. Tracker and theme extension kinds are not accepted by this catalog.

## Commands

```sh
npm ci
npm run check
npm test
npm run bundle
npm run docs:build
npm run publish:dry-run
```

Create a new content-extension scaffold with:

```sh
node packages/cli/bin/mr-ext.mjs new --id ExampleSource --name "Example Source"
```

The catalog is not bundled into MangaReader. Add its repository URL explicitly from the docs site or MangaReader's repository flow. Package activation still requires the publisher signature and MangaReader approval.

See [CONTRIBUTING.md](CONTRIBUTING.md), [EXTENSION_REVIEW_POLICY.md](EXTENSION_REVIEW_POLICY.md), and [SECURITY.md](SECURITY.md).
