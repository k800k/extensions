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


### Optional native image resources

Hosts may expose `http.imageResource(request)` beside `http.request`. For a successful image response it returns an opaque `resourceID` and the usual status, MIME type, headers, and cookies; other responses retain `dataBase64` for existing error and challenge handling. Return `{ resourceID, mimeType }` from `imagePageContent` to deliver the bytes directly to the native reader. References belong to one runtime invocation and are consumed on delivery; do not persist or reuse them. Hosts with response interceptors may return base64 instead, so handle both shapes.

An extension may declare `imageRequestMode: "independent"` only when every HTTP request made during `imagePageContent({ url, http })` uses the supplied, request-scoped `http` client (including helper requests). This allows concurrent cover work, immediate per-image delivery, and cancellation without interrupting other invocations. Fall back to `context.http` when an older host does not supply this input. Keep supporting `http.request` when `imageResource` is absent.

The optional `invalidateCache()` hook clears transient metadata on explicit refresh. It must invalidate in-flight cache writes as well as cached entries. The host also invalidates its typed metadata; updating a source or resetting its session creates a fresh runtime.
