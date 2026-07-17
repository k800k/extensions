# MangaReader Extensions

An open-source MangaReader Extension API 1.0/1.1 repository containing the SDK, publisher CLI, package catalog, and documentation site.

The catalog contains 15 content packages and two API 1.1 tracker packages: AniList and MyAnimeList. Every catalog entry links to its source and source revision. Packages are not safety-reviewed, verified, approved, or endorsed by MangaReader; inspect the code and declared access before installing.

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

The catalog is not bundled into MangaReader. Add its repository URL explicitly from the docs site or MangaReader's repository flow. MangaReader confirms first installation and asks again only when an update expands declared hosts, capabilities, permissions, or authentication modes.

SHA-256 checksums confirm that a downloaded artifact matches the catalog. Schema, API, operation, and load checks confirm compatibility. Neither is a safety certification.

See [CONTRIBUTING.md](CONTRIBUTING.md), [EXTENSION_REVIEW_POLICY.md](EXTENSION_REVIEW_POLICY.md), and [SECURITY.md](SECURITY.md).
