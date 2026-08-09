#!/usr/bin/env node
/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_OWNED_CONTENT_IDS } from "./source-owned.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AIDOKU_REPOSITORY = "https://github.com/Aidoku-Community/sources";
const AIDOKU_COMMIT = "1faa9c5cfbf67af7cd18a302045a8d093e35867f";
const checkOnly = process.argv.includes("--check");

const sha256 = value => createHash("sha256").update(value).digest("hex");
const json = value => `${JSON.stringify(value, null, 2)}\n`;

async function expectedOutputs(id) {
  const directory = join(ROOT, "extensions", "content", id);
  const configuration = JSON.parse(await readFile(join(directory, "source-owned.json"), "utf8"));
  const metadata = JSON.parse(await readFile(join(directory, "extension.json"), "utf8"));
  if (configuration.id !== id || metadata.id !== id) throw new Error(`${id} source-owned identity mismatch`);
  if (configuration.upstreamCommit !== AIDOKU_COMMIT) throw new Error(`${id} must pin Aidoku commit ${AIDOKU_COMMIT}`);
  if (!Array.isArray(configuration.upstreamPaths) || !configuration.upstreamPaths.length) {
    throw new Error(`${id} must declare at least one Aidoku source path`);
  }

  const sourceDirectory = join(directory, "src");
  const files = (await readdir(sourceDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith(".js"))
    .map(entry => entry.name)
    .sort();
  if (!files.length) throw new Error(`${id} has no modular JavaScript source`);
  const modules = [];
  const modulePaths = [
    ...(configuration.sharedModules ?? []),
    ...files.map(file => `extensions/content/${id}/src/${file}`)
  ];
  for (const relativePath of modulePaths) {
    const text = await readFile(join(ROOT, relativePath), "utf8");
    if (/^\s*(?:import|export)\b/m.test(text)) throw new Error(`${relativePath} must be a concatenatable script module`);
    modules.push({ file: relativePath, text: text.trim(), sha256: sha256(text) });
  }

  const header = `/*!
 * ${metadata.name} for manko
 * SPDX-License-Identifier: Apache-2.0
 * Source-owned JavaScript port; generated from extensions/content/${id}/src.
 * Algorithm reference: ${AIDOKU_REPOSITORY}
 * Reference commit: ${AIDOKU_COMMIT}
 * Reference paths: ${configuration.upstreamPaths.join(", ")}
 */`;
  const main = `${header}\n\n${modules.map(module => module.text).join("\n\n")}\n`;
  if (!/defineContentExtension\s*\(/.test(main)) throw new Error(`${id} generated source does not register a content extension`);

  const notice = `${metadata.name} source adapter\n\n`
    + `Copyright 2025 Aidoku community source contributors\n\n`
    + `MODIFIED ADAPTATION NOTICE: This JavaScript adapter is an independently modified\n`
    + `adaptation for manko; it is not a verbatim Aidoku package build.\n\n`
    + `Portions of the service algorithms were adapted from Aidoku Community Sources\n`
    + `(${AIDOKU_REPOSITORY}) at commit ${AIDOKU_COMMIT}:\n`
    + configuration.upstreamPaths.map(path => `- ${path}`).join("\n")
    + `\n\nAidoku Community Sources is offered under the Apache License 2.0 or MIT License.\n`
    + `This package uses the Apache License 2.0 option. See LICENSE.\n`;
  const license = await readFile(join(ROOT, "LICENSE"), "utf8");
  const provenance = json({
    schemaVersion: 1,
    sourceOwned: true,
    id,
    releaseVersion: metadata.version,
    generator: "scripts/build-source-owned.mjs",
    upstream: {
      repository: AIDOKU_REPOSITORY,
      commit: AIDOKU_COMMIT,
      paths: configuration.upstreamPaths,
      licenseChoice: "Apache-2.0"
    },
    modules: modules.map(({ file, sha256 }) => ({ file, sha256 })),
    generatedMainSHA256: sha256(main)
  });
  return new Map([
    [join(directory, "main.js"), main],
    [join(directory, "NOTICE"), notice],
    [join(directory, "LICENSE"), license],
    [join(directory, "provenance.json"), provenance]
  ]);
}

async function update(path, expected) {
  let actual = null;
  try {
    actual = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (actual === expected) return false;
  if (checkOnly) throw new Error(`${path.slice(ROOT.length + 1)} is not generated from its modular source`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, expected);
  return true;
}

let changed = 0;
for (const id of SOURCE_OWNED_CONTENT_IDS) {
  for (const [path, expected] of await expectedOutputs(id)) {
    if (await update(path, expected)) changed += 1;
  }
}
console.log(`${checkOnly ? "checked" : "generated"}: ${SOURCE_OWNED_CONTENT_IDS.length} source-owned extensions${checkOnly ? "" : ` (${changed} files updated)`}`);
