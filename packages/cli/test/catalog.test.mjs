/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAllowedHTTPSHost } from "../lib/contracts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dist = join(root, "dist", "v1", "stable");
const expectedCatalogEntries = [
  { id: "AllPornComic", version: "1.0.0-alpha.15", kind: "content", contentRating: "ADULT", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/AllPornComic.png", license: "GPL-3.0-or-later" },
  { id: "AniList", version: "1.0.0", kind: "tracker", contentRating: "SAFE", compatibilityStatus: null, apiVersion: "1.1", icon: "icons/AniList.svg", license: "Apache-2.0" },
  { id: "Atsumaru", version: "1.0.0-alpha.25", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/Atsumaru.ico", license: "GPL-3.0-or-later" },
  { id: "Comix", version: "1.0.0-alpha.52", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.1", icon: "icons/Comix.png", license: "Apache-2.0" },
  { id: "HitomiLA", version: "0.2.2", kind: "content", contentRating: "ADULT", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/HitomiLA.svg", license: "Apache-2.0" },
  { id: "LNori", version: "1.0.0-alpha.3", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.1", icon: "icons/LNori.png", license: "GPL-3.0-or-later" },
  { id: "MadaraDex", version: "1.0.0-alpha.16", kind: "content", contentRating: "ADULT", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/MadaraDex.png", license: "GPL-3.0-or-later" },
  { id: "MangaBat", version: "1.0.0-alpha.13", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/MangaBat.png", license: "Apache-2.0" },
  { id: "MangaDemon", version: "1.0.0-alpha.18", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/MangaDemon.png", license: "Apache-2.0" },
  { id: "MangaDex", version: "1.0.0-alpha.28", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/MangaDex.png", license: "GPL-3.0-or-later" },
  { id: "MangaDot", version: "1.0.0-alpha.5", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/MangaDot.png", license: "GPL-3.0-or-later" },
  { id: "MangaFox", version: "1.0.0-alpha.13", kind: "content", contentRating: "MATURE", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/MangaFox.png", license: "GPL-3.0-or-later" },
  { id: "Mangago", version: "1.0.0-alpha.1", kind: "content", contentRating: "ADULT", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/Mangago.png", license: "GPL-3.0-or-later" },
  { id: "MangaKakalot", version: "1.0.0-alpha.13", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/MangaKakalot.png", license: "Apache-2.0" },
  { id: "MyAnimeList", version: "1.0.0", kind: "tracker", contentRating: "SAFE", compatibilityStatus: null, apiVersion: "1.1", icon: "icons/MyAnimeList.svg", license: "Apache-2.0" },
  { id: "NHentai", version: "0.3.1", kind: "content", contentRating: "ADULT", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/NHentai.svg", license: "Apache-2.0" },
  { id: "RoyalRoad", version: "1.0.0-alpha.3", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.1", icon: "icons/RoyalRoad.png", license: "GPL-3.0-or-later" },
  { id: "Webtoon", version: "1.0.0-alpha.19", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/Webtoon.png", license: "GPL-3.0-or-later" },
  { id: "WeebCentral", version: "1.0.0-alpha.26", kind: "content", contentRating: "SAFE", compatibilityStatus: "supported", apiVersion: "1.0", icon: "icons/WeebCentral.png", license: "Apache-2.0" }
].sort((left, right) => left.id.localeCompare(right.id));
const expectedIDs = expectedCatalogEntries.map(entry => entry.id);

test("the catalog contains seventeen content and two tracker packages", async () => {
  const catalog = JSON.parse(await readFile(join(dist, "catalog.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(dist, "mangareader-repository.json"), "utf8"));
  assert.deepEqual(catalog.sources.map(source => source.id), expectedIDs);
  assert.deepEqual(manifest.sources.map(source => source.id), expectedIDs);
  assert.deepEqual(catalog.sources.map(source => ({
    id: source.id,
    version: source.version,
    kind: source.kind,
    contentRating: source.contentRating,
    compatibilityStatus: source.compatibility?.status ?? null,
    apiVersion: source.mangaReaderExtension.apiVersion,
    icon: source.icon,
    license: source.license
  })), expectedCatalogEntries);
  assert.equal(catalog.sources.filter(source => source.kind === "content").length, 17);
  assert.equal(catalog.sources.filter(source => source.kind === "tracker").length, 2);
  assert.ok(catalog.sources.every(source => !["serviceUnavailable", "retired"].includes(source.availability)));
  assert.ok(catalog.sources.every(source => source.sourceURL && source.sourceRevision));
  assert.ok(catalog.sources.every(source => source.rightsDeclaration === `Licensed under ${source.license}.`));
  for (const source of catalog.sources) {
    const packagePath = join(dist, source.mangaReaderExtension.packageURL);
    const iconPath = join(dist, source.icon);
    const licensePath = join(root, "extensions", source.kind, source.id, "LICENSE");
    assert.ok((await readFile(packagePath)).length > 0, `${source.id} package is missing or empty`);
    assert.ok((await readFile(iconPath)).length > 0, `${source.id} icon is missing or empty`);
    assert.ok((await readFile(licensePath)).length > 0, `${source.id} LICENSE is missing or empty`);
    assert.equal(
      source.rightsURL,
      `https://github.com/k800k/extensions/blob/${source.sourceRevision}/extensions/${source.kind}/${source.id}/LICENSE`,
      `${source.id} rightsURL does not link to its packaged LICENSE`
    );
  }
  assert.deepEqual(
    Object.fromEntries(manifest.sources.map(source => [source.id, source.mangaReaderExtension.apiVersion])),
    Object.fromEntries(expectedIDs.map(id => [id, ["AniList", "Comix", "LNori", "MyAnimeList", "RoyalRoad"].includes(id) ? "1.1" : "1.0"]))
  );
  assert.ok(catalog.sources.every(source => source.compatibility?.note == null));
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
