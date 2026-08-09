/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSourceOwnedContent } from "../../source-owned-assertions.mjs";
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("MangaDemon is a deterministic Aidoku-referenced source-owned package", async () => {
  await assertSourceOwnedContent(directory, "MangaDemon");
});
