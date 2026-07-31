/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { loadContentExtension, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
const manifest = JSON.parse(await readFile(resolve(dirname(mainPath), "extension.json"), "utf8"));
const homepage = `<!doctype html>
<html><body>
  <div id="hero-stack">
    <div class="hero-carousel-card" data-title="Hero Novel" data-author="Sample Author" data-desc="Sanitized hero" data-image="https://cdn.lnori.com/hero.webp" data-link="/series/hero"></div>
  </div>
  <section id="seasonal">
    <h2 id="summer-heading">Summer</h2>
    <div class="catalog-grid">
      <div class="group seasonal-card"><a href="/series/seasonal"><img alt="Seasonal Novel" src="https://cdn.lnori.com/seasonal.webp"></a></div>
    </div>
  </section>
  <header><h2 id="library-heading">Popular</h2></header>
  <section id="library">
    <div class="catalog-grid">
      <div class="library-item"><a href="/series/popular"><img alt="Popular Novel" src="https://cdn.lnori.com/popular.webp"></a></div>
    </div>
  </section>
</body></html>`;

function assertDeclaredCover(item) {
  const url = new URL(item.imageUrl);
  assert.equal(url.protocol, "https:");
  assert.ok(manifest.allowedHTTPSHosts.includes(url.hostname), `undeclared cover host ${url.hostname}`);
}

test("LNori parses current hero, seasonal, and popular catalog markup", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    assert.equal(request.url, "https://lnori.com");
    return runtimeResponse({ url: request.url, text: homepage });
  });
  const sections = await loaded.extension.discoverSections();
  assert.deepEqual(Array.from(sections, section => section.id), ["prominent", "seasonal", "popular"]);

  const hero = await loaded.extension.discover({ section: { id: "prominent" } });
  const seasonal = await loaded.extension.discover({ section: { id: "seasonal" } });
  const popular = await loaded.extension.discover({ section: { id: "popular" } });

  assert.equal(hero.items.length, 1);
  hero.items.forEach(assertDeclaredCover);
  assert.equal(hero.items[0].title, "Hero Novel");
  assert.equal(hero.items[0].imageUrl, "https://cdn.lnori.com/hero.webp");
  assert.equal(seasonal.items.length, 1);
  seasonal.items.forEach(assertDeclaredCover);
  assert.equal(seasonal.items[0].title, "Seasonal Novel", JSON.stringify(seasonal.items[0]));
  assert.equal(seasonal.items[0].workId, "/series/seasonal");
  assert.equal(popular.items.length, 1);
  popular.items.forEach(assertDeclaredCover);
  assert.equal(popular.items[0].title, "Popular Novel");
  assert.equal(popular.items[0].workId, "/series/popular");
});
