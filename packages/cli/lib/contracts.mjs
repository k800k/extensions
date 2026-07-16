/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

export async function assertExtensionScaffold(directory, expectedKind, expectedID) {
  const metadata = JSON.parse(await readFile(join(directory, "extension.json"), "utf8"));
  const source = await readFile(join(directory, "main.js"), "utf8");
  assert.equal(metadata.id, expectedID);
  assert.equal(metadata.kind, expectedKind);
  assert.equal(metadata.apiVersion, "1.0");
  assert.equal(metadata.availability, "approvalRequired");
  assert.match(source, expectedKind === "content" ? /defineContentExtension\s*\(/ : /defineTrackerExtension\s*\(/);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|WebAssembly)\b/);
  for (const file of ["specification.md", "REVIEW_STATUS.md", "PRIVACY.md", "RIGHTS.md"]) {
    const text = await readFile(join(directory, file), "utf8");
    assert.ok(text.trim().length > 80, `${file} must contain an independent review record`);
  }
}
