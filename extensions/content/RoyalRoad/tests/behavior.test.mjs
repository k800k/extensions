/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDeclaredHTTPSCovers } from "../../test-assertions.mjs";
import { loadContentExtension, makeTextDocument, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
const fixture = `<!doctype html><html><body>
  <div class="fiction-list-item">
    <h2 class="fiction-title"><a href="/fiction/101/sample-one">Sample One</a></h2>
    <figure><img src="https://www.royalroadcdn.com/public/covers/one.jpg"></figure>
    <div id="description-101">Sanitized first description</div>
    <div class="stats"><i class="fa-list"></i><span>12</span><i class="fa-star"></i><span title="4.5"></span></div>
  </div>
  <div class="fiction-list-item">
    <h2 class="fiction-title"><a href="/fiction/202/sample-two">Sample Two</a></h2>
    <figure><img src="https://www.royalroadcdn.com/public/covers/two.jpg"></figure>
    <div id="description-202">Sanitized second description</div>
    <div class="stats"><i class="fa-list"></i><span>8</span><i class="fa-star"></i><span title="4.2"></span></div>
  </div>
</body></html>`;

test("RoyalRoad discovery emits only declared absolute HTTPS covers", async () => {
  const loaded = await loadContentExtension(
    mainPath,
    request => runtimeResponse({ url: request.url, text: fixture }),
    { document: makeTextDocument() }
  );
  const sections = await loaded.extension.discoverSections();
  const section = sections.find(item => item.id !== "genres");
  assert.ok(section);
  const page = await loaded.extension.discover({ section });
  assert.equal(page.items.length, 2);
  await assertDeclaredHTTPSCovers(mainPath, page.items);
});
