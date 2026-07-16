#!/usr/bin/env node
/*
 * Copyright 2026 MangaReader Extension Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { API_VERSION, assertContentExtension } from "../lib/contracts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CONTENT_ROOT = join(ROOT, "extensions", "content");
const APACHE_HEADER = "/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */";

const args = process.argv.slice(2);
const command = args.shift();
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const safeID = value => /^[A-Za-z0-9._-]{1,128}$/.test(value);
const extensionDirectory = id => join(CONTENT_ROOT, id);

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json(value));
}

function neutralSVG(id, rating) {
  const palette = rating === "ADULT" ? ["#8f2d56", "#d81159"] : rating === "MATURE" ? ["#6c4ab6", "#b185db"] : ["#16697a", "#489fb5"];
  const initials = id.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "MR";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${id} placeholder"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs><rect width="256" height="256" rx="48" fill="url(#g)"/><path d="M59 52h138v152H59z" fill="#fff" opacity=".16"/><text x="128" y="148" text-anchor="middle" font-family="system-ui,sans-serif" font-size="68" font-weight="700" fill="#fff">${initials}</text></svg>\n`;
}

function scaffoldSource(id) {
  const unavailable = `const unavailable = () => { const error = new Error("${id} is awaiting review"); error.name = "ExtensionUnavailableError"; throw error; };`;
  return `${APACHE_HEADER}\n${unavailable}\ndefineContentExtension({\n  id: ${JSON.stringify(id)},\n  apiVersion: "1.0",\n  initialize: unavailable,\n  settings: () => ({ id: "settings", title: ${JSON.stringify(id)}, fields: [] }),\n  discoverSections: unavailable,\n  discover: unavailable,\n  searchFilters: () => ({ id: "search", title: "Search", fields: [] }),\n  search: unavailable,\n  details: unavailable,\n  installments: unavailable,\n  imagePages: unavailable,\n  imagePageContent: unavailable,\n  updates: unavailable,\n  managedCollections: unavailable\n});\n`;
}

async function createScaffold(entry) {
  if (!safeID(entry.id)) throw new Error(`Unsafe extension id: ${entry.id}`);
  if (entry.kind && entry.kind !== "content") throw new Error("Only content extensions are supported");
  const directory = extensionDirectory(entry.id);
  await mkdir(join(directory, "tests"), { recursive: true });
  const metadata = {
    id: entry.id,
    name: entry.name || entry.id,
    description: "MangaReader content extension scaffold. Activation is blocked until review is complete.",
    kind: "content",
    apiVersion: API_VERSION,
    version: "0.1.0",
    language: entry.language || "en",
    languages: [entry.language || "en"],
    contentRating: entry.contentRating || "SAFE",
    availability: "approvalRequired",
    capabilities: [],
    permissions: ["network"],
    allowedHTTPSHosts: ["blocked.mangareader.invalid"],
    authenticationModes: ["none"],
    developers: [{ name: "MangaReader Extension Contributors" }],
    iconFile: "icon.svg",
    license: "Apache-2.0"
  };
  await writeJSON(join(directory, "extension.json"), metadata);
  await writeFile(join(directory, "main.js"), scaffoldSource(entry.id));
  await writeFile(join(directory, "icon.svg"), neutralSVG(entry.id, metadata.contentRating));
  await writeFile(join(directory, "specification.md"), `# ${metadata.name} extension specification\n\nStatus: **activation prohibited — behavioral specification incomplete**.\n\nBefore activation, document the target service API, terms, authentication, pagination, discovery, search, details, installments, pages, challenge behavior, error cases, and representative fixtures. Replace the placeholder host only after review.\n`);
  await writeFile(join(directory, "REVIEW_STATUS.md"), `# Review status for ${entry.id}\n\nActivation review: **pending**. Complete the specification, privacy and rights records, host declarations, contract suite, publisher signature, and MangaReader approval before activation.\n`);
  await writeFile(join(directory, "PRIVACY.md"), `# Privacy assessment for ${entry.id}\n\nStatus: **pending; activation prohibited**. Before activation, document every transmitted data category, credential or cookie use, retention behavior, authentication handoff, user controls, and the target service privacy policy.\n`);
  await writeFile(join(directory, "RIGHTS.md"), `# Rights record for ${entry.id}\n\nStatus: **authorization evidence pending; activation prohibited**. Record the service terms, API authorization, content-access rights, trademark decision, report contact, reviewer, and review date before requesting approval.\n`);
  const relativeHelper = "../../../../packages/cli/lib/contracts.mjs";
  await writeFile(join(directory, "tests", "contract.test.mjs"), `${APACHE_HEADER}\nimport test from "node:test";\nimport { dirname, resolve } from "node:path";\nimport { fileURLToPath } from "node:url";\nimport { assertContentExtension } from ${JSON.stringify(relativeHelper)};\nconst directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");\ntest(${JSON.stringify(`${entry.id} is a valid content extension package`)}, async () => {\n  await assertContentExtension(directory, ${JSON.stringify(entry.id)});\n});\n`);
}

async function seedCatalog() {
  const input = option("--input");
  if (!input) throw new Error("seed-catalog requires --input");
  const raw = JSON.parse(await readFile(resolve(input)));
  if (!Array.isArray(raw.sources)) throw new Error("Catalog seed must contain a sources array");
  const entries = raw.sources.map(source => ({
    id: source.id,
    name: source.name,
    kind: source.kind || "content",
    language: source.language || source.languages?.[0] || "en",
    contentRating: source.contentRating || "SAFE"
  }));
  const ids = new Set(entries.map(entry => entry.id));
  if (ids.size !== entries.length) throw new Error("Catalog seed contains duplicate extension IDs");
  if (entries.some(entry => entry.kind !== "content")) throw new Error("Catalog seed contains an unsupported tracker or theme extension");
  for (const entry of entries) await createScaffold(entry);
  console.log(`Seeded ${entries.length} content extension scaffold${entries.length === 1 ? "" : "s"}.`);
}

async function contentExtensionIDs() {
  await mkdir(CONTENT_ROOT, { recursive: true });
  const entries = await readdir(CONTENT_ROOT, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort((a, b) => a.localeCompare(b));
}

async function assertContentOnlyLayout() {
  const entries = await readdir(join(ROOT, "extensions"), { withFileTypes: true });
  const unsupported = entries.filter(entry => entry.isDirectory() && entry.name !== "content");
  if (unsupported.length) throw new Error(`Unsupported extension directories: ${unsupported.map(entry => entry.name).join(", ")}`);
}

async function check() {
  await assertContentOnlyLayout();
  const ids = await contentExtensionIDs();
  if (new Set(ids).size !== ids.length) throw new Error("Extension IDs must be unique");
  for (const id of ids) await assertContentExtension(extensionDirectory(id), id);
  const manifestPath = join(ROOT, "dist", "v1", "stable", "mangareader-repository.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const manifestIDs = manifest.sources.map(source => source.id);
    if (manifest.schemaVersion !== 2 || JSON.stringify(manifestIDs) !== JSON.stringify(ids)) throw new Error("Generated manifest does not match the content extension directories");
    if (manifest.sources.some(source => source.kind !== "content")) throw new Error("Generated manifest contains a non-content extension");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  console.log(`check: ${ids.length} content extension${ids.length === 1 ? "" : "s"}; tracker and theme extensions are unsupported`);
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

async function pruneGeneratedFiles(directory, expected, matchesGeneratedName) {
  await mkdir(directory, { recursive: true });
  for (const filename of await readdir(directory)) {
    if (matchesGeneratedName(filename) && !expected.has(filename)) await unlink(join(directory, filename));
  }
}

async function buildArtifacts() {
  await assertContentOnlyLayout();
  const ids = await contentExtensionIDs();
  const config = JSON.parse(await readFile(join(ROOT, "repository.config.json"), "utf8"));
  const license = await readFile(join(ROOT, "LICENSE"));
  const output = join(ROOT, "dist", "v1", "stable");
  const packagesDirectory = join(output, "packages");
  const iconsDirectory = join(output, "icons");
  await mkdir(packagesDirectory, { recursive: true });
  await mkdir(iconsDirectory, { recursive: true });
  const sources = [];
  const catalog = [];
  const packageNames = new Set();
  const iconNames = new Set();
  for (const id of ids) {
    const directory = extensionDirectory(id);
    const metadata = await assertContentExtension(directory, id);
    const metadataBytes = await readFile(join(directory, "extension.json"));
    const main = await readFile(join(directory, "main.js"));
    const archive = zip({ "LICENSE": license, "extension.json": metadataBytes, "main.js": main });
    const packageName = `${id}-${metadata.version}.mrx`;
    packageNames.add(packageName);
    await writeFile(join(packagesDirectory, packageName), archive);
    const iconExtension = extname(metadata.iconFile).toLowerCase();
    const iconName = `${id}${iconExtension}`;
    iconNames.add(iconName);
    const iconBytes = await readFile(join(directory, metadata.iconFile));
    await writeFile(join(iconsDirectory, iconName), iconBytes);
    const source = {
      id,
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      icon: `icons/${iconName}`,
      languages: metadata.languages,
      contentRating: metadata.contentRating,
      capabilities: metadata.capabilities,
      developers: metadata.developers.map(developer => ({ name: developer.name })),
      universalLink: `https://kayvenchen.github.io/mangareader/repository/install?url=https%3A%2F%2Fk800k.github.io%2Fextensions%2Fdist%2Fv1%2Fstable%2F&source=${encodeURIComponent(id)}`,
      rightsDeclaration: "Review the extension rights record before installation.",
      rightsURL: `https://github.com/k800k/extensions/blob/main/extensions/content/${id}/RIGHTS.md`,
      reportURL: "https://github.com/k800k/extensions/issues/new/choose",
      entryType: "mangaReaderExtension",
      kind: "content",
      availability: metadata.availability,
      permissions: { values: metadata.permissions },
      connectorPreset: null,
      mangaReaderExtension: {
        apiVersion: API_VERSION,
        packageURL: `packages/${packageName}`,
        sha256: sha256(archive),
        compressedSize: archive.length,
        uncompressedSize: license.length + metadataBytes.length + main.length,
        allowedHTTPSHosts: metadata.allowedHTTPSHosts,
        authenticationModes: metadata.authenticationModes
      }
    };
    sources.push(source);
    catalog.push({
      ...source,
      developers: metadata.developers,
      packageSHA256: source.mangaReaderExtension.sha256,
      license: metadata.license || "Apache-2.0"
    });
  }
  await pruneGeneratedFiles(packagesDirectory, packageNames, filename => filename.endsWith(".mrx"));
  await pruneGeneratedFiles(iconsDirectory, iconNames, filename => /\.(?:svg|png|jpe?g|webp|ico)$/i.test(filename));
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
  await writeJSON(join(ROOT, "inventory", "registry.json"), { entries: ids.map(id => ({ id, kind: "content" })) });
  await writeJSON(join(ROOT, "inventory", "status.json"), { counts: { content: ids.length }, entries: sources.map(source => ({ id: source.id, kind: "content", availability: source.availability })) });
  console.log(`Bundled ${sources.length} deterministic content extension package${sources.length === 1 ? "" : "s"}.`);
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
  console.log(`publish dry-run: signature and ${current.sources.length} content package hash${current.sources.length === 1 ? "" : "es"} verified`);
}

async function createNew() {
  const id = option("--id");
  const name = option("--name") || id;
  const kind = option("--kind") || "content";
  if (!id || !safeID(id)) throw new Error("new requires a safe --id");
  if (kind !== "content") throw new Error("Only --kind content is supported; tracker and theme extensions have been removed");
  await createScaffold({ id, name, kind: "content", language: "en", contentRating: "SAFE" });
  console.log(`Created ${relative(ROOT, extensionDirectory(id))}`);
}

async function serve() {
  const port = Number(option("--port") || 4173);
  const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".xml": "application/xml", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".mrx": "application/zip" };
  const server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);
      if (pathname === "/extensions") pathname = "/";
      else if (pathname.startsWith("/extensions/")) pathname = pathname.slice("/extensions".length);
      if (pathname === "/") pathname = "/index.html";
      const base = pathname.startsWith("/dist/") ? ROOT : join(ROOT, "site");
      const path = resolve(base, `.${pathname}`);
      if (!path.startsWith(`${base}${sep}`)) throw new Error("unsafe path");
      const candidates = extname(path) ? [path] : [path, `${path}.html`, join(path, "index.html")];
      let resolvedPath;
      let bytes;
      for (const candidate of candidates) {
        try {
          bytes = await readFile(candidate);
          resolvedPath = candidate;
          break;
        } catch (error) {
          if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
        }
      }
      if (!resolvedPath) throw new Error("not found");
      response.writeHead(200, { "Content-Type": contentTypes[extname(resolvedPath)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end("Not found");
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
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
