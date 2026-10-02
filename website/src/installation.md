<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 manko Extension Contributors -->

# Installation

Add the external repository once, then get or update extensions individually inside manko. Adding a repository does not install every catalog entry.

## Add the repository

<ClientOnly>
  <RepositoryInstall />
</ClientOnly>

::: details Install manually

1. Open **manko** and go to **Settings**.
2. Choose **Extensions**, then **Add Repository**.
3. Copy the repository URL shown above and paste it into the repository field.
4. Confirm the repository address.

:::

## Choose extensions

Open the [Extension List](/extension-list) to browse content and tracker extensions by language, version, content rating, and provider website.

Use Get to install an extension and Update when the repository publishes a newer version. Repository refresh checks `versioning.json` and never installs an extension automatically.

On the website, choose the arrow beside an extension to open Manko's installation review for that extension. Manko asks you to confirm before installing. The arrow opens the app review rather than downloading a file in your browser.

Entries marked `serviceUnavailable` or `retired` do not expose an install action. Other legacy or omitted availability values remain installable.
