/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDeclaredHTTPSCovers } from "../../test-assertions.mjs";
import { loadContentExtension, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");

test("Atsumaru discovery emits only declared absolute HTTPS covers", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/infinite/trending");
    return runtimeResponse({
      url: request.url,
      text: JSON.stringify({ items: [
        { id: "sample-one", title: "Sample One", image: "https://cdn.atsu.moe/covers/one.webp", type: "Manga" },
        { id: "sample-two", title: "Sample Two", image: "https://atsu.moe/static/covers/two.webp", type: "Manwha" }
      ] })
    });
  });
  const page = await loaded.extension.discover({ section: { id: "trending-carousel" } });
  assert.equal(page.items.length, 2);
  await assertDeclaredHTTPSCovers(mainPath, page.items);
});
