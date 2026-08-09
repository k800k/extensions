/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDeclaredHTTPSCovers } from "../../test-assertions.mjs";
import { MINIMAL_WEBP_BYTES, loadContentExtension, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
const listFixture = `<!doctype html><html><body>
  <article><a href="/manga/sanitized-title" title="Sanitized Title"><img src="https://readermc.org/covers/sanitized.webp" alt="Sanitized Title"></a></article>
  <nav class="pagination"><a>Next</a></nav>
</body></html>`;
const detailFixture = `<!doctype html><html><body>
  <section id="manga-page"><img src="https://readermc.org/covers/sanitized.webp" alt="Sanitized Title"></section>
  <h1 class="big-fat-titles">Sanitized Title</h1>
  <div class="manga-info-rightColumn"><div class="white-font">A sanitized live-shape synopsis.</div></div>
  <div>Status <li>Ongoing</li></div>
  <a href="/chaptered.php?manga=sanitized-title&chapter=1">Chapter 1</a>
</body></html>`;
const pagesFixture = `<!doctype html><html><body>
  <img class="site-logo" src="https://demonicscans.org/logo.png">
  <img class="imgholder" src="https://readermc.org/pages/sanitized-1.webp">
  <img class="imgholder" data-src="https://readermc.org/pages/sanitized-2.webp">
</body></html>`;

test("MangaDemon parses real-shape browse, details, chapters, pages, cover, and page images", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/advanced.php") {
      assert.equal(url.searchParams.get("list"), "1");
      assert.equal(url.searchParams.get("orderby"), "VIEWS DESC");
      return runtimeResponse({ url: request.url, text: listFixture });
    }
    if (url.pathname === "/manga/sanitized-title") return runtimeResponse({ url: request.url, text: detailFixture });
    if (url.pathname === "/chaptered.php") return runtimeResponse({ url: request.url, text: pagesFixture });
    if (url.hostname === "readermc.org") return runtimeResponse({ url: request.url, mimeType: "image/webp", bytes: MINIMAL_WEBP_BYTES });
    throw new Error(`Unexpected request ${request.url}`);
  });

  const discovery = await loaded.extension.discover({ sectionId: "popular" });
  assert.equal(discovery.items.length, 1);
  assert.equal(discovery.items[0].type, "work");
  assert.equal(discovery.items[0].workId, "sanitized-title");
  await assertDeclaredHTTPSCovers(mainPath, discovery.items);
  const cover = await loaded.extension.imagePageContent({ url: discovery.items[0].imageUrl });
  assert.equal(cover.mimeType, "image/webp");

  const work = await loaded.extension.details("sanitized-title");
  assert.equal(work.title, "Sanitized Title");
  assert.equal(work.workInfo.status, "ongoing");
  const installments = await loaded.extension.installments(work);
  assert.equal(installments.length, 1);
  assert.equal(installments[0].number, 1);
  const sequence = await loaded.extension.imagePages(installments[0]);
  assert.deepEqual(Array.from(sequence.pages), [
    "https://readermc.org/pages/sanitized-1.webp",
    "https://readermc.org/pages/sanitized-2.webp"
  ]);
  const page = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(page.dataBase64, Buffer.from(MINIMAL_WEBP_BYTES).toString("base64"));
});
