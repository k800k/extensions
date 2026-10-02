<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 manko Extension Contributors -->

# Development

This monorepo contains the manko content/tracker Extension API 1.0/1.1 SDK, `manko-ext` CLI, catalog, and VitePress documentation app. The catalog contains 17 content extensions and two tracker extensions. Theme extension APIs are unsupported.

## Repository layout

```text
extensions/
├── content/          # Content-extension directories
└── tracker/          # Tracker-extension directories
packages/
├── cli/              # Validation, bundling, and publishing commands
└── sdk/              # manko content/tracker API types and helpers
dist/v1/stable/
├── catalog.json      # Public catalog consumed by this website
├── versioning.json   # Canonical repository manifest consumed by manko
├── icons/            # Published extension icons
└── sources/          # Versioned direct JavaScript outputs
website/              # VitePress documentation app
```

Create content or tracker scaffolds with:

```sh
node packages/cli/bin/manko-ext.mjs new --id ExampleSource --name "Example Source"
node packages/cli/bin/manko-ext.mjs new --kind tracker --id ExampleTracker --name "Example Tracker"
```

The CLI rejects `--kind theme`. Never commit OAuth client secrets or user tokens. Public OAuth client IDs are injected into the manko app build, not package code.

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

- `check` validates content/tracker layout and extension contracts.
- `test` verifies SDK, tracker runtime, and generated-catalog behavior.
- `bundle` produces deterministic versioned JavaScript, `versioning.json`, and catalog artifacts.
- `docs:build` produces the local documentation site.
- `publish:dry-run` checks generated script hashes, sizes, and compatibility metadata without releasing anything.

## Publishing

The generated `dist/v1/stable/versioning.json` file is the canonical repository manifest, while `catalog.json` enriches the website. Publishing must preserve stable unique IDs, increment extension versions when executable bytes change, and retain source revisions, licenses, provenance, and compatibility metadata.

The Pages workflow rebuilds scripts with `MANKO_SOURCE_REVISION` set to the full deployment commit SHA, so every published source link is a GitHub permalink to the code used for that deployment. Local checked-in artifacts use `main` until the release workflow replaces that development reference.

See the repository [Publication Policy](https://github.com/k800k/extensions/blob/main/EXTENSION_REVIEW_POLICY.md), [Contributing Guide](https://github.com/k800k/extensions/blob/main/CONTRIBUTING.md), and [Security Policy](https://github.com/k800k/extensions/blob/main/SECURITY.md) before proposing a release.

## Source search metadata

Content sources can add native operator autocomplete, sorting, persistent per-source exclusions, and tappable detail metadata without changing their API version. Declare the `filters` capability and return a bounded configuration from `searchFilters()`:

```js
searchFilters() {
  return {
    id: "example-search",
    title: "Example Search",
    fields: [{
      id: "tag",
      title: "Tag",
      queryPrefix: "tag:",
      placeholder: "Filter by tag",
      supportsExclusion: true,
      options: []
    }],
    sortOptions: [
      { id: "newest", title: "Newest" },
      { id: "popular", title: "Popular" }
    ],
    defaultSortID: "newest"
  };
},

async searchSuggestions({ fieldID, query, limit = 20 }) {
  return lookup(fieldID, query)
    .slice(0, Math.min(limit, 30))
    .map(value => ({ fieldID, value, title: value }));
}
```

manko passes `query`, `selections`, compiled `filters`, `sort`, and `cursor` to `search()`, and passes the same structured selections, filters, and sort to `discover()`. A selection has `fieldID`, `value`, `title`, and a polarity of `include` or `exclude`. Preserve unrecognized raw query text and combine every input deterministically before applying the cursor. Sources must enforce exclusions remotely; filtering only the returned page breaks pagination and must not be used.

Suggestion requests are debounced and may be cancelled or superseded whenever the user edits the active fragment. Providers should be side-effect free, honor `limit`, use an in-memory cache where useful, and allow a failed upstream catalog request to fall back to the field/operator suggestions from `searchFilters()`. Static values belong in a field's `options`; arbitrary values can still be accepted even when no autocomplete endpoint exists.

Detail responses can make metadata searchable by adding `workInfo.searchFacets`. Each facet contains `fieldID`, the source query `value`, a display `title`, an optional `groupTitle`, and a `presentation` of `creator`, `tag`, or `metadata`. Field IDs must match the IDs declared by `searchFilters()`.

All methods are additive and optional. Older manko versions ignore the extra keys, and current versions fall back to raw search when the configuration or suggestions are unavailable. Keep field IDs unique, return no more than 24 fields or 30 suggestions, and never put URLs, credentials, or executable content in search metadata.


## Parsed metadata cache

API 1.0 and 1.1 extensions can feature-detect `context.cache`. It shares Manko's disposable content storage budget (1 GB by default) and survives runtime restart. Keys are automatically partitioned by repository/source, package version, configuration, account and cache epoch.

```js
const gallery = context.cache
  ? await context.cache.remember(`gallery:${id}`, { ttlSeconds: 1800 }, loadValidatedGallery)
  : await loadWithBoundedMemoryCache(id);
```

The loader must return validated, JSON-compatible metadata belonging to the requested resource. Never cache credentials, cookies, HTTP response envelopes, challenge responses, errors or malformed payloads. Entries over 16 MiB remain usable but are not persisted. Revalidate values returned from the cache; call `await context.cache.remove(key)` and load again if validation fails.

A positive `ttlSeconds` sets freshness. Use `null` only for immutable, version-addressed resources such as a Hitomi index node keyed by index version and offset. Manko coalesces identical loads in a runtime, falls back to the loader on cache I/O failure, and fences writes after cancellation, removal, Clear Cache, privacy changes and newer forced reloads.

App snapshots derived from cached metadata expire with the earliest mutable dependency. Reusing a nearly expired ID list does not start a new freshness window for the displayed results.

Set `cachePolicy: "metadata"` on an adopting content extension. Pull-to-refresh reloads mutable keys used by that invocation and replaces them only after a successful load. Immutable entries and unrelated titles remain available. Legacy extensions continue to receive `invalidateCache()` on explicit refresh. Incognito bypasses persistent reads and writes; privacy transitions discard transient source metadata. Retain a bounded memory fallback and an `invalidateCache()` implementation for older hosts.

Hitomi and nhentai gallery metadata uses 30 minutes; Hitomi Nozomi/query ID lists and both sources' suggestion candidates use 5 minutes; Hitomi index versions use 30 minutes; versioned index nodes/title-ID data are immutable; Hitomi routing uses 1 minute. Cache matching ID lists before slicing pages, and only seed nhentai galleries from complete, validated list/search payloads.
