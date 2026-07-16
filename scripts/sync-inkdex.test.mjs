/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the checked-in repository contains no concrete extensions", async () => {
  const contentEntries = await readdir(join(root, "extensions", "content"), { withFileTypes: true });
  assert.deepEqual(contentEntries.filter(entry => entry.isDirectory()).map(entry => entry.name), []);
  await assert.rejects(readdir(join(root, "extensions", "tracker")), { code: "ENOENT" });
  await assert.rejects(readdir(join(root, "extensions", "theme")), { code: "ENOENT" });

  const inventory = JSON.parse(await readFile(join(root, "inventory", "registry.json"), "utf8"));
  const catalog = JSON.parse(await readFile(join(root, "dist", "v1", "stable", "catalog.json"), "utf8"));
  assert.deepEqual(inventory.entries, []);
  assert.deepEqual(catalog.sources, []);
});

test("the optional Paperback importer is content-only", async () => {
  const importer = await readFile(join(root, "scripts", "sync-inkdex.mjs"), "utf8");
  const bridge = await readFile(join(root, "packages", "paperback-compat", "bridge.js"), "utf8");
  assert.doesNotMatch(importer, /registerTracker|defineTrackerExtension|extensions["', ]+tracker/);
  assert.doesNotMatch(bridge, /registerTracker|defineTrackerExtension/);
});
