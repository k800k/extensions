/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import assert from "node:assert/strict";
import { assertDeclaredHTTPSCovers } from "./test-assertions.mjs";
import { MINIMAL_PNG_BYTES, loadContentExtension, runtimeResponse } from "./test-runtime.mjs";

export async function assertMangaBoxBehavior(mainPath, hostname) {
  const baseURL = `https://${hostname}`;
  const listFixture = `<!doctype html><html><body>
    <article><a href="/manga/manga-sanitized" title="Sanitized Manga"><img src="https://img-r1.2xstorage.com/covers/sanitized.png" alt="Sanitized Manga"></a></article>
    <a class="page_last">Last (2)</a>
  </body></html>`;
  const detailsFixture = `<!doctype html><html><body>
    <div class="manga-info-pic"><img src="https://img-r1.2xstorage.com/covers/sanitized.png"></div>
    <h1>Sanitized Manga</h1>
    <div id="contentBox">A sanitized live-shape synopsis.</div>
    <span>Ongoing</span>
    <div id="chapter-list-container"
      data-comic-slug="manga-sanitized"
      data-api-url="${baseURL}/api/manga/__SLUG__/chapters"
      data-chapter-url-template="/manga/__MANGA__/chapter-__CHAPTER__"></div>
  </body></html>`;
  const pagesFixture = `<!doctype html><html><body><script>
    var cdns = ["https://img-r1.2xstorage.com", "https://site-cdn.sanitized.example/assets"];
    var backupImage = ["https://site-backup.sanitized.example/cache"];
    var chapterImages = ["pages/sanitized-1.png", "pages/sanitized-2.png"];
  </script></body></html>`;
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.hostname === hostname && url.pathname === "/genre/all") {
      assert.equal(url.searchParams.get("filter"), "1");
      assert.equal(url.searchParams.get("page"), "1");
      return runtimeResponse({ url: request.url, text: listFixture });
    }
    if (url.hostname === hostname && url.pathname === "/manga/manga-sanitized") {
      return runtimeResponse({ url: request.url, text: detailsFixture });
    }
    if (url.hostname === hostname && url.pathname === "/api/manga/manga-sanitized/chapters") {
      assert.equal(url.searchParams.get("limit"), "500");
      assert.equal(url.searchParams.get("offset"), "0");
      return runtimeResponse({
        url: request.url,
        text: JSON.stringify({ data: { chapters: [{ chapter_slug: "1", chapter_num: 1, chapter_name: "Chapter 1 Arrival" }], pagination: { has_more: false } } })
      });
    }
    if (url.hostname === hostname && url.pathname === "/manga/manga-sanitized/chapter-1") {
      return runtimeResponse({ url: request.url, text: pagesFixture });
    }
    if (url.hostname === "img-r1.2xstorage.com" && url.pathname.startsWith("/covers/")) {
      return runtimeResponse({ url: request.url, mimeType: "image/png", bytes: MINIMAL_PNG_BYTES });
    }
    if (url.hostname === "img-r1.2xstorage.com" && url.pathname.startsWith("/pages/")) {
      return runtimeResponse({ url: request.url, status: 503, mimeType: "text/plain", text: "primary unavailable" });
    }
    if (url.hostname === "site-cdn.sanitized.example") {
      return runtimeResponse({ url: request.url, status: 502, mimeType: "text/plain", text: "secondary unavailable" });
    }
    if (url.hostname === "site-backup.sanitized.example") {
      return runtimeResponse({ url: request.url, mimeType: "image/png", bytes: MINIMAL_PNG_BYTES });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });

  const discovery = await loaded.extension.discover({ sectionId: "new" });
  assert.equal(discovery.items.length, 1);
  assert.equal(discovery.items[0].type, "work");
  assert.equal(discovery.items[0].workId, "/manga/manga-sanitized");
  assert.equal(discovery.metadata.page, 2);
  await assertDeclaredHTTPSCovers(mainPath, discovery.items);
  const cover = await loaded.extension.imagePageContent({ url: discovery.items[0].imageUrl });
  assert.equal(cover.mimeType, "image/png");

  const work = await loaded.extension.details(discovery.items[0].workId);
  assert.equal(work.title, "Sanitized Manga");
  assert.equal(work.workInfo.status, "ongoing");
  const chapters = await loaded.extension.installments(work);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].number, 1);
  const sequence = await loaded.extension.imagePages(chapters[0]);
  assert.deepEqual(Array.from(sequence.pages), [
    "https://img-r1.2xstorage.com/pages/sanitized-1.png",
    "https://img-r1.2xstorage.com/pages/sanitized-2.png"
  ]);
  const page = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(page.mimeType, "image/png");
  assert.equal(page.dataBase64, Buffer.from(MINIMAL_PNG_BYTES).toString("base64"));
  assert.deepEqual(
    loaded.calls
      .map(call => new URL(call.url))
      .filter(url => url.pathname.endsWith("/pages/sanitized-1.png"))
      .map(url => url.hostname),
    ["img-r1.2xstorage.com", "site-cdn.sanitized.example", "site-backup.sanitized.example"],
    "site-provided CDN and backup bases are attempted in order before legacy mirrors"
  );
}

export async function assertMangaBoxImageDataBounds(mainPath, hostname) {
  const baseURL = `https://${hostname}`;
  const installment = { installmentId: "/manga/manga-sanitized/chapter-1", workId: "/manga/manga-sanitized" };

  async function rejectsFixture(html, message) {
    const loaded = await loadContentExtension(mainPath, request => runtimeResponse({ url: request.url, text: html }));
    await assert.rejects(
      () => loaded.extension.imagePages(installment),
      error => error?.name === "InvalidResponseError" && message.test(error.message)
    );
  }

  await rejectsFixture(`<!doctype html><script>
    var cdns = ["javascript:alert(1)"];
    var chapterImages = ["pages/one.png"];
  </script>`, /invalid HTTP\(S\) URL|malformed/i);

  const tooManyBases = Array.from({ length: 17 }, (_, index) => `https://cdn-${index}.sanitized.example`).map(JSON.stringify).join(",");
  await rejectsFixture(`<!doctype html><script>
    var cdns = [${tooManyBases}];
    var chapterImages = ["pages/one.png"];
  </script>`, /too many CDN bases/i);

  await rejectsFixture(`<!doctype html><script>
    var cdns = ["${baseURL}"];
    var chapterImages = [${JSON.stringify("x".repeat(2049))}];
  </script>`, /malformed or oversized/i);
}

export async function assertMangaBoxVerificationCookieRetry(mainPath, hostname) {
  const baseURL = `https://${hostname}`;
  const challengeCookie = {
    name: "__cf_bm",
    value: "bounded-challenge-state",
    domain: hostname,
    path: "/",
    expires: "2099-01-01T00:00:00.000Z"
  };
  const challenged = await loadContentExtension(mainPath, request => runtimeResponse({
    url: request.url,
    status: 403,
    headers: { "cf-mitigated": "challenge", "content-type": "text/html" },
    cookies: [challengeCookie],
    text: "<title>Just a moment...</title>"
  }));
  await assert.rejects(
    () => challenged.extension.discover({ sectionId: "new" }),
    error => error?.name === "ChallengeRequiredError" && error?.type === "challengeRequired"
  );
  assert.deepEqual(challenged.challenges, [baseURL]);
  assert.equal(challenged.cookies[0]?.name, "__cf_bm", "response cookies persist before challenge classification");

  const clearance = {
    name: "cf_clearance",
    value: "saved-after-visible-verification",
    domain: hostname,
    path: "/",
    expires: "2099-01-01T00:00:00.000Z"
  };
  const recovered = await loadContentExtension(mainPath, request => {
    assert.equal(request.cookies?.cf_clearance, clearance.value, "fresh runtime sends the saved verification cookie");
    return runtimeResponse({
      url: request.url,
      text: `<!doctype html><article><a href="/manga/recovered" title="Recovered"><img src="https://img-r1.2xstorage.com/covers/recovered.png"></a></article>`
    });
  }, { initialCookies: [clearance] });
  const result = await recovered.extension.discover({ sectionId: "new" });
  assert.equal(result.items[0]?.workId, "/manga/recovered");
  assert.deepEqual(recovered.challenges, []);
}
