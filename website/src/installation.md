<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 MangaReader Extension Contributors -->

# Installation

Add the external repository once, then review extensions individually inside MangaReader. The repository contains metadata and signed package artifacts; adding it does not activate every catalog entry.

::: warning MangaReader review required
An install link opens MangaReader's own review flow, where availability, publisher identity, permissions, package integrity, and the app's package approval are checked again. A catalog's `available` label describes port compatibility; it does not bypass MangaReader's executable-code trust gate.
:::

## Add the repository

<ClientOnly>
  <RepositoryInstall />
</ClientOnly>

::: details Install manually

1. Open **MangaReader** and go to **Settings**.
2. Choose **Extensions**, then **Add Repository**.
3. Copy the repository URL shown above and paste it into the repository field.
4. Review the repository address and publisher information before confirming.

:::

## Choose content extensions

The built-in catalog is currently empty. When content extensions are published, open the [Extension List](/extension-list) to compare their content rating, language, approval state, permissions, allowed network hosts, package checksum, and rights-review record.

Tracker and theme extension packages are not supported and are rejected by this repository.

Selecting **Review in MangaReader** does not bypass app policy. MangaReader remains responsible for verifying the package and deciding whether it can be activated.

## Availability labels

| Label | Meaning |
| --- | --- |
| Available | The content extension supports MangaReader API v1's declared surface and can be selected for review. |
| Approval required | The entry can be inspected, but activation remains blocked pending review. |
| Service unavailable | The package requires a runtime feature MangaReader intentionally does not expose. |
| Retired | The entry remains visible for migration context but is no longer supported. |

::: danger Respect service and content rights
Extensions connect MangaReader to external services; they do not grant permission to access a service or copyrighted material. Use only integrations and content you are authorized to use.
:::
