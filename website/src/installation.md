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

Open the [Extension List](/extension-list) to compare content and tracker extensions, supported features, language coverage, content rating, API version, script size, contributors, source, license, and provenance.

Use Get to install an extension and Update when the repository publishes a newer version. Repository refresh checks `versioning.json` and never installs an extension automatically.

Entries marked `serviceUnavailable` or `retired` do not expose an install action. Other legacy or omitted availability values remain installable.
