/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDeclaredHTTPSCovers } from "../../test-assertions.mjs";
import { MINIMAL_WEBP_BYTES, loadContentExtension, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
const listFixture = `<!doctype html><html><body>
  <article><a href="/series/01SANITIZED/Sanitized-Title"><img src="https://temp.compsci88.com/covers/sanitized.webp" alt="Sanitized Title"><span>Sanitized Title</span></a></article>
</body></html>`;
const detailFixture = `<!doctype html><html><body>
  <h1>Sanitized Title</h1>
  <img class="series-cover" src="https://temp.compsci88.com/covers/sanitized.webp" alt="Sanitized Title">
  <section><h2>Description</h2><p>A sanitized live-shape synopsis.</p></section>
  <section>Status <a>Ongoing</a></section>
</body></html>`;
const chaptersFixture = `<!doctype html><html><body>
  <a href="/chapters/01CHAPTERONE"><span>Chapter 1</span><time datetime="2026-01-01T00:00:00Z"></time></a>
  <a href="/chapters/01CHAPTERTWO"><span>Chapter 2.5</span></a>
</body></html>`;
const pagesFixture = `<!doctype html><html><body>
  <img src="https://temp.compsci88.com/unrelated/outside.webp">
  <section x-data="{ scroll: true }">
    <img src="https://temp.compsci88.com/pages/one.webp">
    <div><img src="https://temp.compsci88.com/unrelated/nested.webp"></div>
    <img src="https://temp.compsci88.com/pages/two.webp">
  </section>
  <section x-data="{ carousel: true }"><img src="https://temp.compsci88.com/unrelated/carousel.webp"></section>
</body></html>`;

test("WeebCentral parses real-shape catalog through page images and excludes unrelated images", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/hot-updates") return runtimeResponse({ url: request.url, text: listFixture });
    if (url.pathname === "/series/01SANITIZED/Sanitized-Title") return runtimeResponse({ url: request.url, text: detailFixture });
    if (url.pathname === "/series/01SANITIZED/full-chapter-list") return runtimeResponse({ url: request.url, text: chaptersFixture });
    if (url.pathname === "/chapters/01CHAPTERONE/images") {
      assert.equal(url.searchParams.get("is_prev"), "False");
      assert.equal(url.searchParams.get("reading_style"), "long_strip");
      return runtimeResponse({ url: request.url, text: pagesFixture });
    }
    if (url.hostname === "temp.compsci88.com") return runtimeResponse({ url: request.url, mimeType: "image/webp", bytes: MINIMAL_WEBP_BYTES });
    throw new Error(`Unexpected request ${request.url}`);
  });

  const discovery = await loaded.extension.discover({ sectionId: "hot" });
  assert.equal(discovery.items.length, 1);
  assert.equal(discovery.items[0].workId, "/series/01SANITIZED/Sanitized-Title");
  await assertDeclaredHTTPSCovers(mainPath, discovery.items);
  const cover = await loaded.extension.imagePageContent({ url: discovery.items[0].imageUrl });
  assert.equal(cover.mimeType, "image/webp");

  const work = await loaded.extension.details(discovery.items[0].workId);
  assert.equal(work.title, "Sanitized Title");
  assert.equal(work.workInfo.status, "ongoing");
  const chapters = await loaded.extension.installments(work);
  assert.deepEqual(Array.from(chapters, chapter => chapter.number), [1, 2.5]);
  const sequence = await loaded.extension.imagePages(chapters[0]);
  assert.deepEqual(Array.from(sequence.pages), [
    "https://temp.compsci88.com/pages/one.webp",
    "https://temp.compsci88.com/pages/two.webp"
  ]);
  assert.ok(sequence.pages.every(url => !url.includes("unrelated")), "only direct images in the scroll section are emitted");
  const page = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(page.dataBase64, Buffer.from(MINIMAL_WEBP_BYTES).toString("base64"));
});
