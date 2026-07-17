/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node scripts/build-inkdex-mapping.mjs <registry-root> [output-json]";
const registryArgument = process.argv[2];
if (registryArgument === "--help" || registryArgument === "-h") {
  console.log(`${usage}\n\nSource repositories are expected in sibling inkdex-* checkout directories.`);
  process.exit(0);
}
if (!registryArgument) {
  console.error(usage);
  process.exit(64);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const registryRoot = resolve(registryArgument);
const checkoutRoot = resolve(process.env.INKDEX_CHECKOUT_ROOT ?? dirname(registryRoot));
const outputPath = resolve(process.argv[3] ?? join(scriptDirectory, "data", "inkdex-extension-mapping.json"));
const registryDataRoot = `${registryRoot}/0.9/stable`;
const metadata = JSON.parse(readFileSync(`${registryDataRoot}/metadata.json`, "utf8"));
const versioning = JSON.parse(readFileSync(`${registryDataRoot}/versioning.json`, "utf8"));

const repoInfo = {
  "general-extensions": { local: join(checkoutRoot, "inkdex-general"), url: "https://github.com/inkdex/general-extensions", family: "general" },
  "liliana-extensions": { local: join(checkoutRoot, "inkdex-liliana"), url: "https://github.com/inkdex/liliana-extensions", family: "liliana" },
  "madara-extensions": { local: join(checkoutRoot, "inkdex-madara"), url: "https://github.com/inkdex/madara-extensions", family: "madara" },
  "mangabox-extensions": { local: join(checkoutRoot, "inkdex-mangabox"), url: "https://github.com/inkdex/mangabox-extensions", family: "mangabox" },
  "mangastream-extensions": { local: join(checkoutRoot, "inkdex-mangastream"), url: "https://github.com/inkdex/mangastream-extensions", family: "mangastream" },
  "mangaworld-extensions": { local: join(checkoutRoot, "inkdex-mangaworld"), url: "https://github.com/inkdex/mangaworld-extensions", family: "mangaworld" }
};

const baseHosts = {
  AllManga: ["mkissa.to", "allmanga.to"],
  Atsumaru: ["atsu.moe"],
  Comix: ["comix.to"],
  FlameComics: ["flamecomics.xyz"],
  LNori: ["lnori.com"],
  MangaDemon: ["demonicscans.org"],
  MangaDex: ["mangadex.org"],
  MangaDot: ["mangadot.net"],
  MangaFire: ["mangafire.to"],
  MangaFox: ["fanfox.net"],
  MangaKatana: ["mangakatana.com"],
  MangaPlus: ["mangaplus.shueisha.co.jp"],
  MangaTaro: ["mangataro.org"],
  Mangago: ["www.mangago.me"],
  Mangapill: ["mangapill.com"],
  Mgeko: ["www.mgeko.cc"],
  PunkRecords: ["punkrecordz.com"],
  QiScans: ["qimanhwa.com"],
  Roliascan: ["roliascan.com"],
  RoyalRoad: ["www.royalroad.com"],
  Webtoon: ["www.webtoons.com"],
  WeebCentral: ["weebcentral.com"],
  MangaKoma: ["mangakoma.net"],
  Raw1001: ["raw1001.net"],
  AllPornComic: ["allporncomic.com"],
  ArthurScan: ["arthurscan.xyz"],
  CoffeeManga: ["coffeemanga.ink"],
  DragonTea: ["dragontea.ink"],
  GourmetScans: ["gourmetsupremacy.com"],
  HiperDex: ["hiperdex.com"],
  KunManga: ["kunmanga.co.uk"],
  LHTranslation: ["lhtranslation.net"],
  LekManga: ["mangalik.net"],
  LilyManga: ["lilymanga.net"],
  MadaraDex: ["madaradex.org"],
  Manga3asq: ["3asq.pro"],
  MangaDistrict: ["mangadistrict.com"],
  MangaOrigines: ["mangas-origines.fr"],
  MangaReadOrg: ["www.mangaread.org"],
  MangaScantrad: ["manga-scantrad.io"],
  MangaZin: ["mangazin.org"],
  ManhuaPlus: ["manhuaplus.com"],
  Manhuaus: ["manhuaus.com"],
  ManhwaClub: ["manhwaclub.net"],
  ManhwaRaw: ["manhwa-raw.com"],
  ManhwaTop: ["manhwatop.com"],
  SamuraiScan: ["samurai.j5z.xyz"],
  SetsuScans: ["setsuscans.com"],
  ToonGod: ["www.toongod.org"],
  Toonily: ["toonily.com"],
  UToon: ["utoon.net"],
  WebtoonXYZ: ["www.webtoon.xyz"],
  YaoiScan: ["yaoiscan.com"],
  MangaBat: ["www.mangabats.com"],
  MangaKakalot: ["www.mangakakalot.gg"],
  MangaNato: ["www.manganato.gg"],
  MangaNelo: ["www.nelomanga.net"],
  DrakeScans: ["drakecomic.org"],
  Hentai20: ["hentai20.io"],
  LelManga: ["www.lelmanga.com"],
  ManhwaX: ["manhwax.top"],
  RageScans: ["ragescans.com"],
  SushiScans: ["sushiscan.net"],
  Thunderscans: ["en-thunderscans.com"],
  MangaWorld: ["www.mangaworld.mx"],
  MangaWorldAdult: ["www.mangaworldadult.net"]
};

const auxiliaryHosts = {
  AllManga: ["api.allanime.day", "wp.youtube-anime.com", "ytimgf.youtube-anime.com"],
  FlameComics: ["cdn.flamecomics.xyz"],
  MangaDemon: ["cdn.demoniclibs.com", "demoniclibs.com", "librarydm.com", "mangareadon.org"],
  MangaDex: ["*.mangadex.network", "api.mangadex.org", "uploads.mangadex.org", "auth.mangadex.org", "status.mangadex.org"],
  MangaFire: ["k99.mfcdn3.xyz", "l1n.mfcdn3.xyz", "m3z.mfcdn3.xyz", "nw8.mfcdn3.xyz", "o48.mfcdn3.xyz", "placehold.co"],
  MangaPlus: ["jumpg-webapi.tokyo-cdn.com"],
  Mangago: ["www.mangago.zone", "www.youhim.me"],
  PunkRecords: ["api.punkrecordz.com"],
  QiScans: ["api.qimanhwa.com"],
  Webtoon: ["m.webtoons.com"]
};

const dynamicHostEvidence = {
  AllManga: ["chapter image servers are also returned by the AllAnime API"],
  Atsumaru: ["absolute poster/page URLs may be returned by live responses"],
  Comix: ["pages.result.pages.baseUrl and item URLs are supplied by live JSON"],
  MangaDex: ["at-home/image base URLs can be supplied on declared `*.mangadex.network` subdomains by MangaDex responses"],
  MangaFire: ["source accepts rotating {prefix}.mfcdn{number}.xyz hosts; known prefixes are listed"],
  MangaPlus: ["page and portrait image URLs are supplied by the Manga Plus API"],
  Webtoon: ["thumbnail and reader image URLs are supplied by web/mobile responses"],
  MangaWorld: ["CDN_URL and image URLs are embedded in page JSON"],
  MangaWorldAdult: ["CDN_URL and image URLs are embedded in page JSON"]
};

const familyDynamicEvidence = {
  general: "HTML/API-derived artwork and chapter URLs require runtime host observation unless explicitly listed",
  liliana: "artwork/chapter URLs are parsed from live HTML and may use an unlisted CDN",
  madara: "WordPress artwork/chapter URLs are parsed from live HTML and may use site-specific CDNs",
  mangabox: "artwork/chapter URLs are parsed from live HTML and may use site-specific CDNs",
  mangastream: "artwork/chapter URLs are parsed from live HTML and may use site-specific CDNs",
  mangaworld: "artwork and CDN_URL values are supplied by live page JSON"
};

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();

const repositoryFacts = Object.fromEntries(Object.entries(repoInfo).map(([name, info]) => {
  const commit = git(info.local, "rev-parse", "HEAD");
  const branch = git(info.local, "branch", "--show-current");
  const licenseBytes = readFileSync(`${info.local}/LICENSE`);
  return [name, {
    url: info.url,
    branch,
    commit,
    commitURL: `${info.url}/commit/${commit}`,
    sourceTreeSHA: git(info.local, "rev-parse", `${commit}^{tree}`),
    license: { spdx: "GPL-3.0-or-later", path: "LICENSE", sha256: sha256(licenseBytes) },
    family: info.family
  }];
}));

const idToRepo = new Map();
for (const [repository, entries] of Object.entries(metadata)) {
  if (repository === "tracker-extensions") continue;
  for (const id of Object.keys(entries)) {
    if (idToRepo.has(id)) throw new Error(`Duplicate published metadata owner for ${id}`);
    idToRepo.set(id, repository);
  }
}

const registryCommit = git(registryRoot, "rev-parse", "HEAD");
const sources = versioning.sources.filter(source => idToRepo.has(source.id)).map(source => {
  const repositoryName = idToRepo.get(source.id);
  if (!repositoryName) throw new Error(`No metadata owner for ${source.id}`);
  const repo = repoInfo[repositoryName];
  const provenance = repositoryFacts[repositoryName];
  if (!baseHosts[source.id]) throw new Error(`No base host proposal for ${source.id}`);
  const sourcePath = `src/${source.id}`;
  const sourceObjectSHA = git(repo.local, "rev-parse", `${provenance.commit}:${sourcePath}`);
  const artifactPath = `${registryDataRoot}/${source.id}/index.js`;
  return {
    id: source.id,
    upstreamRepository: repositoryName,
    upstreamURL: repo.url,
    upstreamBranch: provenance.branch,
    upstreamCommit: provenance.commit,
    upstreamCommitURL: provenance.commitURL,
    sourcePath,
    sourceObjectSHA,
    sourceRelationship: "auditedSnapshotNotRecordedBuildInput",
    license: provenance.license,
    baseHosts: baseHosts[source.id],
    likelyCDNAPIHosts: auxiliaryHosts[source.id] ?? [],
    dynamicHostEvidence: dynamicHostEvidence[source.id] ?? [familyDynamicEvidence[repo.family]],
    kind: "content",
    version: source.version,
    language: source.language,
    rating: source.contentRating,
    capabilities: source.capabilities,
    description: source.description,
    registryArtifact: {
      registryCommit,
      buildTime: metadata[repositoryName][source.id].build_time,
      sha256: sha256(readFileSync(artifactPath)),
      sourceCommitRecordedByRegistry: null
    }
  };
}).sort((a, b) => a.id.localeCompare(b.id));

if (sources.length !== 66 || idToRepo.size !== 66) throw new Error(`Expected 66 content entries, got ${sources.length}/${idToRepo.size}`);
if (Object.keys(baseHosts).length !== 66) throw new Error(`Expected 66 base-host mappings, got ${Object.keys(baseHosts).length}`);

const result = {
  schemaVersion: 1,
  registry: {
    url: "https://github.com/inkdex/extensions",
    branch: git(registryRoot, "branch", "--show-current"),
    commit: registryCommit,
    commitURL: `https://github.com/inkdex/extensions/commit/${registryCommit}`,
    versioningPath: "0.9/stable/versioning.json",
    metadataPath: "0.9/stable/metadata.json"
  },
  provenanceCaveat: "The combined registry records artifact build times and toolchain versions but not source commit SHAs. upstreamCommit pins a later audited 0.9/stable source snapshot, not a registry-recorded build input or proof of exact corresponding source; registryArtifact.sourceCommitRecordedByRegistry is therefore null.",
  repositories: repositoryFacts,
  initiallyMissingSourceCheckouts: [
    "liliana-extensions",
    "madara-extensions",
    "mangabox-extensions",
    "mangastream-extensions",
    "mangaworld-extensions"
  ],
  sources
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  output: outputPath,
  count: sources.length,
  repositories: Object.fromEntries(Object.entries(metadata).map(([name, entries]) => [name, Object.keys(entries).length])),
  registryCommit,
  sourceCommits: Object.fromEntries(Object.entries(repositoryFacts).map(([name, facts]) => [name, facts.commit]))
}, null, 2));
