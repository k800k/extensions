<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 MangaReader Extension Contributors -->

# Guides

MangaReader content and tracker extensions connect the app to external services. The repository does not host comics. Theme extension packages are not supported.

## Browse extensions

The [Extension List](/extension-list) presents:

1. **Package identity** — name, version, kind, language, and content rating.
2. **Compatibility** — supported MangaReader API version, features, and known limitations.
3. **Package information** — compressed size, contributors, and repository.
4. **Source and provenance** — package source, upstream snapshot, license, and revision links.

::: tip Keep packages current
Refresh a repository to check for newer manifest versions, then use Update for the extensions you want to replace.
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
| Safe | General-audience material. |
| Mature | Material that may include stronger themes or imagery. |
| Adult | Explicit material intended only for adults where lawful. |
| Unknown | The publisher did not provide a recognized rating. |

The Extension List begins with **Safe** included when opened without a shared state. Click a filter once to include it, twice to exclude it, and a third time to clear it. Clearing all rating filters shows every rating.

## Troubleshooting catalogs

If a custom catalog does not load:

- confirm that its address resolves to `catalog.json`;
- open the JSON address directly and check for an HTTP error;
- make sure the catalog server allows cross-origin browser requests;
- check that `sources` is an array with no duplicate IDs; and
- remove credentials, fragments, and unrelated JSON filenames from the URL.
