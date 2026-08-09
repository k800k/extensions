/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertContentExtension } from "../lib/contracts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceFixture = join(root, "extensions", "content", "MangaDex");
const removedRecords = ["PRIVACY.md", "REVIEW_STATUS.md", "RIGHTS.md", "specification.md"];

async function temporaryFixture(run) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "manko-extension-contract-"));
  const fixture = join(temporaryRoot, "MangaDex");
  try {
    await cp(sourceFixture, fixture, { recursive: true });
    await run(fixture);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
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

test("extension source directories no longer carry per-source review records", async () => {
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

test("all checked direct scripts are byte-for-byte deterministic and catalog-pinned", async () => {
  const dist = join(root, "dist", "v1", "stable");
  const catalog = JSON.parse(await readFile(join(dist, "catalog.json"), "utf8"));

  for (const source of catalog.sources) {
    const sourceScript = await readFile(join(root, "extensions", source.kind, source.id, "main.js"));
    const checkedScript = await readFile(join(dist, source.extension.scriptURL));
    assert.deepEqual(checkedScript, sourceScript, `${source.id} published script differs from main.js`);
    assert.equal(source.extension.scriptURL, `sources/${source.id}/${source.version}/main.js`);
    assert.equal(checkedScript.length, source.extension.size, `${source.id} script size`);
    assert.equal(
      createHash("sha256").update(checkedScript).digest("hex"),
      source.extension.sha256,
      `${source.id} catalog script hash`
    );
  }
  await assert.rejects(readdir(join(dist, "packages")), error => error.code === "ENOENT");
});
