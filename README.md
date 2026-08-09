# manko Extensions

An open-source manko Extension API 1.0/1.1 repository containing the SDK, `manko-ext` publisher CLI, direct-JavaScript catalog, and documentation site.

The catalog contains 17 content extensions and two API 1.1 tracker extensions: AniList and MyAnimeList. Catalog entries include version, language, content rating, script size and integrity, source, license, and provenance links.

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
node packages/cli/bin/manko-ext.mjs new --id ExampleSource --name "Example Source"
node packages/cli/bin/manko-ext.mjs new --kind tracker --id ExampleTracker --name "Example Tracker"
```

The catalog is not bundled into manko. Add its repository URL from the documentation site or manko's repository flow, then use Get or Update for individual extensions.

See [CONTRIBUTING.md](CONTRIBUTING.md), [EXTENSION_REVIEW_POLICY.md](EXTENSION_REVIEW_POLICY.md), and [SECURITY.md](SECURITY.md).
