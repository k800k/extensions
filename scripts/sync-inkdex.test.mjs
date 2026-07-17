/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the checked-in repository publishes fifteen content and two tracker packages", async () => {
  const contentEntries = await readdir(join(root, "extensions", "content"), { withFileTypes: true });
  const expectedIDs = [
    "AniList",
    "AllPornComic", "Atsumaru", "Comix", "HitomiLA", "LNori", "MadaraDex", "MangaBat",
    "MangaDemon", "MangaDex", "MangaDot", "MangaKakalot", "MyAnimeList", "NHentai", "RoyalRoad", "Webtoon",
    "WeebCentral"
  ].sort();
  assert.deepEqual(contentEntries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), expectedIDs.filter(id => !["AniList", "MyAnimeList"].includes(id)));
  const trackerEntries = await readdir(join(root, "extensions", "tracker"), { withFileTypes: true });
  assert.deepEqual(trackerEntries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), ["AniList", "MyAnimeList"]);
  await assert.rejects(readdir(join(root, "extensions", "theme")), { code: "ENOENT" });

  const inventory = JSON.parse(await readFile(join(root, "inventory", "registry.json"), "utf8"));
  const catalog = JSON.parse(await readFile(join(root, "dist", "v1", "stable", "catalog.json"), "utf8"));
  assert.deepEqual(inventory.entries.map(entry => entry.id), expectedIDs);
  assert.deepEqual(catalog.sources.map(source => source.id), expectedIDs);
  assert.ok(catalog.sources.every(source => source.availability === "approvalRequired"));
  assert.deepEqual(
    catalog.sources.filter(source => source.mangaReaderExtension.apiVersion === "1.1").map(source => source.id),
    ["AniList", "Comix", "LNori", "MyAnimeList", "RoyalRoad"]
  );
  const mangaDex = catalog.sources.find(source => source.id === "MangaDex");
  assert.deepEqual(mangaDex.mangaReaderExtension.allowedHTTPSHosts, [
    "*.mangadex.network", "api.mangadex.org", "mangadex.org", "uploads.mangadex.org"
  ]);
});

test("the optional Paperback importer is content-only", async () => {
  const importer = await readFile(join(root, "scripts", "sync-inkdex.mjs"), "utf8");
  const bridge = await readFile(join(root, "packages", "paperback-compat", "bridge.js"), "utf8");
  assert.doesNotMatch(importer, /registerTracker|defineTrackerExtension|extensions["', ]+tracker/);
  assert.doesNotMatch(bridge, /registerTracker|defineTrackerExtension/);
  assert.match(importer, /option\("--ids"\)/);
});
