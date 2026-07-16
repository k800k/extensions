/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertExtensionScaffold } from "../../../../packages/cli/lib/contracts.mjs";
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("ManhwaClub remains safely blocked until approval", async () => {
  await assertExtensionScaffold(directory, "content", "ManhwaClub");
});
