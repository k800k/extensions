/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContentExtension, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");

function nozomi(ids) {
  const bytes = Buffer.alloc(ids.length * 4);
  ids.forEach((id, index) => bytes.writeInt32BE(id, index * 4));
  return bytes;
}

function gallery(id) {
  const hash = id.toString(16).padStart(64, "0");
  return {
    id: String(id),
    title: `Sanitized Gallery ${id}`,
    japanese_title: `Alternate ${id}`,
    language: "english",
    language_localname: "English",
    date: "2026-01-01 00:00:00+00",
    galleryurl: `/manga/sanitized-gallery-${id}.html`,
    artists: [{ artist: "Sample Creator" }],
    groups: [{ group: "Sample Group" }],
    tags: [{ tag: "landscape" }, { tag: "blue sky", female: "1" }],
    files: [{ hash, name: "001.png", width: 800, height: 1200 }]
  };
}

const routing = `
'use strict';
gg = { m: function(g) {
var o = 1;
switch (g) {
case 256:
o = 0; break;
}
return o;
},
s: function(h) { var m = /(..)(.)$/.exec(h); return parseInt(m[2]+m[1], 16).toString(10); },
b: '123/'
};`;

function galleryAssignment(id) {
  return `var galleryinfo = ${JSON.stringify(gallery(id))};`;
}

test("HitomiLA decodes ranged Nozomi IDs, limits metadata concurrency, and caches routing", async () => {
  let active = 0;
  let maximum = 0;
  let routingRequests = 0;
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  const loaded = await loadContentExtension(mainPath, async request => {
    const url = new URL(request.url);
    if (url.pathname === "/n/index-english.nozomi") {
      assert.equal(request.headers.Range, "bytes=0-99");
      return runtimeResponse({ url: request.url, status: 206, headers: { "Content-Range": "bytes 0-31/200" }, bytes: nozomi(ids) });
    }
    if (/^\/galleries\/[0-9]+\.js$/.test(url.pathname)) {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolveDelay => setTimeout(resolveDelay, 5));
      active--;
      const id = Number(url.pathname.match(/[0-9]+/)[0]);
      return runtimeResponse({ url: request.url, text: galleryAssignment(id) });
    }
    if (url.pathname === "/gg.js") {
      routingRequests++;
      return runtimeResponse({ url: request.url, text: routing });
    }
    if (url.hostname.startsWith("w")) return runtimeResponse({ url: request.url, mimeType: "image/webp", bytes: [9, 8, 7] });
    throw new Error(`Unexpected request ${request.url}`);
  });

  const page = await loaded.extension.discover({ sectionId: "latest" });
  assert.equal(page.items.length, 8);
  assert.equal(page.items[0].workId, "1");
  assert.equal(page.items[0].imageUrl, `https://w1.gold-usergeneratedcontent.net/123/256/${gallery(1).files[0].hash}.webp`);
  assert.equal(page.metadata.page, 2);
  assert.equal(maximum, 4);
  assert.equal(routingRequests, 1);

  const work = await loaded.extension.details("2");
  const [installment] = await loaded.extension.installments(work);
  const sequence = await loaded.extension.imagePages(installment);
  assert.equal(sequence.pages[0], `https://w2.gold-usergeneratedcontent.net/123/512/${gallery(2).files[0].hash}.webp`);
  const image = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(image.mimeType, "image/webp");
  assert.equal(routingRequests, 1, "routing configuration remains cached for the 30-minute window");
});

test("HitomiLA applies language overrides, namespaces, intersections, and negative terms", async () => {
  const indexURLs = [];
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname.endsWith(".nozomi")) {
      indexURLs.push(url.pathname);
      if (url.pathname.includes("/artist/sample-japanese.nozomi")) return runtimeResponse({ url: request.url, bytes: nozomi([1, 2]) });
      if (url.pathname.includes("/tag/female:blue%20sky-japanese.nozomi")) return runtimeResponse({ url: request.url, bytes: nozomi([1, 3]) });
      if (url.pathname.includes("/tag/blocked-japanese.nozomi")) return runtimeResponse({ url: request.url, bytes: nozomi([2]) });
    }
    if (url.pathname === "/galleries/1.js") return runtimeResponse({ url: request.url, text: galleryAssignment(1) });
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: routing });
    throw new Error(`Unexpected request ${request.url}`);
  });
  const result = await loaded.extension.search({ query: "language:japanese artist:sample female:blue_sky -tag:blocked" });
  assert.deepEqual(indexURLs, [
    "/n/artist/sample-japanese.nozomi",
    "/n/tag/female:blue%20sky-japanese.nozomi",
    "/n/tag/blocked-japanese.nozomi"
  ]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].workId, "1");
  assert.equal(result.metadata, null);
});

function bTreeNode(key, dataAddress, dataLength) {
  const bytes = Buffer.alloc(464);
  let offset = 0;
  bytes.writeInt32BE(1, offset); offset += 4;
  bytes.writeInt32BE(key.length, offset); offset += 4;
  key.copy(bytes, offset); offset += key.length;
  bytes.writeInt32BE(1, offset); offset += 4;
  bytes.writeBigUInt64BE(BigInt(dataAddress), offset); offset += 8;
  bytes.writeInt32BE(dataLength, offset); offset += 4;
  for (let index = 0; index < 17; index++) {
    bytes.writeBigUInt64BE(0n, offset);
    offset += 8;
  }
  return bytes;
}

test("HitomiLA resolves plain title terms through the galleries-index B-tree", async () => {
  const key = createHash("sha256").update("sample", "utf8").digest().subarray(0, 4);
  const galleryData = Buffer.alloc(8);
  galleryData.writeInt32BE(1, 0);
  galleryData.writeInt32BE(7, 4);
  const node = bTreeNode(key, 20, galleryData.length);
  const ranges = [];
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/galleriesindex/version") return runtimeResponse({ url: request.url, text: "123456\n" });
    if (url.pathname.endsWith(".index")) {
      ranges.push(request.headers.Range);
      return runtimeResponse({ url: request.url, status: 206, bytes: node });
    }
    if (url.pathname.endsWith(".data")) {
      ranges.push(request.headers.Range);
      return runtimeResponse({ url: request.url, status: 206, bytes: galleryData });
    }
    if (url.pathname === "/galleries/7.js") return runtimeResponse({ url: request.url, text: galleryAssignment(7) });
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: routing });
    throw new Error(`Unexpected request ${request.url}`);
  });
  const result = await loaded.extension.search({ query: "sample" });
  assert.equal(result.items[0].workId, "7");
  assert.deepEqual(ranges, ["bytes=0-463", "bytes=20-27"]);
});

test("HitomiLA fails closed on malformed Nozomi and gallery assignment data", async () => {
  let mode = "nozomi";
  const loaded = await loadContentExtension(mainPath, request => {
    if (mode === "nozomi") return runtimeResponse({ url: request.url, status: 206, bytes: [0, 0, 1] });
    return runtimeResponse({ url: request.url, text: "var galleryinfo = {title: 'not json'};" });
  });
  await assert.rejects(() => loaded.extension.discover({ sectionId: "latest" }), error => error.name === "InvalidResponseError");
  mode = "gallery";
  await assert.rejects(() => loaded.extension.details("1"), error => error.name === "InvalidResponseError");
});
