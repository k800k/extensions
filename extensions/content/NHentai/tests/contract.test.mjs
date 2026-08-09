/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSourceOwnedContent } from "../../source-owned-assertions.mjs";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("NHentai is a deterministic Aidoku-referenced source-owned package", async () => {
  const metadata = await assertSourceOwnedContent(directory, "NHentai");
  if (metadata.availability !== "approvalRequired" || metadata.contentRating !== "ADULT") throw new Error("unexpected NHentai catalog metadata");
});
