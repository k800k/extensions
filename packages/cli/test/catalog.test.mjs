/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAllowedHTTPSHost } from "../lib/contracts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dist = join(root, "dist", "v1", "stable");
const expectedIDs = [
  "AniList",
  "AllPornComic", "Atsumaru", "Comix", "HitomiLA", "LNori", "MadaraDex", "MangaBat",
  "MangaDemon", "MangaDex", "MangaDot", "MangaKakalot", "MyAnimeList", "NHentai", "RoyalRoad", "Webtoon",
  "WeebCentral"
].sort();

test("the catalog contains fifteen content and two tracker packages", async () => {
  const catalog = JSON.parse(await readFile(join(dist, "catalog.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(dist, "mangareader-repository.json"), "utf8"));
  assert.deepEqual(catalog.sources.map(source => source.id), expectedIDs);
  assert.deepEqual(manifest.sources.map(source => source.id), expectedIDs);
  assert.equal(catalog.sources.filter(source => source.kind === "content").length, 15);
  assert.equal(catalog.sources.filter(source => source.kind === "tracker").length, 2);
  assert.ok(catalog.sources.every(source => source.availability === "approvalRequired"));
  assert.ok(catalog.sources.every(source => source.sourceURL && source.sourceRevision));
  assert.deepEqual(
    Object.fromEntries(manifest.sources.map(source => [source.id, source.mangaReaderExtension.apiVersion])),
    Object.fromEntries(expectedIDs.map(id => [id, ["AniList", "Comix", "LNori", "MyAnimeList", "RoyalRoad"].includes(id) ? "1.1" : "1.0"]))
  );
  assert.equal(manifest.schemaVersion, 2);
  assert.equal("mangaReaderApproval" in manifest, false);
  assert.equal("publicKey" in manifest.repository.publisher, false);
  assert.equal((await readdir(join(dist, "packages"))).length, expectedIDs.length);
  assert.equal((await readdir(join(dist, "icons"))).length, expectedIDs.length);
});

test("the public extension API supports content and tracker packages but excludes themes", async () => {
  const sdkTypes = await readFile(join(root, "packages", "sdk", "index.d.ts"), "utf8");
  const sdkRuntime = await readFile(join(root, "packages", "sdk", "index.js"), "utf8");
  assert.match(sdkTypes, /ExtensionKind = "content" \| "tracker"/);
  assert.match(sdkTypes, /TrackerExtension/);
  assert.match(sdkTypes, /defineTrackerExtension/);
  assert.match(sdkRuntime, /defineTrackerExtension/);
  assert.doesNotMatch(sdkTypes, /ThemeExtension|defineThemeExtension/);
  assert.doesNotMatch(sdkRuntime, /defineThemeExtension/);
});

test("declared hosts accept explicit subdomain wildcards only", () => {
  assert.equal(isAllowedHTTPSHost("api.mangadex.org"), true);
  assert.equal(isAllowedHTTPSHost("*.mangadex.network"), true);
  assert.equal(isAllowedHTTPSHost("*mangadex.network"), false);
  assert.equal(isAllowedHTTPSHost("foo.*.mangadex.network"), false);
  assert.equal(isAllowedHTTPSHost("*.local"), false);
});
