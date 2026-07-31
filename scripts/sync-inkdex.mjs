#!/usr/bin/env node
/*
 * Copyright 2026 MangaReader Extension Contributors
 * SPDX-License-Identifier: Apache-2.0
 *
 * Imports GPL-3.0-or-later InkDex Paperback bundles into MangaReader API v1
 * packages. Generated extension code remains GPL-3.0-or-later.
 */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCompatibilityPatches } from "./compatibility-patches.mjs";
import { assertGeneratedImportRequest, assertNoHandAuthoredMappings } from "./inkdex-import-policy.mjs";
import { sourceOwnedContentIDs } from "./source-owned.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_COUNT = 66;
const API_1_1 = new Set(["Comix", "LNori", "RoyalRoad"]);
const XHTML_SOURCES = new Set(["LNori", "RoyalRoad"]);
const EXTRA_HOSTS = new Map([
  ["Comix", ["static.comix.to", "*.wowpic1.store", "*.wowpic2.store", "*.wowpic3.store", "*.wowpic4.store", "*.wowpic5.store", "*.wowpic6.store", "*.wowpic7.store", "*.wowpic8.store", "*.wowpic9.store"]],
  ["Atsumaru", ["cdn.atsu.moe"]],
  ["LNori", ["cdn.lnori.com"]],
  ["MangaBat", ["img-r1.2xstorage.com", "img-r2.2xstorage.com", "imgs-2.2xstorage.com"]],
  ["MangaDemon", ["readermc.org"]],
  ["MangaDex", ["*.mangadex.network"]],
  ["MangaKakalot", ["img-r1.2xstorage.com", "img-r2.2xstorage.com", "imgs-2.2xstorage.com"]],
  ["RoyalRoad", ["www.royalroadcdn.com"]],
  ["WeebCentral", ["temp.compsci88.com"]],
  ["Webtoon", ["webtoon-phinf.pstatic.net", "swebtoon-phinf.pstatic.net"]]
]);
const RELEASE_VERSIONS = new Map([
  ["AllPornComic", "1.0.0-alpha.15"],
  ["Atsumaru", "1.0.0-alpha.25"],
  ["Comix", "1.0.0-alpha.52"],
  ["HitomiLA", "0.2.2"],
  ["LNori", "1.0.0-alpha.3"],
  ["MadaraDex", "1.0.0-alpha.16"],
  ["MangaBat", "1.0.0-alpha.13"],
  ["MangaDemon", "1.0.0-alpha.18"],
  ["MangaDex", "1.0.0-alpha.28"],
  ["MangaDot", "1.0.0-alpha.5"],
  ["MangaFox", "1.0.0-alpha.13"],
  ["Mangago", "1.0.0-alpha.1"],
  ["MangaKakalot", "1.0.0-alpha.13"],
  ["NHentai", "0.3.1"],
  ["RoyalRoad", "1.0.0-alpha.3"],
  ["Webtoon", "1.0.0-alpha.19"],
  ["WeebCentral", "1.0.0-alpha.26"]
]);
const EXCLUDED_HOSTS = new Map([
  ["MangaDex", new Set(["auth.mangadex.org", "status.mangadex.org"])]
]);
const UNSUPPORTED = new Map([
  ["AllManga", "Uses Paperback executeInWebView to resolve protected chapter pages."]
]);
const UNSUPPORTED_STATUS = new Map([
  ["AllManga", "requiresWebView"]
]);

const argv = process.argv.slice(2);
const option = name => {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
};
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const unique = values => [...new Set(values.filter(Boolean))].sort();
const publicHost = value => {
  const host = String(value ?? "").trim().toLowerCase();
  return host && !host.includes(":") && !host.includes("/") && host !== "localhost" && !host.endsWith(".local")
    ? host
    : null;
};

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json(value));
}

function capabilities(upstream, bundle) {
  const flags = new Set(upstream.capabilities ?? []);
  const values = ["browse", "details", "installments"];
  values.push(XHTML_SOURCES.has(upstream.id) ? "acquisition" : "imageSequence");
  if (flags.has(4)) values.push("discover");
  if (flags.has(64)) values.push("search");
  if (flags.has(8) && upstream.id !== "MangaDex") values.push("managedCollections");
  if (flags.has(16)) values.push("challengeHandoff");
  if (/getLatestUpdates|processTitlesForUpdates/.test(bundle)) values.push("updates");
  if (bundle.includes("registerInterceptor")) values.push("interceptors");
  if (/cookie/i.test(bundle)) values.push("cookies");
  return unique(values);
}

function permissions(upstream, bundle) {
  const values = ["network", "state", "rateLimiting", "redactedLogging"];
  if (/SecureState|secureState|cookie/i.test(bundle)) values.push("secureState", "cookies");
  if ((upstream.capabilities ?? []).includes(16)) values.push("challengeHandoff");
  if (bundle.includes("executeInWebView")) values.push("webExecution");
  return unique(values);
}

function authModes() {
  return ["none"];
}

function sourceHeader(source, mapping, patchRecords) {
  return `/*!
 * ${source.name} for MangaReader
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Audited upstream snapshot: ${mapping.upstreamURL}
 * Audited snapshot commit: ${mapping.upstreamCommit}
 * Audited snapshot path: ${mapping.sourcePath}
 * Snapshot relationship: not recorded by the registry as this artifact's build input
 * Registry artifact: ${mapping.registryArtifact.registryCommit}/${source.id}/index.js
 * Compatibility patches: ${patchRecords.length ? patchRecords.map(record => record.id).join(", ") : "none"}
 * Adapter: MangaReader Paperback compatibility bridge v1.1
 */`;
}

function contractTest(id, apiVersion) {
  return `/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { assertContentExtension } from "../../../../packages/cli/lib/contracts.mjs";
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test(${JSON.stringify(`${id} is a provenance-pinned Paperback compatibility port`)}, async () => {
  const metadata = await assertContentExtension(directory, ${JSON.stringify(id)});
  if (metadata.apiVersion !== ${JSON.stringify(apiVersion)}) throw new Error("unexpected API version");
  if (metadata.availability !== "approvalRequired") throw new Error("imported package did not retain approvalRequired metadata");
  const license = await readFile(join(directory, "LICENSE"), "utf8");
  if (!license.includes("GNU GENERAL PUBLIC LICENSE")) throw new Error("GPL package license is missing");
});
`;
}

async function iconPath(registry, source) {
  const directory = join(registry, source.id, "static");
  const names = await readdir(directory);
  const selected = names.find(name => /^icon\.(?:png|jpe?g)$/i.test(name));
  if (!selected) throw new Error(`Missing icon for ${source.id}`);
  return join(directory, selected);
}

function iconExtension(bytes, id) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return ".png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return ".jpg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  if (bytes.subarray(0, 4).equals(Buffer.from("00000100", "hex"))) return ".ico";
  throw new Error(`Unsupported icon format for ${id}`);
}

async function main() {
  const registry = resolve(option("--registry") ?? process.env.INKDEX_REGISTRY_ROOT ?? "");
  if (!option("--registry") && !process.env.INKDEX_REGISTRY_ROOT) {
    throw new Error("Pass --registry <path-to-combined-repository/0.9/stable> or set INKDEX_REGISTRY_ROOT");
  }
  const mappingPath = resolve(option("--mapping") ?? join(ROOT, "scripts", "data", "inkdex-extension-mapping.json"));
  const [versioning, mappingDocument, bridge] = await Promise.all([
    readJSON(join(registry, "versioning.json")),
    readJSON(mappingPath),
    readFile(join(ROOT, "packages", "paperback-compat", "bridge.js"), "utf8")
  ]);
  const allContentMappings = mappingDocument.sources.filter(source => source.kind === "content");
  const contentMappings = allContentMappings.filter(source => !sourceOwnedContentIDs.has(source.id));
  assertNoHandAuthoredMappings(contentMappings);
  const mappingByID = new Map(contentMappings.map(source => [source.id, source]));
  const versionedSources = versioning.sources.filter(source => mappingByID.has(source.id));
  const expectedImportedCount = EXPECTED_COUNT
    - allContentMappings.filter(source => sourceOwnedContentIDs.has(source.id)).length;
  if (versionedSources.length !== expectedImportedCount || mappingByID.size !== expectedImportedCount) {
    throw new Error(`Expected ${expectedImportedCount} import-owned versioned and mapped content extensions`);
  }
  const licensePath = join(ROOT, "licenses", "GPL-3.0-or-later.txt");
  await access(licensePath);
  const licenseBytes = await readFile(licensePath);
  const requestedIDs = option("--ids")?.split(",").map(value => value.trim()).filter(Boolean);
  assertGeneratedImportRequest(requestedIDs);
  const requested = requestedIDs ? new Set(requestedIDs) : null;
  if (requested && requested.size !== requestedIDs.length) throw new Error("--ids must not contain duplicates");
  const selectedSources = requested ? versionedSources.filter(source => requested.has(source.id)) : versionedSources;
  if (requested) {
    const missing = [...requested].filter(id => !selectedSources.some(source => source.id === id));
    if (missing.length) throw new Error(`Unknown content extension IDs: ${missing.join(", ")}`);
  }

  const statuses = [];
  for (const source of selectedSources) {
    const mapping = mappingByID.get(source.id);
    if (!mapping) throw new Error(`No audit mapping for ${source.id}`);
    const directory = join(ROOT, "extensions", "content", source.id);
    const upstreamBundle = await readFile(join(registry, source.id, "index.js"), "utf8");
    const importedIconPath = await iconPath(registry, source);
    const iconBytes = await readFile(importedIconPath);
    if (sha256(upstreamBundle) !== mapping.registryArtifact.sha256) {
      throw new Error(`Registry artifact hash changed for ${source.id}`);
    }
    const patchResult = applyCompatibilityPatches(source.id, upstreamBundle);
    const importedBundle = patchResult.bundle;
    const excludedHosts = EXCLUDED_HOSTS.get(source.id) ?? new Set();
    const allowedHTTPSHosts = unique([
      ...(mapping.baseHosts ?? []),
      ...(mapping.likelyCDNAPIHosts ?? []),
      ...(EXTRA_HOSTS.get(source.id) ?? [])
    ].map(publicHost).filter(host => !excludedHosts.has(host)));
    if (!allowedHTTPSHosts.length) throw new Error(`No reviewed host declarations for ${source.id}`);
    const availability = UNSUPPORTED.has(source.id) ? "serviceUnavailable" : "approvalRequired";
    const apiVersion = API_1_1.has(source.id) ? "1.1" : "1.0";
    const metadata = {
      id: source.id,
      name: source.name,
      description: source.description,
      kind: "content",
      apiVersion,
      version: RELEASE_VERSIONS.get(source.id) ?? source.version,
      language: source.language,
      languages: [source.language],
      contentRating: source.contentRating,
      availability,
      capabilities: capabilities(source, importedBundle),
      inventoryCapabilities: source.capabilities ?? [],
      permissions: permissions(source, importedBundle),
      allowedHTTPSHosts,
      authenticationModes: authModes(),
      developers: source.developers ?? [],
      license: "GPL-3.0-or-later",
      iconFile: `icon${iconExtension(iconBytes, source.id)}`,
      compatibility: {
        adapter: "paperback-0.9",
        status: UNSUPPORTED_STATUS.get(source.id) ?? "supported",
        scope: "core",
        note: UNSUPPORTED.get(source.id) ?? null,
        limitations: [
          "Advanced search form values and actions are not passed to Paperback search callbacks by MangaReader API v1.",
          "Paperback genre-query discover cards have no equivalent MangaReader API v1 discover-item representation."
        ]
      },
      upstream: {
        repository: mapping.upstreamURL,
        branch: mapping.upstreamBranch,
        commit: mapping.upstreamCommit,
        sourcePath: mapping.sourcePath,
        sourceObjectSHA: mapping.sourceObjectSHA,
        relationship: mapping.sourceRelationship,
        registryCommit: mapping.registryArtifact.registryCommit,
        registryArtifactSHA256: mapping.registryArtifact.sha256
      }
    };

    await mkdir(join(directory, "tests"), { recursive: true });
    const registrationOptions = {
      apiVersion,
      ...(XHTML_SOURCES.has(source.id) ? { mediaKind: "lightNovel" } : {})
    };
    const footer = `PaperbackCompat.registerContent(${JSON.stringify(source.id)}, source[${JSON.stringify(source.id)}], ${JSON.stringify(registrationOptions)});`;
    const bundleNote = patchResult.records.length
      ? "Hash-guarded compatibility-patched compiled InkDex/Paperback bundle follows."
      : "Unmodified compiled InkDex/Paperback bundle follows.";
    const combined = `${sourceHeader(source, mapping, patchResult.records)}\n${bridge.trim()}\n\n/* ${bundleNote} */\n${importedBundle.trim()}\n\n/* MangaReader registration footer. */\n${footer}\n`;
    await Promise.all([
      writeJSON(join(directory, "extension.json"), metadata),
      writeFile(join(directory, "main.js"), combined),
      writeFile(join(directory, metadata.iconFile), iconBytes),
      writeFile(join(directory, "LICENSE"), licenseBytes),
      writeJSON(join(directory, "provenance.json"), {
        ...mapping,
        upstreamVersion: source.version,
        releaseVersion: metadata.version,
        importedFromRegistryBuild: versioning.buildTime,
        adapter: { name: "@mangareader/paperback-compat", version: "1.1.0", license: "GPL-3.0-or-later" },
        compatibilityPatches: patchResult.records,
        generatedMainSHA256: sha256(combined)
      }),
      writeFile(join(directory, "tests", "contract.test.mjs"), contractTest(source.id, apiVersion))
    ]);

    statuses.push({
      id: source.id,
      kind: "content",
      availability,
      reason: UNSUPPORTED.get(source.id) ?? `Imported from a pinned GPL registry artifact and adapted to MangaReader Extension API ${apiVersion}; activation review is pending.`
    });
  }

  console.log(`Imported ${statuses.length} selected GPL extensions (${statuses.filter(item => item.availability === "approvalRequired").length} retaining approvalRequired metadata).`);
}

main().catch(error => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
