/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { MINIMAL_WEBP_BYTES, loadContentExtension, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
const manifest = JSON.parse(await readFile(resolve(dirname(mainPath), "extension.json"), "utf8"));
const expectedUserAgent = "MangaReader NHentai Extension/0.3.1 (+https://github.com/k800k/extensions)";
const listGallery = {
  id: 101,
  media_id: "9001",
  english_title: "Sanitized Sample Gallery",
  japanese_title: "Sample Alt",
  thumbnail: "/galleries/9001/thumb.webp",
  thumbnail_width: 150,
  thumbnail_height: 200,
  num_pages: 3,
  num_favorites: 12,
  tag_ids: [1, 2]
};
const detailGallery = {
  id: 101,
  media_id: "9001",
  title: { english: "Sanitized Sample Gallery", japanese: "Sample Alt", pretty: "Sanitized Sample Gallery" },
  cover: { path: "https://t.nhentai.net/galleries/9001/cover.webp.webp", width: 300, height: 400 },
  thumbnail: { path: "/galleries/9001/thumb.webp", width: 150, height: 200 },
  pages: [
    { number: 1, path: "/galleries/9001/1.jpg" },
    { number: 2, path: "galleries/9001/2.png" },
    { number: 3, path: "https://i.nhentai.net/galleries/9001/3.webp.webp" }
  ],
  tags: [
    { type: "language", name: "english" },
    { type: "artist", name: "Sample Creator" },
    { type: "tag", name: "landscape" }
  ],
  num_pages: 3,
  num_favorites: 12,
  upload_date: 1700000000
};

function jsonResponse(request, value, status = 200, headers = {}) {
  assert.equal(request.headers["User-Agent"], expectedUserAgent);
  assert.equal(request.headers.Referer, "https://nhentai.net/");
  return runtimeResponse({ url: request.url, status, headers, text: JSON.stringify(value) });
}

function assertDeclaredCover(item) {
  const url = new URL(item.imageUrl);
  assert.equal(url.protocol, "https:");
  assert.ok(manifest.allowedHTTPSHosts.includes(url.hostname), `undeclared cover host ${url.hostname}`);
}

test("NHentai maps v2 returned paths directly and brokers both covers and pages", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    assert.notEqual(url.pathname, "/api/v2/cdn", "v0.3 must not depend on the retired CDN-discovery endpoint");
    if (url.pathname === "/api/v2/search") {
      assert.equal(url.searchParams.get("query"), "sample");
      assert.equal(url.searchParams.get("sort"), "date");
      assert.equal(url.searchParams.get("page"), "2");
      return jsonResponse(request, { result: [listGallery], num_pages: 3, per_page: 25, total: 60 });
    }
    if (url.pathname === "/api/v2/galleries/101") return jsonResponse(request, detailGallery);
    if (url.hostname === "i.nhentai.net" || url.hostname === "t.nhentai.net") {
      return runtimeResponse({ url: request.url, mimeType: "image/webp", bytes: MINIMAL_WEBP_BYTES });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });

  const page = await loaded.extension.search({ query: "sample", metadata: { page: 2 } });
  assert.equal(page.items[0].type, "work");
  assert.equal(page.items[0].workId, "101");
  assert.equal(page.items[0].imageUrl, "https://t.nhentai.net/galleries/9001/thumb.webp");
  page.items.forEach(assertDeclaredCover);
  assert.equal(page.metadata.page, 3);
  const cover = await loaded.extension.imagePageContent({ url: page.items[0].imageUrl });
  assert.equal(cover.mimeType, "image/webp");

  const work = await loaded.extension.details("101");
  assert.equal(work.imageUrl, "https://t.nhentai.net/galleries/9001/cover.webp.webp");
  assert.equal(work.workInfo.shareUrl, "https://nhentai.net/g/101/");
  assert.equal(work.workInfo.artist, "Sample Creator");
  assert.equal(work.workInfo.author, "Sample Creator");
  const [installment] = await loaded.extension.installments(work);
  const sequence = await loaded.extension.imagePages(installment);
  assert.deepEqual(Array.from(sequence.pages), [
    "https://i.nhentai.net/galleries/9001/1.jpg",
    "https://i.nhentai.net/galleries/9001/2.png",
    "https://i.nhentai.net/galleries/9001/3.webp.webp"
  ]);
  const image = await loaded.extension.imagePageContent({ url: sequence.pages[2] });
  assert.equal(image.mimeType, "image/webp");
  assert.equal(image.dataBase64, Buffer.from(MINIMAL_WEBP_BYTES).toString("base64"));
});

test("NHentai uses the unpaged v2 popular endpoint", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/v2/galleries/popular") return jsonResponse(request, [listGallery]);
    throw new Error(`Unexpected request ${request.url}`);
  });
  const first = await loaded.extension.discover({ sectionId: "popular" });
  assert.equal(first.items.length, 1);
  first.items.forEach(assertDeclaredCover);
  assert.equal(first.metadata, null);
  const callsBefore = loaded.calls.length;
  const second = await loaded.extension.discover({ sectionId: "popular", metadata: { page: 2 } });
  assert.deepEqual(Array.from(second.items), []);
  assert.equal(second.metadata, null);
  assert.equal(loaded.calls.length, callsBefore);
});

test("NHentai hands only definitive Cloudflare challenges to MangaReader", async () => {
  const challenged = await loadContentExtension(mainPath, request => runtimeResponse({
    url: request.url,
    status: 403,
    headers: { server: "cloudflare", "cf-mitigated": "challenge" },
    text: "challenge page"
  }));
  await assert.rejects(
    () => challenged.extension.discover({ sectionId: "latest" }),
    error => error.name === "ChallengeRequiredError" && error.type === "challengeRequired"
  );
  assert.deepEqual(challenged.challenges, ["https://nhentai.net/"]);

  const ordinary = await loadContentExtension(mainPath, request => runtimeResponse({
    url: request.url,
    status: 403,
    headers: { server: "cloudflare", "cf-ray": "sanitized" },
    text: "access denied"
  }));
  await assert.rejects(
    () => ordinary.extension.discover({ sectionId: "latest" }),
    error => error.name === "ServiceError" && error.type === "serviceError"
  );
  assert.deepEqual(ordinary.challenges, []);
});

test("NHentai performs one bounded rate-limit retry", async () => {
  let attempts = 0;
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/v2/galleries") {
      attempts++;
      if (attempts === 1) return runtimeResponse({ url: request.url, status: 429, headers: { "Retry-After": "2" } });
      return jsonResponse(request, { result: [], num_pages: 1, per_page: 25, total: 0 });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });
  const result = await loaded.extension.discover({ sectionId: "latest" });
  assert.deepEqual(Array.from(result.items), []);
  assert.equal(attempts, 2);
  assert.deepEqual(loaded.sleeps, [2000]);
});

test("NHentai fails closed on malformed JSON, traversal, and undeclared returned media hosts", async () => {
  let mode = "json";
  const loaded = await loadContentExtension(mainPath, request => {
    if (mode === "json") return runtimeResponse({ url: request.url, text: "{" });
    if (mode === "notFound") return runtimeResponse({ url: request.url, status: 404 });
    return jsonResponse(request, { ...detailGallery, pages: [{ number: 1, path: "../outside.webp" }] });
  });
  await assert.rejects(() => loaded.extension.details("not-a-number"), error => error.name === "InvalidIdentifierError");
  await assert.rejects(() => loaded.extension.details("101"), error => error.name === "InvalidResponseError");
  mode = "notFound";
  await assert.rejects(() => loaded.extension.details("101"), error => error.name === "NotFoundError");
  mode = "path";
  const work = await loaded.extension.details("101");
  const [installment] = await loaded.extension.installments(work);
  await assert.rejects(() => loaded.extension.imagePages(installment), error => error.name === "InvalidResponseError");

  const badHostGallery = { ...listGallery, thumbnail: "https://outside.example/thumb.webp" };
  const badHost = await loadContentExtension(mainPath, request => jsonResponse(request, { result: [badHostGallery], num_pages: 1, per_page: 25, total: 1 }));
  await assert.rejects(() => badHost.extension.discover({ sectionId: "latest" }), error => error.name === "HostNotAllowedError");
  const callsBefore = badHost.calls.length;
  await assert.rejects(() => badHost.extension.imagePageContent({ url: "https://outside.example/page.webp" }), error => error.name === "HostNotAllowedError");
  assert.equal(badHost.calls.length, callsBefore);
});
