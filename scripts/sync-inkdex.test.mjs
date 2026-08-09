/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertGeneratedImportRequest, assertNoHandAuthoredMappings, HAND_AUTHORED_SOURCE_IDS } from "./inkdex-import-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the checked-in repository publishes seventeen content and two tracker packages", async () => {
  const contentEntries = await readdir(join(root, "extensions", "content"), { withFileTypes: true });
  const expectedIDs = [
    "AniList",
    "AllPornComic", "Atsumaru", "Comix", "HitomiLA", "LNori", "MadaraDex", "MangaBat",
    "MangaDemon", "MangaDex", "MangaDot", "MangaFox", "Mangago", "MangaKakalot", "MyAnimeList",
    "NHentai", "RoyalRoad", "Webtoon", "WeebCentral"
  ].sort((left, right) => left.localeCompare(right));
  assert.deepEqual(
    contentEntries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort((left, right) => left.localeCompare(right)),
    expectedIDs.filter(id => !["AniList", "MyAnimeList"].includes(id))
  );
  const trackerEntries = await readdir(join(root, "extensions", "tracker"), { withFileTypes: true });
  assert.deepEqual(trackerEntries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), ["AniList", "MyAnimeList"]);
  await assert.rejects(readdir(join(root, "extensions", "theme")), { code: "ENOENT" });

  const inventory = JSON.parse(await readFile(join(root, "inventory", "registry.json"), "utf8"));
  const catalog = JSON.parse(await readFile(join(root, "dist", "v1", "stable", "catalog.json"), "utf8"));
  assert.deepEqual(inventory.entries.map(entry => entry.id), expectedIDs);
  assert.deepEqual(catalog.sources.map(source => source.id), expectedIDs);
  assert.ok(catalog.sources.every(source => source.availability === "approvalRequired"));
  assert.deepEqual(
    catalog.sources.filter(source => source.extension.apiVersion === "1.1").map(source => source.id),
    ["AniList", "Comix", "LNori", "MyAnimeList", "RoyalRoad"]
  );
  const mangaDex = catalog.sources.find(source => source.id === "MangaDex");
  assert.deepEqual(mangaDex.extension.allowedHTTPSHosts, [
    "*.mangadex.network", "api.mangadex.org", "mangadex.org", "uploads.mangadex.org"
  ]);
});

test("the optional Paperback importer is content-only", async () => {
  const importer = await readFile(join(root, "scripts", "sync-inkdex.mjs"), "utf8");
  const bridge = await readFile(join(root, "packages", "paperback-compat", "bridge.js"), "utf8");
  assert.doesNotMatch(importer, /registerTracker|defineTrackerExtension|extensions["', ]+tracker/);
  assert.doesNotMatch(bridge, /registerTracker|defineTrackerExtension/);
  assert.match(importer, /option\("--ids"\)/);
  assert.doesNotMatch(importer, /PRIVACY\.md|REVIEW_STATUS\.md|RIGHTS\.md|specification\.md/);
});

test("the InkDex importer cannot overwrite source-owned packages", () => {
  assert.deepEqual(HAND_AUTHORED_SOURCE_IDS, [
    "Comix", "HitomiLA", "MangaBat", "MangaDemon", "MangaKakalot", "NHentai", "WeebCentral"
  ]);
  assert.doesNotThrow(() => assertNoHandAuthoredMappings([{ id: "LNori" }]));
  assert.throws(
    () => assertNoHandAuthoredMappings([{ id: "LNori" }, { id: "Comix" }]),
    /mapping must not include hand-authored sources: Comix/
  );
  assert.doesNotThrow(() => assertGeneratedImportRequest(["LNori", "RoyalRoad"]));
  assert.throws(
    () => assertGeneratedImportRequest(["LNori", "NHentai", "HitomiLA", "WeebCentral"]),
    /cannot overwrite hand-authored sources: NHentai, HitomiLA, WeebCentral/
  );
});

test("repaired source releases declare their reviewed cover hosts", async () => {
  const expected = new Map([
    ["Atsumaru", ["1.0.0-alpha.26", "cdn.atsu.moe"]],
    ["Comix", ["1.0.0-alpha.52", "*.wowpic1.store"]],
    ["HitomiLA", ["0.2.3", "atn.gold-usergeneratedcontent.net"]],
    ["LNori", ["1.0.0-alpha.4", "cdn.lnori.com"]],
    ["MangaBat", ["1.0.0-alpha.14", "img-r1.2xstorage.com"]],
    ["MangaDemon", ["1.0.0-alpha.18", "readermc.org"]],
    ["MangaKakalot", ["1.0.0-alpha.14", "img-r1.2xstorage.com"]],
    ["NHentai", ["0.3.2", "t.nhentai.net"]],
    ["RoyalRoad", ["1.0.0-alpha.4", "www.royalroadcdn.com"]],
    ["WeebCentral", ["1.0.0-alpha.26", "temp.compsci88.com"]]
  ]);
  for (const [id, [version, host]] of expected) {
    const metadata = JSON.parse(await readFile(join(root, "extensions", "content", id, "extension.json"), "utf8"));
    assert.equal(metadata.version, version, `${id} release version`);
    assert.ok(metadata.allowedHTTPSHosts.includes(host), `${id} declares ${host}`);
  }
});

test("MangaFox and Mangago are enabled API 1.0 imports from the pinned registry artifacts", async () => {
  const expected = new Map([
    ["MangaFox", {
      version: "1.0.0-alpha.14",
      contentRating: "MATURE",
      hosts: ["fanfox.net"],
      artifactSHA256: "4326a7e64c9a45fd90b46e9b70a417038e7a31e5496edbc7cacc60d6289b1f11"
    }],
    ["Mangago", {
      version: "1.0.0-alpha.2",
      contentRating: "ADULT",
      hosts: ["www.mangago.me", "www.mangago.zone", "www.youhim.me"],
      artifactSHA256: "8589c51e2dfdb317756e626615157d8949ff0b0b5357f2e95c6a65909e250db3"
    }]
  ]);

  for (const [id, expectation] of expected) {
    const metadata = JSON.parse(await readFile(join(root, "extensions", "content", id, "extension.json"), "utf8"));
    assert.equal(metadata.apiVersion, "1.0", `${id} API version`);
    assert.equal(metadata.version, expectation.version, `${id} release version`);
    assert.equal(metadata.contentRating, expectation.contentRating, `${id} content rating`);
    assert.equal(metadata.availability, "approvalRequired", `${id} legacy availability advisory`);
    assert.deepEqual(metadata.allowedHTTPSHosts, expectation.hosts, `${id} legacy host advisory`);
    assert.equal(metadata.compatibility.status, "supported", `${id} compatibility status`);
    assert.equal(metadata.compatibility.note, null, `${id} compatibility note`);
    assert.equal(metadata.upstream.registryCommit, "5514d0bc58cb8edcee06c1c01458c51a7fd43e43");
    assert.equal(metadata.upstream.registryArtifactSHA256, expectation.artifactSHA256);
  }
});
