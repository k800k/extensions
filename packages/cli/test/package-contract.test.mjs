/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createExtensionArchive } from "../bin/mr-ext.mjs";
import { assertContentExtension } from "../lib/contracts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceFixture = join(root, "extensions", "content", "MangaDex");
const removedRecords = ["PRIVACY.md", "REVIEW_STATUS.md", "RIGHTS.md", "specification.md"];
const expectedNoticeIDs = ["Comix", "HitomiLA", "MangaBat", "MangaDemon", "MangaKakalot", "NHentai", "WeebCentral"];

async function temporaryFixture(run) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mangareader-package-contract-"));
  const fixture = join(temporaryRoot, "MangaDex");
  try {
    await cp(sourceFixture, fixture, { recursive: true });
    await run(fixture);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function zipEntryNames(archive) {
  const names = [];
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    names.push(archive.toString("utf8", offset + 30, offset + 30 + nameLength));
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  return names;
}

test("package admission allows extension-managed dynamic JavaScript", async () => {
  await temporaryFixture(async fixture => {
    const mainPath = join(fixture, "main.js");
    const main = await readFile(mainPath, "utf8");
    const dynamicJavaScript = `
const admittedDynamicJavaScript = () => [
  eval("1"),
  new Function("return 1"),
  Function("return 1"),
  WebAssembly.Module,
  import("./runtime-module.mjs")
];
`;
    await writeFile(mainPath, `${dynamicJavaScript}${main}`);
    await assertContentExtension(fixture, "MangaDex");
  });
});

test("package admission still rejects direct networking APIs", async () => {
  for (const directCall of [
    'fetch("https://example.com")',
    'XMLHttpRequest("https://example.com")',
    'WebSocket("wss://example.com")',
    'EventSource("https://example.com")'
  ]) {
    await temporaryFixture(async fixture => {
      const mainPath = join(fixture, "main.js");
      const main = await readFile(mainPath, "utf8");
      await writeFile(mainPath, `const directNetworkProbe = () => ${directCall};\n${main}`);
      await assert.rejects(assertContentExtension(fixture, "MangaDex"), /brokered runtime client/);
    });
  }
});

test("extension packages no longer carry per-source review records", async () => {
  for (const kind of ["content", "tracker"]) {
    const kindDirectory = join(root, "extensions", kind);
    for (const entry of await readdir(kindDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const filename of removedRecords) {
        await assert.rejects(readFile(join(kindDirectory, entry.name, filename)), error => error.code === "ENOENT");
      }
    }
  }
});

test("all checked archives include optional notices and remain byte-for-byte deterministic", async () => {
  const repositoryLicense = await readFile(join(root, "LICENSE"));
  const dist = join(root, "dist", "v1", "stable");
  const catalog = JSON.parse(await readFile(join(dist, "catalog.json"), "utf8"));
  const noticeIDs = [];

  for (const source of catalog.sources) {
    const extensionDirectory = join(root, "extensions", source.kind, source.id);
    const sourceFiles = await readdir(extensionDirectory);
    const hasNotice = sourceFiles.includes("NOTICE");
    const first = await createExtensionArchive(extensionDirectory, repositoryLicense);
    const second = await createExtensionArchive(extensionDirectory, repositoryLicense);
    const checkedArchive = await readFile(join(dist, source.mangaReaderExtension.packageURL));
    const expectedEntries = ["LICENSE", "extension.json", "main.js", ...(hasNotice ? ["NOTICE"] : [])].sort();

    if (hasNotice) noticeIDs.push(source.id);
    assert.deepEqual(first.archive, second.archive, `${source.id} archive is not deterministic`);
    assert.deepEqual(first.archive, checkedArchive, `${source.id} checked package differs from a deterministic rebuild`);
    assert.deepEqual(zipEntryNames(first.archive).sort(), expectedEntries, `${source.id} archive entries`);
    assert.equal(Boolean(first.notice), hasNotice, `${source.id} NOTICE packaging`);
    assert.equal(
      first.uncompressedSize,
      first.license.length + (first.notice?.length ?? 0) + first.metadataBytes.length + first.main.length,
      `${source.id} uncompressed size`
    );
    assert.equal(
      createHash("sha256").update(first.archive).digest("hex"),
      source.mangaReaderExtension.sha256,
      `${source.id} catalog package hash`
    );
  }

  assert.deepEqual(noticeIDs.sort((left, right) => left.localeCompare(right)), expectedNoticeIDs);
});
