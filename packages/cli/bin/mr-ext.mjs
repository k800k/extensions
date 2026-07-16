#!/usr/bin/env node
/*
 * Copyright 2026 MangaReader Extension Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { createServer } from "node:http";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const TRACKERS = new Set(["AniList", "MangaUpdates"]);
const API_VERSION = "1.0";
const PINNED_COUNT = 68;
const APACHE_HEADER = "/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */";

const args = process.argv.slice(2);
const command = args.shift();
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = name => args.includes(name);

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const safeID = value => /^[A-Za-z0-9._-]{1,128}$/.test(value);
const extensionDirectory = (kind, id) => join(ROOT, "extensions", kind, id);

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json(value));
}

function neutralSVG(id, rating) {
  const palette = rating === "ADULT" ? ["#8f2d56", "#d81159"] : rating === "MATURE" ? ["#6c4ab6", "#b185db"] : ["#16697a", "#489fb5"];
  const initials = id.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "MR";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${id} placeholder"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs><rect width="256" height="256" rx="48" fill="url(#g)"/><path d="M59 52h138v152H59z" fill="#fff" opacity=".16"/><text x="128" y="148" text-anchor="middle" font-family="system-ui,sans-serif" font-size="68" font-weight="700" fill="#fff">${initials}</text></svg>\n`;
}

function scaffoldSource(id, kind) {
  const unavailable = `const unavailable = () => { const error = new Error("${id} is awaiting review"); error.name = "ExtensionUnavailableError"; throw error; };`;
  if (kind === "tracker") {
    return `${APACHE_HEADER}\n${unavailable}\ndefineTrackerExtension({\n  id: ${JSON.stringify(id)},\n  apiVersion: "1.0",\n  initialize: unavailable,\n  settings: () => ({ id: "settings", title: "${id}", fields: [] }),\n  authentication: () => ({ mode: "none" }),\n  search: unavailable,\n  progress: unavailable,\n  update: unavailable,\n  collections: unavailable\n});\n`;
  }
  return `${APACHE_HEADER}\n${unavailable}\ndefineContentExtension({\n  id: ${JSON.stringify(id)},\n  apiVersion: "1.0",\n  initialize: unavailable,\n  settings: () => ({ id: "settings", title: "${id}", fields: [] }),\n  discoverSections: unavailable,\n  discover: unavailable,\n  searchFilters: () => ({ id: "search", title: "Search", fields: [] }),\n  search: unavailable,\n  details: unavailable,\n  installments: unavailable,\n  imagePages: unavailable,\n  imagePageContent: unavailable,\n  updates: unavailable,\n  managedCollections: unavailable\n});\n`;
}

async function createScaffold(entry) {
  if (!safeID(entry.id)) throw new Error(`Unsafe inventory id: ${entry.id}`);
  const kind = TRACKERS.has(entry.id) ? "tracker" : "content";
  const directory = extensionDirectory(kind, entry.id);
  await mkdir(join(directory, "tests"), { recursive: true });
  const metadata = {
    id: entry.id,
    name: entry.name,
    kind,
    apiVersion: API_VERSION,
    version: "0.1.0",
    language: entry.language,
    contentRating: entry.contentRating,
    availability: "approvalRequired",
    capabilities: [],
    inventoryCapabilities: entry.capabilities,
    permissions: ["network"],
    allowedHTTPSHosts: ["blocked.mangareader.invalid"],
    authenticationModes: ["none"]
  };
  await writeJSON(join(directory, "extension.json"), metadata);
  await writeFile(join(directory, "main.js"), scaffoldSource(entry.id, kind));
  await writeFile(join(directory, "specification.md"), `# ${entry.name} extension specification\n\nStatus: **activation prohibited — behavioral specification incomplete**.\n\nCatalog metadata: ID \`${entry.id}\`, language \`${entry.language}\`, rating \`${entry.contentRating}\`, capability categories \`${entry.capabilities.join(", ")}\`.\n\nBefore activation, document the target service's API behavior, terms, authentication flow, pagination, discovery, search, details, installments/pages or tracker operations, challenge behavior, error cases, and representative fixtures. Placeholder host \`blocked.mangareader.invalid\` must be replaced by reviewed service hosts.\n`);
  await writeFile(join(directory, "REVIEW_STATUS.md"), `# Review status for ${entry.id}\n\nActivation review: **pending**. Complete the specification, privacy and rights records, host declarations, contract suite, publisher signature, and MangaReader approval before activation.\n`);
  await writeFile(join(directory, "PRIVACY.md"), `# Privacy assessment for ${entry.id}\n\nStatus: **pending; activation prohibited**. No live service host is declared. Before activation, document every transmitted data category, credential/cookie use, retention behavior, OAuth or web-session handoff, user controls, and the service privacy policy. MangaReader must route traffic only to the approved HTTPS host list.\n`);
  await writeFile(join(directory, "RIGHTS.md"), `# Rights record for ${entry.id}\n\nStatus: **authorization evidence pending; activation prohibited**. Record the service terms, API authorization, content-access rights, trademark decision, report contact, reviewer, and review date before requesting MangaReader approval. The generated neutral icon makes no use of service artwork or marks.\n`);
  await writeJSON(join(directory, "provenance.json"), {
    catalogFields: ["id", "name", "language", "contentRating", "capabilities"],
    generatedAt: "2026-07-15T00:00:00Z"
  });
  const relativeHelper = "../../../../packages/cli/lib/contracts.mjs";
  await writeFile(join(directory, "tests", "contract.test.mjs"), `${APACHE_HEADER}\nimport test from "node:test";\nimport { dirname, resolve } from "node:path";\nimport { fileURLToPath } from "node:url";\nimport { assertExtensionScaffold } from ${JSON.stringify(relativeHelper)};\nconst directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");\ntest(${JSON.stringify(`${entry.id} remains safely blocked until approval`)}, async () => {\n  await assertExtensionScaffold(directory, ${JSON.stringify(kind)}, ${JSON.stringify(entry.id)});\n});\n`);
}

async function seedCatalog() {
  const input = option("--input");
  if (!input) throw new Error("seed-catalog requires --input");
  const bytes = await readFile(resolve(input));
  const raw = JSON.parse(bytes);
  if (!Array.isArray(raw.sources)) throw new Error("Catalog seed must contain a sources array");
  // Select only catalog metadata fields.
  const entries = raw.sources.map(({ id, name, language, contentRating, capabilities }) => ({
    id, name, language, contentRating, capabilities: Array.isArray(capabilities) ? capabilities : []
  }));
  const ids = new Set(entries.map(entry => entry.id));
  if (entries.length !== PINNED_COUNT || ids.size !== PINNED_COUNT) {
    throw new Error(`Expected ${PINNED_COUNT} unique entries; found ${entries.length}/${ids.size}`);
  }
  await writeJSON(join(ROOT, "inventory", "registry.json"), { entries });
  await writeJSON(join(ROOT, "inventory", "status.json"), {
    generatedAt: "2026-07-15T00:00:00Z",
    counts: { content: entries.filter(entry => !TRACKERS.has(entry.id)).length, tracker: entries.filter(entry => TRACKERS.has(entry.id)).length },
    entries: entries.map(entry => ({ id: entry.id, kind: TRACKERS.has(entry.id) ? "tracker" : "content", availability: "approvalRequired", reason: "Extension specification, rights review, live contracts, and MangaReader approval are pending." }))
  });
  for (const entry of entries) await createScaffold(entry);
  console.log(`Seeded ${entries.length} catalog entries and generated extension scaffolds.`);
}

async function inventory() {
  return JSON.parse(await readFile(join(ROOT, "inventory", "registry.json"), "utf8"));
}

async function check() {
  const data = await inventory();
  const ids = data.entries.map(entry => entry.id);
  if (ids.length !== PINNED_COUNT || new Set(ids).size !== PINNED_COUNT) throw new Error("Inventory IDs are not the pinned 68 unique entries");
  const kinds = { content: 0, tracker: 0 };
  for (const entry of data.entries) {
    const kind = TRACKERS.has(entry.id) ? "tracker" : "content";
    kinds[kind]++;
    const directory = extensionDirectory(kind, entry.id);
    for (const required of ["extension.json", "main.js", "specification.md", "REVIEW_STATUS.md", "PRIVACY.md", "RIGHTS.md", "provenance.json", "tests/contract.test.mjs"]) {
      await access(join(directory, required));
    }
    const metadata = JSON.parse(await readFile(join(directory, "extension.json"), "utf8"));
    if (metadata.id !== entry.id || metadata.kind !== kind || metadata.apiVersion !== API_VERSION) throw new Error(`Invalid metadata for ${entry.id}`);
    if (metadata.availability !== "approvalRequired") throw new Error(`${entry.id} must remain approvalRequired until reviewed`);
    const source = await readFile(join(directory, "main.js"), "utf8");
    if (/from\s+["'][^"']*paperback/i.test(source)) throw new Error(`Forbidden runtime import in ${entry.id}`);
    if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|WebAssembly)\b/.test(source)) throw new Error(`Direct platform networking in ${entry.id}`);
  }
  if (kinds.content !== 66 || kinds.tracker !== 2) throw new Error(`Expected 66 content and 2 tracker directories; found ${JSON.stringify(kinds)}`);
  const manifestPath = join(ROOT, "dist", "v1", "stable", "mangareader-repository.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const manifestIDs = manifest.sources.map(source => source.id);
    if (manifest.schemaVersion !== 2 || manifestIDs.length !== PINNED_COUNT || new Set(manifestIDs).size !== PINNED_COUNT) throw new Error("Generated V2 manifest IDs are invalid");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  console.log(`check: ${kinds.content} content + ${kinds.tracker} tracker directories are valid`);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    const filename = Buffer.from(name);
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0, 6); header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10); header.writeUInt16LE(33, 12); header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26); header.writeUInt16LE(0, 28);
    local.push(header, filename, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0, 8); directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(0, 12); directory.writeUInt16LE(33, 14); directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt16LE(0, 30); directory.writeUInt16LE(0, 32); directory.writeUInt16LE(0, 34); directory.writeUInt16LE(0, 36); directory.writeUInt32LE(0, 38); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + data.length;
  }
  const directoryBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  const count = Object.keys(entries).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directoryBytes.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, directoryBytes, end]);
}

async function buildArtifacts() {
  const data = await inventory();
  const config = JSON.parse(await readFile(join(ROOT, "repository.config.json"), "utf8"));
  const license = await readFile(join(ROOT, "LICENSE"));
  const output = join(ROOT, "dist", "v1", "stable");
  await mkdir(join(output, "packages"), { recursive: true });
  await mkdir(join(output, "icons"), { recursive: true });
  const sources = [];
  const catalog = [];
  for (const entry of data.entries) {
    const kind = TRACKERS.has(entry.id) ? "tracker" : "content";
    const directory = extensionDirectory(kind, entry.id);
    const metadataBytes = await readFile(join(directory, "extension.json"));
    const metadata = JSON.parse(metadataBytes);
    const main = await readFile(join(directory, "main.js"));
    const archive = zip({ "LICENSE": license, "extension.json": metadataBytes, "main.js": main });
    const packageName = `${entry.id}-${metadata.version}.mrx`;
    await writeFile(join(output, "packages", packageName), archive);
    await writeFile(join(output, "icons", `${entry.id}.svg`), neutralSVG(entry.id, entry.contentRating));
    const uncompressedSize = license.length + metadataBytes.length + main.length;
    const source = {
      id: entry.id,
      name: entry.name,
      description: "MangaReader-native extension scaffold. Activation is blocked until its specification, rights review, live contracts, and MangaReader approval are complete.",
      version: metadata.version,
      icon: `icons/${entry.id}.svg`,
      languages: [entry.language],
      contentRating: entry.contentRating,
      capabilities: [],
      developers: [{ name: config.publisherName }],
      universalLink: `https://kayvenchen.github.io/mangareader/repository/install?url=https%3A%2F%2Fk800k.github.io%2Fextensions%2Fdist%2Fv1%2Fstable%2F&source=${encodeURIComponent(entry.id)}`,
      rightsDeclaration: "Activation prohibited until the extension rights record and service authorization evidence are approved.",
      rightsURL: `https://github.com/k800k/extensions/blob/main/extensions/${kind}/${entry.id}/RIGHTS.md`,
      reportURL: "https://github.com/k800k/extensions/issues/new/choose",
      entryType: "mangaReaderExtension",
      kind,
      availability: "approvalRequired",
      permissions: { values: ["network"] },
      connectorPreset: null,
      mangaReaderExtension: {
        apiVersion: API_VERSION,
        packageURL: `packages/${packageName}`,
        sha256: sha256(archive),
        compressedSize: archive.length,
        uncompressedSize,
        allowedHTTPSHosts: ["blocked.mangareader.invalid"],
        authenticationModes: ["none"]
      }
    };
    sources.push(source);
    catalog.push({ ...source, inventoryCapabilities: entry.capabilities, packageSHA256: source.mangaReaderExtension.sha256 });
  }
  const manifest = {
    schemaVersion: 2,
    repository: {
      id: config.id,
      name: config.name,
      description: config.description,
      homepage: config.homepage,
      privacyURL: config.privacyURL,
      publisher: { name: config.publisherName, publicKey: config.publisherPublicKey }
    },
    sources,
    mangaReaderApproval: null
  };
  await writeFile(join(output, "mangareader-repository.json"), Buffer.from(JSON.stringify(manifest)));
  await writeJSON(join(output, "catalog.json"), { repositoryURL: "https://k800k.github.io/extensions/dist/v1/stable/", sources: catalog });
  console.log(`Bundled ${sources.length} deterministic .mrx packages.`);
  return manifest;
}

function publicKeyFromRaw(raw) {
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([prefix, raw]), format: "der", type: "spki" });
}

async function publish() {
  const output = join(ROOT, "dist", "v1", "stable");
  const configPath = join(ROOT, "repository.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const privateKeyPath = option("--key");
  if (privateKeyPath) {
    const privateKey = createPrivateKey(await readFile(resolve(privateKeyPath)));
    const rawPublicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" }).subarray(-32);
    config.publisherPublicKey = rawPublicKey.toString("base64");
    await writeJSON(configPath, config);
    await buildArtifacts();
    const manifestBytes = await readFile(join(output, "mangareader-repository.json"));
    await writeFile(join(output, "mangareader-repository.sig"), `${sign(null, manifestBytes, privateKey).toString("base64")}\n`);
  }
  const manifestBytes = await readFile(join(output, "mangareader-repository.json"));
  const signature = Buffer.from((await readFile(join(output, "mangareader-repository.sig"), "utf8")).trim(), "base64");
  const current = JSON.parse(manifestBytes);
  const raw = Buffer.from(current.repository.publisher.publicKey, "base64");
  if (raw.length !== 32 || !verify(null, manifestBytes, publicKeyFromRaw(raw), signature)) throw new Error("Publisher signature verification failed");
  for (const source of current.sources) {
    const bytes = await readFile(join(output, source.mangaReaderExtension.packageURL));
    if (bytes.length !== source.mangaReaderExtension.compressedSize || sha256(bytes) !== source.mangaReaderExtension.sha256) throw new Error(`Package hash mismatch: ${source.id}`);
  }
  if (current.mangaReaderApproval !== null) throw new Error("The offline MangaReader approval must never be generated in extension-repository CI");
  console.log(`publish dry-run: exact-byte signature and ${current.sources.length} package hashes verified; entries remain approvalRequired`);
}

async function createNew() {
  const id = option("--id");
  const name = option("--name") ?? id;
  const kind = option("--kind") ?? "content";
  if (!id || !safeID(id) || !["content", "tracker"].includes(kind)) throw new Error("new requires a safe --id and --kind content|tracker");
  const entry = { id, name, language: "en", contentRating: "SAFE", capabilities: [] };
  if (kind === "tracker") TRACKERS.add(id);
  await createScaffold(entry);
  console.log(`Created ${relative(ROOT, extensionDirectory(kind, id))}`);
}

async function serve() {
  const port = Number(option("--port") ?? 4173);
  const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".mrx": "application/zip" };
  const server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);
      if (pathname === "/") pathname = "/index.html";
      const base = pathname.startsWith("/dist/") ? ROOT : join(ROOT, "site");
      const path = resolve(base, `.${pathname}`);
      if (!path.startsWith(`${base}${sep}`)) throw new Error("unsafe path");
      const bytes = await readFile(path);
      response.writeHead(200, { "Content-Type": contentTypes[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(bytes);
    } catch {
      response.writeHead(404); response.end("Not found");
    }
  });
  server.listen(port, "127.0.0.1", () => console.log(`MangaReader catalog: http://127.0.0.1:${port}`));
}

try {
  switch (command) {
  case "seed-catalog": await seedCatalog(); break;
  case "new": await createNew(); break;
  case "check": await check(); break;
  case "test": await check(); break;
  case "bundle": await buildArtifacts(); break;
  case "publish": await publish(); break;
  case "serve": await serve(); break;
  default:
    console.log("mr-ext new|seed-catalog|check|test|bundle|serve|publish");
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
