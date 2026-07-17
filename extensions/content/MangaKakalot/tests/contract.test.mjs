/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { assertContentExtension } from "../../../../packages/cli/lib/contracts.mjs";
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("MangaKakalot is a provenance-pinned Paperback compatibility port", async () => {
  const metadata = await assertContentExtension(directory, "MangaKakalot");
  if (metadata.apiVersion !== "1.0") throw new Error("unexpected API version");
  if (metadata.availability !== "available") throw new Error("extension is not published as available");
  const license = await readFile(join(directory, "LICENSE"), "utf8");
  if (!license.includes("GNU GENERAL PUBLIC LICENSE")) throw new Error("GPL package license is missing");
});
