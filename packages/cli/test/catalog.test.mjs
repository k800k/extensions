/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dist = join(root, "dist", "v1", "stable");

test("Install All contains the exact pinned 68-entry selection within deep-link limits", async () => {
  const catalog = JSON.parse(await readFile(join(dist, "catalog.json"), "utf8"));
  const ids = catalog.sources.map(source => source.id);
  assert.equal(ids.length, 68);
  assert.equal(new Set(ids).size, 68);
  const link = new URL("https://kayvenchen.github.io/mangareader/repository/install");
  link.searchParams.set("url", catalog.repositoryURL);
  ids.forEach(id => link.searchParams.append("source", id));
  assert.deepEqual(link.searchParams.getAll("source"), ids);
  assert.ok(new TextEncoder().encode(link.href).length <= 8192);
});

test("Every catalog item points to its exact canonical package hash", async () => {
  const catalog = JSON.parse(await readFile(join(dist, "catalog.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(dist, "mangareader-repository.json"), "utf8"));
  assert.deepEqual(manifest.sources.map(source => source.id), catalog.sources.map(source => source.id));
  for (const source of manifest.sources) {
    assert.equal(source.availability, "approvalRequired");
    assert.equal(source.mangaReaderExtension.apiVersion, "1.0");
    const bytes = await readFile(join(dist, source.mangaReaderExtension.packageURL));
    assert.equal(bytes.subarray(0, 4).toString("hex"), "504b0304");
    assert.equal(bytes.length, source.mangaReaderExtension.compressedSize);
  }
});
