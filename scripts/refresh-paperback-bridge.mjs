#!/usr/bin/env node
// Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IDS = [
  "AllPornComic", "Atsumaru", "LNori", "MadaraDex", "MangaDex",
  "MangaDot", "MangaFox", "Mangago", "RoyalRoad", "Webtoon"
];
const checkOnly = process.argv.includes("--check");
const bridge = (await readFile(join(ROOT, "packages", "paperback-compat", "bridge.js"), "utf8")).trim();
const bridgeStart = "/* SPDX-License-Identifier: GPL-3.0-or-later */";
const bundleMarkers = [
  "/* Hash-guarded compatibility-patched compiled InkDex/Paperback bundle follows. */",
  "/* Unmodified compiled InkDex/Paperback bundle follows. */"
];
const sha256 = value => createHash("sha256").update(value).digest("hex");
const json = value => `${JSON.stringify(value, null, 2)}\n`;
let changed = 0;

for (const id of IDS) {
  const directory = join(ROOT, "extensions", "content", id);
  const [current, manifestText, provenanceText] = await Promise.all([
    readFile(join(directory, "main.js"), "utf8"),
    readFile(join(directory, "extension.json"), "utf8"),
    readFile(join(directory, "provenance.json"), "utf8")
  ]);
  const start = current.indexOf(bridgeStart);
  const marker = Math.max(...bundleMarkers.map(value => current.indexOf(value)));
  if (start < 0 || marker <= start) throw new Error(`${id} does not contain a replaceable Paperback bridge`);
  const header = current.slice(0, start).replace(/Paperback compatibility bridge v[0-9.]+/, "Paperback compatibility bridge v1.2");
  const expected = `${header}${bridge}\n\n${current.slice(marker)}`;
  const manifest = JSON.parse(manifestText);
  const provenance = JSON.parse(provenanceText);
  const expectedProvenance = {
    ...provenance,
    releaseVersion: manifest.version,
    adapter: { name: "@manko/paperback-compat", version: "1.2.0", license: "GPL-3.0-or-later" },
    generatedMainSHA256: sha256(expected)
  };
  if (current === expected && provenanceText === json(expectedProvenance)) continue;
  if (checkOnly) throw new Error(`${id} is not generated with the current Paperback bridge`);
  await Promise.all([
    writeFile(join(directory, "main.js"), expected),
    writeFile(join(directory, "provenance.json"), json(expectedProvenance))
  ]);
  changed++;
}

console.log(`${checkOnly ? "checked" : "refreshed"}: ${IDS.length} Paperback extensions${checkOnly ? "" : ` (${changed} updated)`}`);
