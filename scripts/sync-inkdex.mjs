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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_COUNT = 66;
const API_1_1 = new Set(["Comix", "LNori", "RoyalRoad"]);
const XHTML_SOURCES = new Set(["LNori", "RoyalRoad"]);
const EXTRA_HOSTS = new Map([
  ["Comix", ["static.comix.to"]],
  ["Webtoon", ["webtoon-phinf.pstatic.net", "swebtoon-phinf.pstatic.net"]]
]);
const EXCLUDED_HOSTS = new Map([
  ["MangaDex", new Set(["auth.mangadex.org", "status.mangadex.org"])]
]);
const LIVE_SMOKE_AUDIT = new Map([
  ["AllPornComic", "Anonymous HTTPS landing page rendered HTML on `allporncomic.com`; protected follow-up requests remain covered by challenge handoff"],
  ["Atsumaru", "Anonymous HTTPS landing page returned HTML on `atsu.moe`"],
  ["Comix", "Anonymous HTTPS landing page rendered on `comix.to`; the exact static host `static.comix.to` was reachable and denied a root request with HTTP 403"],
  ["LNori", "Anonymous HTTPS landing page rendered HTML on `lnori.com`"],
  ["MadaraDex", "Anonymous HTTPS landing page rendered HTML on `madaradex.org`"],
  ["MangaBat", "Anonymous HTTPS landing page rendered HTML on `www.mangabats.com`"],
  ["MangaDemon", "Anonymous HTTPS landing page rendered on `demonicscans.org`; exact CDN roots on `cdn.demoniclibs.com`, `demoniclibs.com`, and `mangareadon.org` returned HTTP 200, while `librarydm.com` returned an empty root response"],
  ["MangaDex", "Anonymous `api.mangadex.org/ping` returned HTTP 200, and the public page and cover hosts `mangadex.org` and `uploads.mangadex.org` returned HTTP 200; OAuth and status-page hosts were not exercised or declared"],
  ["MangaDot", "Anonymous HTTPS landing page rendered HTML on `mangadot.net`"],
  ["MangaKakalot", "Anonymous HTTPS landing page rendered HTML on `www.mangakakalot.gg`"],
  ["RoyalRoad", "Anonymous HTTPS landing page redirected within `www.royalroad.com` to `/home` and rendered HTML"],
  ["Webtoon", "Anonymous HTTPS landing page redirected within `www.webtoons.com` to `/en/`; exact image hosts `webtoon-phinf.pstatic.net` and `swebtoon-phinf.pstatic.net` were reachable and returned HTTP 403/404 for root requests"],
  ["WeebCentral", "Anonymous HTTPS landing page rendered HTML on `weebcentral.com`"]
]);
const UNSUPPORTED = new Map([
  ["AllManga", "Uses Paperback executeInWebView to resolve protected chapter pages."],
  ["MangaFox", "Uses dynamic eval during service-response parsing; MangaReader blocks dynamic code."],
  ["Mangago", "Uses a dynamic Function constructor during service-response parsing; MangaReader blocks dynamic code."]
]);
const UNSUPPORTED_STATUS = new Map([
  ["AllManga", "requiresWebView"],
  ["MangaFox", "blockedDynamicCode"],
  ["Mangago", "blockedDynamicCode"]
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

function sourceHeader(source, mapping) {
  return `/*!
 * ${source.name} for MangaReader
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Audited upstream snapshot: ${mapping.upstreamURL}
 * Audited snapshot commit: ${mapping.upstreamCommit}
 * Audited snapshot path: ${mapping.sourcePath}
 * Snapshot relationship: not recorded by the registry as this artifact's build input
 * Registry artifact: ${mapping.registryArtifact.registryCommit}/${source.id}/index.js
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
  if (metadata.availability !== "approvalRequired") throw new Error("imported package bypassed activation review");
  const license = await readFile(join(directory, "LICENSE"), "utf8");
  if (!license.includes("GNU GENERAL PUBLIC LICENSE")) throw new Error("GPL package license is missing");
});
`;
}

function specification(source, mapping, metadata) {
  const incompatibility = UNSUPPORTED.get(source.id);
  return `# ${source.name} extension specification

This package adapts the GPL-3.0-or-later Paperback registry artifact for ${source.name} to MangaReader Extension API v1. The compiled registry bundle is preserved inside \`main.js\`; the MangaReader compatibility bridge supplies Paperback's state, request, selector, interceptor, encoding, and form surfaces. [${mapping.upstreamRepository} at ${mapping.upstreamCommit.slice(0, 12)}](${mapping.upstreamCommitURL}), path \`${mapping.sourcePath}\`, is a later audited source snapshot: the registry did not record this artifact's source commit, so the snapshot is not claimed as its exact build input.

- Kind: \`${metadata.kind}\`
- Upstream version: \`${source.version}\`
- MangaReader API: \`${metadata.apiVersion}\`
- Language: \`${source.language}\`
- Rating: \`${source.contentRating}\`
- HTTPS hosts: ${metadata.allowedHTTPSHosts.map(host => `\`${host}\``).join(", ")}
- Compatibility: **${incompatibility ? "unavailable" : "supported"}**${incompatibility ? ` — ${incompatibility}` : ""}

Core discovery, title search, details, chapters, content delivery, request interception, and state are translated at the public content-extension boundary. API 1.1 provides constrained web execution for Comix and XHTML publication delivery for RoyalRoad and LNori. Paperback settings/search forms can be described, but MangaReader does not send form actions or selected advanced-filter values back into an extension. Live sites can change independently, and response-provided image CDNs require exact-host review.
`;
}

function reviewStatus(source, mapping, metadata) {
  const incompatibility = UNSUPPORTED.get(source.id);
  return `# Review status for ${source.id}

- Import integrity: **verified** against InkDex registry artifact SHA-256 \`${mapping.registryArtifact.sha256}\`.
- Source reference: **audited snapshot** [${mapping.upstreamCommit.slice(0, 12)}](${mapping.upstreamCommitURL}), path \`${mapping.sourcePath}\`; the registry did not record the artifact's exact source commit/lockfile.
- License: **GPL-3.0-or-later**; package license and source attribution included.
- MangaReader compatibility: **${incompatibility ? "blocked" : "enabled"}**${incompatibility ? ` — ${incompatibility}` : ` through the public API ${metadata.apiVersion} adapter.`}
- Activation review: **required**; the importer never marks a new package available.
- Service status: not guaranteed; the upstream service and any response-provided CDN remain external dependencies.
- Live smoke (2026-07-17): ${LIVE_SMOKE_AUDIT.get(source.id) ?? "not performed"}. The probe discarded response bodies beyond browser rendering and used no account, cookies, or activation approval.

Generated metadata declares ${metadata.allowedHTTPSHosts.length} reviewed literal/base host${metadata.allowedHTTPSHosts.length === 1 ? "" : "s"}. Re-run the import audit when upstream code, service domains, permissions, or package hashes change.
`;
}

function privacy(source, metadata, mapping) {
  return `# Privacy assessment for ${source.id}

The extension sends user-initiated browse, search, details, chapter, or image requests only through MangaReader's brokered HTTPS client. Declared hosts: ${metadata.allowedHTTPSHosts.map(host => `\`${host}\``).join(", ")}.

MangaReader isolates ordinary and secure state by extension namespace. Depending on upstream behavior, this source may store preferences, cookies, login state, or rate-limit state. The package has no direct filesystem, sensor, clipboard, native-network, or arbitrary-code access. External service privacy terms remain those of the target service described by [the audited upstream snapshot](${mapping.upstreamCommitURL}).
`;
}

function rights(source, mapping) {
  return `# Rights record for ${source.id}

The compatibility adapter and combined executable package are distributed under **GPL-3.0-or-later**. The authoritative imported bytes are the compiled InkDex registry artifact pinned by commit and SHA-256; it is retained without source-level feature changes and combined with the GPL compatibility bridge. [${mapping.upstreamURL} at ${mapping.upstreamCommit.slice(0, 12)}](${mapping.upstreamCommitURL}), path \`${mapping.sourcePath}\`, is a later audited source snapshot. InkDex's combined registry did not record the artifact's exact source commit or lockfile, so this snapshot is not represented as the artifact's exact build input; recovering that linkage requires upstream build provenance.

The service name and icon identify the interoperated service; no affiliation or endorsement is claimed. Website content remains subject to its respective owner and service terms. Report removal, trademark, security, or rights concerns through the repository issue tracker.
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
  const mappingByID = new Map(mappingDocument.sources.filter(source => source.kind === "content").map(source => [source.id, source]));
  const versionedSources = versioning.sources.filter(source => mappingByID.has(source.id));
  if (versionedSources.length !== EXPECTED_COUNT || mappingByID.size !== EXPECTED_COUNT) {
    throw new Error(`Expected ${EXPECTED_COUNT} versioned and mapped content extensions`);
  }
  const licensePath = join(ROOT, "licenses", "GPL-3.0-or-later.txt");
  await access(licensePath);
  const licenseBytes = await readFile(licensePath);
  const requestedIDs = option("--ids")?.split(",").map(value => value.trim()).filter(Boolean);
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
      version: source.version,
      language: source.language,
      languages: [source.language],
      contentRating: source.contentRating,
      availability,
      capabilities: capabilities(source, upstreamBundle),
      inventoryCapabilities: source.capabilities ?? [],
      permissions: permissions(source, upstreamBundle),
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
    const combined = `${sourceHeader(source, mapping)}\n${bridge.trim()}\n\n/* Unmodified compiled InkDex/Paperback bundle follows. */\n${upstreamBundle.trim()}\n\n/* MangaReader registration footer. */\n${footer}\n`;
    await Promise.all([
      writeJSON(join(directory, "extension.json"), metadata),
      writeFile(join(directory, "main.js"), combined),
      writeFile(join(directory, metadata.iconFile), iconBytes),
      writeFile(join(directory, "LICENSE"), licenseBytes),
      writeFile(join(directory, "specification.md"), specification(source, mapping, metadata)),
      writeFile(join(directory, "REVIEW_STATUS.md"), reviewStatus(source, mapping, metadata)),
      writeFile(join(directory, "PRIVACY.md"), privacy(source, metadata, mapping)),
      writeFile(join(directory, "RIGHTS.md"), rights(source, mapping)),
      writeJSON(join(directory, "provenance.json"), {
        ...mapping,
        importedFromRegistryBuild: versioning.buildTime,
        adapter: { name: "@mangareader/paperback-compat", version: "1.1.0", license: "GPL-3.0-or-later" },
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

  console.log(`Imported ${statuses.length} selected GPL extensions (${statuses.filter(item => item.availability === "approvalRequired").length} awaiting activation review).`);
}

main().catch(error => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
