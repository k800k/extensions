/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function assertDeclaredHTTPSCovers(mainPath, items) {
  const manifest = JSON.parse(await readFile(resolve(dirname(mainPath), "extension.json"), "utf8"));
  assert.ok(items.length > 0, `${manifest.id} fixture must emit at least one cover`);
  for (const item of items) {
    assert.ok(item.imageUrl, `${manifest.id} emitted an item without a cover URL`);
    const url = new URL(item.imageUrl);
    assert.equal(url.protocol, "https:", `${manifest.id} cover must use HTTPS`);
    const declared = manifest.allowedHTTPSHosts.some(host => host.startsWith("*.")
      ? url.hostname.endsWith(host.slice(1)) && url.hostname !== host.slice(2)
      : url.hostname === host);
    assert.ok(declared, `${manifest.id} emitted undeclared cover host ${url.hostname}`);
  }
}
