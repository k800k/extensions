/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mapping = JSON.parse(
  readFileSync(resolve(repositoryRoot, "scripts/data/inkdex-extension-mapping.json"), "utf8")
);
const inventory = JSON.parse(
  readFileSync(resolve(repositoryRoot, "inventory/registry.json"), "utf8")
);
const contentSources = mapping.sources.filter(source => source.kind === "content");
const sourcesByID = new Map(contentSources.map(source => [source.id, source]));
const allSourcesByID = new Map(mapping.sources.map(source => [source.id, source]));

test("historical import mapping pins the selected ports and remains separate from native packages", () => {
  const mappedIDs = contentSources.map(source => source.id);
  const importedIDs = [
    "AllPornComic", "Atsumaru", "Comix", "LNori", "MadaraDex", "MangaBat", "MangaDemon",
    "MangaDex", "MangaDot", "MangaFox", "Mangago", "MangaKakalot", "RoyalRoad", "Webtoon", "WeebCentral"
  ];

  assert.equal(mappedIDs.length, 66);
  assert.equal(new Set(mappedIDs).size, 66);
  assert.deepEqual(mappedIDs, [...mappedIDs].sort((a, b) => a.localeCompare(b)));
  const contentInventory = inventory.entries.filter(entry => entry.kind === "content");
  assert.deepEqual(contentInventory.filter(entry => allSourcesByID.has(entry.id)).map(entry => entry.id), importedIDs);
  assert.deepEqual(contentInventory.filter(entry => !allSourcesByID.has(entry.id)), [
    { id: "HitomiLA", kind: "content" }, { id: "NHentai", kind: "content" }
  ]);
});

test("published repository ownership matches the registry partition", () => {
  const counts = Object.fromEntries(
    Object.keys(mapping.repositories).filter(repository => repository !== "tracker-extensions").map(repository => [
      repository,
      contentSources.filter(source => source.upstreamRepository === repository).length
    ])
  );
  assert.deepEqual(counts, {
    "general-extensions": 22,
    "liliana-extensions": 2,
    "madara-extensions": 29,
    "mangabox-extensions": 4,
    "mangastream-extensions": 7,
    "mangaworld-extensions": 2
  });
  assert.deepEqual(mapping.initiallyMissingSourceCheckouts, [
    "liliana-extensions",
    "madara-extensions",
    "mangabox-extensions",
    "mangastream-extensions",
    "mangaworld-extensions"
  ]);
});

test("every entry has pinned source, license, host, and artifact provenance", () => {
  const sha40 = /^[0-9a-f]{40}$/;
  const sha64 = /^[0-9a-f]{64}$/;

  for (const source of contentSources) {
    const repository = mapping.repositories[source.upstreamRepository];
    assert.ok(repository, `${source.id} repository exists`);
    assert.match(source.upstreamCommit, sha40, `${source.id} has a commit`);
    assert.equal(source.upstreamCommit, repository.commit, `${source.id} uses its repository pin`);
    assert.match(source.sourceObjectSHA, sha40, `${source.id} has a source object SHA`);
    assert.equal(source.sourceRelationship, "auditedSnapshotNotRecordedBuildInput");
    assert.equal(source.license.spdx, "GPL-3.0-or-later");
    assert.match(source.license.sha256, sha64, `${source.id} has a license hash`);
    assert.ok(source.baseHosts.length > 0, `${source.id} has a base host`);
    assert.match(source.registryArtifact.sha256, sha64, `${source.id} has an artifact hash`);
    assert.equal(source.registryArtifact.registryCommit, mapping.registry.commit);
    assert.equal(source.registryArtifact.sourceCommitRecordedByRegistry, null);
  }

  assert.equal(JSON.stringify(mapping).includes("/tmp/"), false);
  assert.equal(Object.hasOwn(mapping, "generatedAt"), false);
});

test("kind, rating, and language totals preserve the registry snapshot", () => {
  const count = field => contentSources.reduce((result, source) => {
    result[source[field]] = (result[source[field]] ?? 0) + 1;
    return result;
  }, {});

  assert.deepEqual(count("kind"), { content: 66 });
  assert.deepEqual(count("rating"), { MATURE: 19, ADULT: 15, SAFE: 32 });
  assert.deepEqual(count("language"), {
    en: 50,
    pt: 1,
    ar: 2,
    fr: 4,
    ja: 2,
    multi: 3,
    it: 2,
    ko: 1,
    es: 1
  });
});

test("known source and metadata host drift remains explicit", () => {
  const allManga = sourcesByID.get("AllManga");
  assert.equal(allManga.upstreamRepository, "general-extensions");
  assert.deepEqual(allManga.baseHosts, ["mkissa.to", "allmanga.to"]);
  assert.ok(allManga.likelyCDNAPIHosts.includes("api.allanime.day"));

  const mangaBat = sourcesByID.get("MangaBat");
  assert.equal(mangaBat.upstreamRepository, "mangabox-extensions");
  assert.deepEqual(mangaBat.baseHosts, ["www.mangabats.com"]);
  assert.match(mangaBat.description, /mangabat\.com/);

  const toonGod = sourcesByID.get("ToonGod");
  assert.deepEqual(toonGod.baseHosts, ["www.toongod.org"]);
  assert.match(toonGod.description, /toongod\.com/);

  const manhuaPlus = sourcesByID.get("ManhuaPlus");
  assert.equal(manhuaPlus.upstreamRepository, "madara-extensions");
  assert.deepEqual(manhuaPlus.baseHosts, ["manhuaplus.com"]);
  assert.equal(contentSources.some(source =>
    source.id === "ManhuaPlus" && source.upstreamRepository === "liliana-extensions"
  ), false);
});

test("selected content CDN hosts are represented", () => {
  assert.ok(sourcesByID.get("MangaDex").likelyCDNAPIHosts.includes("uploads.mangadex.org"));
  assert.ok(sourcesByID.get("FlameComics").likelyCDNAPIHosts.includes("cdn.flamecomics.xyz"));
  assert.ok(sourcesByID.get("MangaDemon").likelyCDNAPIHosts.includes("cdn.demoniclibs.com"));
  assert.ok(sourcesByID.get("MangaFire").likelyCDNAPIHosts.includes("placehold.co"));
});
