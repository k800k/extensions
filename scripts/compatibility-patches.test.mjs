/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCompatibilityPatches } from "./compatibility-patches.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("compatibility patches are source-specific and refuse changed upstream bytes", () => {
  assert.deepEqual(applyCompatibilityPatches("UnpatchedSource", "unchanged"), { bundle: "unchanged", records: [] });
  assert.throws(
    () => applyCompatibilityPatches("LNori", "changed upstream bytes"),
    /lnori-live-catalog-selectors-v1 refused unexpected input SHA-256/
  );
});

test("LNori records its selector patch hashes and generated selectors", async () => {
  const directory = join(root, "extensions", "content", "LNori");
  const [main, provenance] = await Promise.all([
    readFile(join(directory, "main.js"), "utf8"),
    readFile(join(directory, "provenance.json"), "utf8").then(JSON.parse)
  ]);
  assert.deepEqual(provenance.compatibilityPatches, [{
    id: "lnori-live-catalog-selectors-v1",
    beforeSHA256: "cb18ab61cbe6829337ac00a3e2fc591dba9628139aa42f42ef00f4749e834a1a",
    afterSHA256: "12b8dde69c8a2ebb633abf40c3937e3cc2ab211c92c4beb059bcbe18015447e2"
  }]);
  assert.match(main, /#hero-stack \.hero-carousel-card/);
  assert.match(main, /\.catalog-grid > div/);
  assert.match(main, /#library \.catalog-grid \.library-item/);
  assert.doesNotMatch(main, /#hero-stack article\.hero-card/);
  assert.doesNotMatch(main, /extractSection\(t,`winter-heading`\)/);
});
