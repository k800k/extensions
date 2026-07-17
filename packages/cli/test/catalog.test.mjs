/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dist = join(root, "dist", "v1", "stable");
const expectedIDs = [
  "AllPornComic", "Atsumaru", "Comix", "LNori", "MadaraDex", "MangaBat", "MangaDemon",
  "MangaDex", "MangaDot", "MangaKakalot", "RoyalRoad", "Webtoon", "WeebCentral"
];

test("the catalog contains thirteen pinned content ports", async () => {
  const catalog = JSON.parse(await readFile(join(dist, "catalog.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(dist, "mangareader-repository.json"), "utf8"));
  assert.deepEqual(catalog.sources.map(source => source.id), expectedIDs);
  assert.deepEqual(manifest.sources.map(source => source.id), expectedIDs);
  assert.ok(catalog.sources.every(source => source.kind === "content"));
  assert.ok(catalog.sources.every(source => source.availability === "approvalRequired"));
  assert.deepEqual(
    Object.fromEntries(manifest.sources.map(source => [source.id, source.mangaReaderExtension.apiVersion])),
    Object.fromEntries(expectedIDs.map(id => [id, ["Comix", "LNori", "RoyalRoad"].includes(id) ? "1.1" : "1.0"]))
  );
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.mangaReaderApproval, null);
  assert.equal((await readdir(join(dist, "packages"))).length, expectedIDs.length);
  assert.equal((await readdir(join(dist, "icons"))).length, expectedIDs.length);
});

test("the public extension API is content-only", async () => {
  const sdkTypes = await readFile(join(root, "packages", "sdk", "index.d.ts"), "utf8");
  const sdkRuntime = await readFile(join(root, "packages", "sdk", "index.js"), "utf8");
  assert.match(sdkTypes, /ExtensionKind = "content"/);
  assert.doesNotMatch(sdkTypes, /TrackerExtension|ThemeExtension|defineTrackerExtension|defineThemeExtension/);
  assert.doesNotMatch(sdkRuntime, /defineTrackerExtension|defineThemeExtension/);
});
