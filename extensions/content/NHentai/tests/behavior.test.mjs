/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContentExtension, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");

const gallery = {
  id: 101,
  media_id: "9001",
  title: { english: "Sanitized Sample Gallery", japanese: "Sample Alt", pretty: "Sanitized Sample Gallery" },
  images: {
    cover: { t: "j", w: 300, h: 400 },
    thumbnail: { t: "p", w: 150, h: 200 },
    pages: [{ t: "j" }, { t: "p" }, { t: "g" }, { t: "w" }]
  },
  tags: [
    { type: "language", name: "english" },
    { type: "artist", name: "Sample Creator" },
    { type: "tag", name: "landscape" }
  ],
  num_pages: 4,
  upload_date: 1700000000
};

test("NHentai maps galleries, cursors, image types, and brokered image responses", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/galleries/search") {
      return runtimeResponse({ url: request.url, text: JSON.stringify({ result: [gallery], num_pages: 3, per_page: 25 }) });
    }
    if (url.pathname === "/api/gallery/101") return runtimeResponse({ url: request.url, text: JSON.stringify(gallery) });
    if (url.hostname === "i.nhentai.net") return runtimeResponse({ url: request.url, mimeType: "image/webp", bytes: [1, 2, 3] });
    throw new Error(`Unexpected request ${request.url}`);
  });

  const page = await loaded.extension.search({ query: "sample", metadata: { page: 2 } });
  assert.equal(page.items[0].workId, "101");
  assert.equal(page.items[0].title, "Sanitized Sample Gallery");
  assert.equal(page.items[0].imageUrl, "https://t.nhentai.net/galleries/9001/cover.jpg");
  assert.equal(page.metadata.page, 3);

  const work = await loaded.extension.details("101");
  assert.equal(work.workInfo.shareUrl, "https://nhentai.net/g/101/");
  assert.deepEqual(Array.from(work.pageTypes), ["j", "p", "g", "w"]);
  const [installment] = await loaded.extension.installments(work);
  const sequence = await loaded.extension.imagePages(installment);
  assert.deepEqual(Array.from(sequence.pages), [
    "https://i.nhentai.net/galleries/9001/1.jpg",
    "https://i.nhentai.net/galleries/9001/2.png",
    "https://i.nhentai.net/galleries/9001/3.gif",
    "https://i.nhentai.net/galleries/9001/4.webp"
  ]);
  const image = await loaded.extension.imagePageContent({ url: sequence.pages[3] });
  assert.equal(image.mimeType, "image/webp");
  assert.equal(image.dataBase64, Buffer.from([1, 2, 3]).toString("base64"));
});

test("NHentai hands Cloudflare challenges to MangaReader", async () => {
  const loaded = await loadContentExtension(mainPath, request => runtimeResponse({
    url: request.url,
    status: 403,
    headers: { server: "cloudflare", "cf-mitigated": "challenge" },
    text: "challenge page"
  }));
  await assert.rejects(() => loaded.extension.discover({ sectionId: "latest" }), error => error.name === "ChallengeRequiredError" && error.type === "challengeRequired");
  assert.deepEqual(loaded.challenges, ["https://nhentai.net/"]);
});

test("NHentai retries one rate limit and then advances the cursor", async () => {
  let attempts = 0;
  const loaded = await loadContentExtension(mainPath, request => {
    attempts++;
    if (attempts === 1) return runtimeResponse({ url: request.url, status: 429, headers: { "Retry-After": "2" } });
    return runtimeResponse({ url: request.url, text: JSON.stringify({ result: [], num_pages: 1 }) });
  });
  const result = await loaded.extension.discover({ sectionId: "latest" });
  assert.equal(result.items.length, 0);
  assert.equal(result.metadata, null);
  assert.equal(attempts, 2);
  assert.deepEqual(loaded.sleeps, [2000]);
});

test("NHentai rejects invalid IDs, malformed JSON, unknown image types, and undeclared hosts", async () => {
  let mode = "json";
  const loaded = await loadContentExtension(mainPath, request => {
    if (mode === "json") return runtimeResponse({ url: request.url, text: "{" });
    if (mode === "notFound") return runtimeResponse({ url: request.url, status: 404 });
    return runtimeResponse({ url: request.url, text: JSON.stringify({ ...gallery, images: { ...gallery.images, pages: [{ t: "x" }] } }) });
  });
  await assert.rejects(() => loaded.extension.details("not-a-number"), error => error.name === "InvalidIdentifierError");
  await assert.rejects(() => loaded.extension.details("101"), error => error.name === "InvalidResponseError");
  mode = "notFound";
  await assert.rejects(() => loaded.extension.details("101"), error => error.name === "NotFoundError" && error.type === "notFound");
  mode = "type";
  await assert.rejects(() => loaded.extension.details("101"), error => error.name === "InvalidResponseError");
  const callsBefore = loaded.calls.length;
  await assert.rejects(() => loaded.extension.imagePageContent({ url: "https://outside.example/page.webp" }), error => error.name === "HostNotAllowedError");
  assert.equal(loaded.calls.length, callsBefore);
});
