/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertTrackerExtension } from "../lib/contracts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("tracker contracts reject a package missing a required operation", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "manko-tracker-contract-"));
  const source = join(root, "extensions", "tracker", "AniList");
  const fixture = join(temporaryRoot, "AniList");
  try {
    await cp(source, fixture, { recursive: true });
    const main = await readFile(join(fixture, "main.js"), "utf8");
    const withoutCollections = main.replace(/,\n  async collections\(\) \{[\s\S]*?\n  \}\n\}\);\s*$/, "\n});\n");
    assert.notEqual(withoutCollections, main, "test fixture must remove the collections operation");
    await writeFile(join(fixture, "main.js"), withoutCollections);
    await assert.rejects(assertTrackerExtension(fixture, "AniList"), /tracker is missing collections/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
