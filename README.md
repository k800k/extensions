# MangaReader Extensions

An external, Apache-2.0 monorepo for MangaReader Extension API v1. It contains the SDK, dependency-free publisher CLI, static multi-select catalog, and 68 extension directories: 66 content sources plus AniList and MangaUpdates tracker directories.

The catalog is **not bundled or advertised inside MangaReader**. Add it explicitly from the website or paste its repository URL into Add Source → Repository.

All catalog entries begin as `approvalRequired`. Generated source files are MangaReader-native scaffolds and cannot activate until their specification, rights/privacy review, live contract suite, publisher signature, and offline MangaReader approval are complete.

## Commands

```sh
npm ci
npm run check
npm test
npm run bundle
npm run publish:dry-run
node packages/cli/bin/mr-ext.mjs serve
```

Publisher keys are external files or encrypted CI secrets. Never commit a private key. MangaReader approval keys are offline and are never available to this repository or CI.

See [EXTENSION_REVIEW_POLICY.md](EXTENSION_REVIEW_POLICY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md).
