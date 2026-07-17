<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 MangaReader Extension Contributors -->

# Installation

Add the external repository once, then review extensions individually inside MangaReader. Adding a repository does not activate every catalog entry.

::: warning You decide what to trust
Extensions execute third-party code. MangaReader does not safety-review, approve, verify, or endorse packages. Install only after reviewing the linked source revision and declared access.
:::

## Add the repository

<ClientOnly>
  <RepositoryInstall />
</ClientOnly>

::: details Install manually

1. Open **MangaReader** and go to **Settings**.
2. Choose **Extensions**, then **Add Repository**.
3. Copy the repository URL shown above and paste it into the repository field.
4. Review the repository address before confirming.

:::

## Choose extensions

Open the [Extension List](/extension-list) to compare content and tracker packages, supported features, language coverage, content rating, API version, permissions, exact allowed network hosts, OAuth requirements, checksum, source revision, and audit records.

MangaReader shows a disclosure before first installation. An ordinary code/package update does not ask again; an update that expands hosts, capabilities, permissions, or authentication modes does.

SHA-256 confirms that the downloaded artifact matches the catalog. Manifest, API-version, operation, and load checks confirm that it can run in MangaReader. Neither mechanism proves a package is safe.

## Availability labels

| Label | Meaning |
| --- | --- |
| Available | The extension supports its declared MangaReader API surface and can be installed after the user disclosure. |
| Approval required | Legacy repository metadata retained for compatibility. MangaReader still relies on package SHA-256, schema/runtime validation, declared access, and the explicit user install disclosure; this label does not block review or installation. |
| Service unavailable | The package requires a runtime feature MangaReader intentionally does not expose. |
| Retired | The entry remains visible for migration context but is no longer supported. |

::: danger Respect service and content rights
Extensions connect MangaReader to external services; they do not grant permission to access a service or copyrighted material. Use only integrations and content you are authorized to use.
:::
