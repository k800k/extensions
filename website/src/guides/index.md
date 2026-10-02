<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 manko Extension Contributors -->

# Guides

manko content and tracker extensions connect the app to external services. The repository does not host comics. Theme extensions are not supported.

## Browse extensions

The [Extension List](/extension-list) shows the extension's icon, name, current version, content rating, and provider website. Sources are grouped by language, with Multi-Language first. Content and tracker extensions appear in the same list.

::: tip Keep extensions current
Refresh a repository to check for newer manifest versions, then use Update for the extensions you want to replace.
:::

## Custom catalogs

To use another publisher's repository, add its HTTPS repository URL inside Manko. A compatible repository contains `versioning.json` and versioned extension scripts. The website displays this repository's catalog; manage other repositories in the app.

## Install an extension

Search by name, ID, or provider website, or filter by **Language** and **Content Rating**. The total count updates as you filter, and language groups with no matching sources disappear.

Choose the arrow on a source row to open Manko's installation review for that extension. Confirm inside Manko to install it. Retired and unavailable entries have disabled arrows. **Add Repository** opens the repository review without selecting an extension.

## Content ratings

| Rating | Intended use |
| --- | --- |
| Safe | General-audience material. |
| Contains NSFW (17+) | The publisher marks this source as Mature. |
| NSFW (18+) | The publisher marks this source as Adult. |
| Unknown | The publisher did not provide a recognized rating. |

The Extension List shows every rating by default. Choose a rating from the **Content Rating** menu to filter the catalog; choose **All Content Ratings** to show every rating again.

## Troubleshooting catalogs

If the website cannot load catalog metadata, installation actions are disabled. Choose **Try Again** to reload it. If the problem persists, check your connection or report the error through [Support](/support).
