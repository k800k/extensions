# MangaReader Extensions

An open-source MangaReader Extension API 1.0/1.1 repository containing the SDK, publisher CLI, package catalog, and documentation site.

The catalog contains 17 content packages and two API 1.1 tracker packages: AniList and MyAnimeList. Catalog entries include version, language, content rating, package source, license, and provenance links.

## Commands

```sh
npm ci
npm run check
npm test
npm run bundle
npm run docs:build
npm run publish:dry-run
```

Create a content or tracker scaffold with:

```sh
node packages/cli/bin/mr-ext.mjs new --id ExampleSource --name "Example Source"
node packages/cli/bin/mr-ext.mjs new --kind tracker --id ExampleTracker --name "Example Tracker"
```

The catalog is not bundled into MangaReader. Add its repository URL from the documentation site or MangaReader's repository flow, then use Get or Update for individual extensions.

See [CONTRIBUTING.md](CONTRIBUTING.md), [EXTENSION_REVIEW_POLICY.md](EXTENSION_REVIEW_POLICY.md), and [SECURITY.md](SECURITY.md).
