// Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("metadata search audit covers every content extension", async () => {
  const audit = JSON.parse(await readFile(join(root, "scripts/data/metadata-search-audit.json"), "utf8"));
  const directories = (await readdir(join(root, "extensions/content"), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  const audited = audit.sources.map(source => source.id).sort();

  assert.equal(audit.schemaVersion, 1);
  assert.deepEqual(audited, directories);
  assert.equal(new Set(audited).size, audited.length);
  for (const source of audit.sources) {
    assert.ok(Array.isArray(source.searchableGroups));
    if (source.searchableGroups.length === 0) assert.ok(source.reason, `${source.id} needs a non-searchable reason`);
    assert.equal(new Set(source.searchableGroups).size, source.searchableGroups.length, `${source.id} repeats a group`);
  }
});
