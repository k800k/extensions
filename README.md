# MangaReader Extensions

A content-only MangaReader Extension API v1 repository containing the SDK, publisher CLI, signed catalog, and documentation site.

The built-in catalog is currently empty. All previously created content and tracker extensions have been removed. Tracker and theme extension kinds are not accepted by the SDK, CLI, generated manifest, or website catalog loader. Ordinary website and reader color themes are unrelated and remain available.

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
