<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 MangaReader Extension Contributors -->

# Guides

MangaReader content and tracker extensions are small, separately reviewed integrations. The repository does not host comics, and an extension does not become trusted merely because it appears in a catalog. Theme extension packages are not supported.

## Review an extension

Before opening an install link, check these fields in the [Extension List](/extension-list):

1. **Availability** — `Service unavailable` identifies a known runtime blocker; `Available` means the declared compatibility surface can proceed to MangaReader review.
2. **Permissions** — compare requested access with the extension's stated purpose.
3. **Allowed HTTPS hosts** — network access should be narrow and recognizable.
4. **Rights and provenance** — inspect the source license, package notice, and service-rights record.
5. **Package hash** — MangaReader uses the published SHA-256 value to detect changed artifacts.
6. **Repository** — custom catalogs have different maintainers and review processes.

::: tip Start small
Install only the integrations you intend to use. A smaller extension set is easier to review, troubleshoot, and keep current.
:::

## Custom catalogs

The catalog browser accepts either a full `catalog.json` URL or the directory containing it. A compatible catalog must:

- be served over HTTP or HTTPS without embedded credentials;
- expose a JSON object with a `sources` array;
- give every source a unique, non-empty `id`;
- contain content or tracker extensions (`kind: "content"` or `kind: "tracker"`; an omitted kind defaults to content);
- publish package and icon paths relative to its repository URL; and
- permit browser access with appropriate cross-origin response headers.

Custom catalog URLs are saved in local browser storage. They are never synchronized to an account because this website has no sign-in or backend. Shared catalog links include the custom URLs required to reproduce the view.

To remove a custom catalog, open **Repositories** on the Extension List and select the × button next to it.

## Content ratings

| Rating | Intended use |
| --- | --- |
| Safe | General-audience catalog metadata. |
| Mature | Material that may include stronger themes or imagery. |
| Adult | Explicit material intended only for adults where lawful. |
| Unknown | The publisher did not provide a recognized rating. Treat it cautiously. |

The Extension List begins with **Safe** included when opened without a shared state. Click a filter once to include it, twice to exclude it, and a third time to clear it. Clearing all rating filters shows every rating.

## Troubleshooting catalogs

If a custom catalog does not load:

- confirm that its address resolves to `catalog.json`;
- open the JSON address directly and check for an HTTP error;
- make sure the catalog server allows cross-origin browser requests;
- check that `sources` is an array with no duplicate IDs; and
- remove credentials, fragments, and unrelated JSON filenames from the URL.
