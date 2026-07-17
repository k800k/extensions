<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 MangaReader Extension Contributors -->

# Frequently Asked Questions

## General

::: details Are any extensions published right now?
Yes. The catalog lists 15 content packages and two tracker packages: AniList and MyAnimeList.
:::

::: details What extension types are supported?
Content and tracker extensions. Theme extension packages remain unsupported; this does not remove ordinary website or reader color themes.
:::

::: details Does this repository include manga or comics?
No. It publishes extension metadata and package artifacts. External services decide what they host, and users remain responsible for accessing only services and material they are authorized to use.
:::

::: details Does adding the repository install every extension?
No. Adding a repository makes its catalog visible to MangaReader. You still choose each extension through MangaReader's install flow.
:::

## Installation and repositories

::: details What is a compatible custom catalog?
It is an HTTP(S) directory containing `catalog.json`, or the full URL to that file. The JSON must include a `sources` array with unique source IDs, and every source must be a `content` or `tracker` package. Theme entries are rejected.
:::

::: details Where are custom catalogs stored?
Only in local storage for the current browser profile. There is no website account or cross-device synchronization.
:::

::: details Why will a custom catalog not load?
Common causes are a missing `catalog.json`, invalid JSON, duplicate source IDs, an unsupported extension kind, an HTTP error, or a server that does not allow cross-origin browser access.
:::

## Safety and support

::: details Are external catalogs reviewed by MangaReader?
No safety certification is made. MangaReader validates package integrity, compatibility, and declared runtime access, then leaves the install decision to you. Review the linked open-source revision independently.
:::

::: details Where should I report a security vulnerability?
Do not open a public issue containing sensitive details. Follow the repository's [Security Policy](https://github.com/k800k/extensions/blob/main/SECURITY.md).
:::
