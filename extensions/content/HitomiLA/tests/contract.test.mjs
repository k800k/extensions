/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertContentExtension } from "../../../../packages/cli/lib/contracts.mjs";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("HitomiLA is a valid content extension package", async () => {
  const metadata = await assertContentExtension(directory, "HitomiLA");
  if (metadata.availability !== "available" || metadata.contentRating !== "ADULT") throw new Error("unexpected HitomiLA catalog metadata");
});
