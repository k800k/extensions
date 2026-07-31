/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MINIMAL_AVIF_BYTES, MINIMAL_GIF_BYTES, MINIMAL_WEBP_BYTES, loadContentExtension, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
const manifest = JSON.parse(await readFile(resolve(dirname(mainPath), "extension.json"), "utf8"));

test("HitomiLA retains only the legacy bounded page-host declarations", () => {
  const pageHosts = manifest.allowedHTTPSHosts.filter(host => /^a[0-9]+\.gold-usergeneratedcontent\.net$/.test(host));
  assert.deepEqual(pageHosts, [
    "a1.gold-usergeneratedcontent.net",
    "a2.gold-usergeneratedcontent.net"
  ]);
  assert.ok(!manifest.allowedHTTPSHosts.some(host => host.includes("*")));
});

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
    files: [{ hash, name: "001.png", hasavif: 1, haswebp: 1, width: 800, height: 1200 }]
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
      assert.equal(request.headers["Accept-Encoding"], "identity");
      return runtimeResponse({
        url: request.url,
        status: 206,
        mimeType: "application/x-nozomi",
        headers: { "Content-Range": "bytes 0-31/200" },
        bytes: nozomi(ids)
      });
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
    if (url.hostname === "atn.gold-usergeneratedcontent.net" || /^a[0-9]+\./.test(url.hostname)) {
      const avif = url.pathname.endsWith(".avif");
      return runtimeResponse({
        url: request.url,
        mimeType: avif ? "image/avif" : "image/webp",
        bytes: avif ? MINIMAL_AVIF_BYTES : MINIMAL_WEBP_BYTES
      });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });

  const page = await loaded.extension.discover({ sectionId: "latest" });
  assert.equal(page.items.length, 8);
  assert.equal(page.items[0].type, "work");
  assert.equal(page.items[0].workId, "1");
  assert.equal(page.items[0].imageUrl, `https://atn.gold-usergeneratedcontent.net/avifbigtn/1/00/${gallery(1).files[0].hash}.avif`);
  assert.ok(page.items.every(item => {
    const url = new URL(item.imageUrl);
    return url.protocol === "https:" && manifest.allowedHTTPSHosts.includes(url.hostname);
  }), "every emitted cover uses a declared HTTPS host");
  assert.equal(page.metadata.page, 2);
  assert.equal(maximum, 4);
  assert.equal(routingRequests, 0, "cover generation no longer depends on gg.js routing");
  const cover = await loaded.extension.imagePageContent({ url: page.items[0].imageUrl });
  assert.equal(cover.mimeType, "image/avif");

  const work = await loaded.extension.details("2");
  assert.equal(work.workInfo.artist, "Sample Creator");
  assert.equal(work.workInfo.author, "Sample Creator, Sample Group");
  const [installment] = await loaded.extension.installments(work);
  const sequence = await loaded.extension.imagePages(installment);
  assert.equal(sequence.pages[0], `https://a2.gold-usergeneratedcontent.net/123/512/${gallery(2).files[0].hash}.avif`);
  const image = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(image.mimeType, "image/avif");
  const overriddenWork = await loaded.extension.details("1");
  const [overriddenInstallment] = await loaded.extension.installments(overriddenWork);
  const overriddenSequence = await loaded.extension.imagePages(overriddenInstallment);
  assert.equal(overriddenSequence.pages[0], `https://a1.gold-usergeneratedcontent.net/123/256/${gallery(1).files[0].hash}.avif`);
  assert.equal(routingRequests, 1, "routing configuration remains cached for the bounded refresh window");
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

test("HitomiLA falls back to the original GIF representation when AVIF is unavailable", async () => {
  const gifGallery = gallery(9);
  gifGallery.files[0] = { ...gifGallery.files[0], name: "animated.gif", hasavif: 0, haswebp: 0 };
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/galleries/9.js") return runtimeResponse({ url: request.url, text: `var galleryinfo = ${JSON.stringify(gifGallery)};` });
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: routing });
    if (/^a[0-9]+\./.test(url.hostname)) return runtimeResponse({ url: request.url, mimeType: "image/gif", bytes: MINIMAL_GIF_BYTES });
    throw new Error(`Unexpected request ${request.url}`);
  });
  const work = await loaded.extension.details("9");
  const [installment] = await loaded.extension.installments(work);
  const sequence = await loaded.extension.imagePages(installment);
  assert.equal(sequence.pages[0], `https://a2.gold-usergeneratedcontent.net/123/2304/${gifGallery.files[0].hash}.gif`);
  const image = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(image.mimeType, "image/gif");
});

test("HitomiLA registers only exact computed dynamic page origins", async () => {
  const dynamicRouting = routing
    .replace("var o = 1;", "var o = 7;")
    .replace("o = 0; break;", "o = 4; break;");
  const requestedHosts = [];
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/galleries/1.js") return runtimeResponse({ url: request.url, text: galleryAssignment(1) });
    if (url.pathname === "/galleries/2.js") return runtimeResponse({ url: request.url, text: galleryAssignment(2) });
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: dynamicRouting });
    if (/^a[0-9]+\.gold-usergeneratedcontent\.net$/.test(url.hostname)) {
      requestedHosts.push(url.hostname);
      return runtimeResponse({ url: request.url, mimeType: "image/avif", bytes: MINIMAL_AVIF_BYTES });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });
  const work = await loaded.extension.details("2");
  const [installment] = await loaded.extension.installments(work);
  const sequence = await loaded.extension.imagePages(installment);
  assert.equal(sequence.pages[0], `https://a8.gold-usergeneratedcontent.net/123/512/${gallery(2).files[0].hash}.avif`);
  assert.ok(!manifest.allowedHTTPSHosts.includes("a8.gold-usergeneratedcontent.net"));
  await loaded.extension.imagePageContent({ url: sequence.pages[0] });

  const overriddenWork = await loaded.extension.details("1");
  const [overriddenInstallment] = await loaded.extension.installments(overriddenWork);
  const overriddenSequence = await loaded.extension.imagePages(overriddenInstallment);
  assert.equal(overriddenSequence.pages[0], `https://a5.gold-usergeneratedcontent.net/123/256/${gallery(1).files[0].hash}.avif`);
  await loaded.extension.imagePageContent({ url: overriddenSequence.pages[0] });
  assert.deepEqual(requestedHosts, ["a8.gold-usergeneratedcontent.net", "a5.gold-usergeneratedcontent.net"]);

  const unregistered = sequence.pages[0].replace("//a8.", "//a9.");
  await assert.rejects(
    () => loaded.extension.imagePageContent({ url: unregistered }),
    error => error.name === "InvalidIdentifierError"
  );
  await assert.rejects(
    () => loaded.extension.imagePageContent({ url: sequence.pages[0].replace("https://", "http://") }),
    error => error.name === "InvalidResponseError" && /HTTPS/.test(error.message)
  );
  await assert.rejects(
    () => loaded.extension.imagePageContent({ url: sequence.pages[0].replace(".net/", ".net.example/") }),
    error => error.name === "InvalidIdentifierError"
  );

  const fresh = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: dynamicRouting });
    if (url.hostname === "a8.gold-usergeneratedcontent.net") {
      return runtimeResponse({ url: request.url, mimeType: "image/avif", bytes: MINIMAL_AVIF_BYTES });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });
  const revalidated = await fresh.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(revalidated.mimeType, "image/avif");
});

test("HitomiLA rejects routing offsets above its bounded dynamic range", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/galleries/2.js") return runtimeResponse({ url: request.url, text: galleryAssignment(2) });
    if (url.pathname === "/gg.js") {
      return runtimeResponse({
        url: request.url,
        text: routing.replace("var o = 1;", "var o = 1000;")
      });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });
  const work = await loaded.extension.details("2");
  const [installment] = await loaded.extension.installments(work);
  await assert.rejects(
    () => loaded.extension.imagePages(installment),
    error => error.name === "InvalidResponseError" && /routing configuration/.test(error.message)
  );
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
    if (mode === "nozomi") {
      return runtimeResponse({
        url: request.url,
        status: 206,
        mimeType: "application/x-nozomi",
        headers: { "Content-Range": "bytes 0-2/200" },
        bytes: [0, 0, 1]
      });
    }
    return runtimeResponse({ url: request.url, text: "var galleryinfo = {title: 'not json'};" });
  });
  await assert.rejects(() => loaded.extension.discover({ sectionId: "latest" }), error => error.name === "InvalidResponseError");
  mode = "gallery";
  await assert.rejects(() => loaded.extension.details("1"), error => error.name === "InvalidResponseError");
});

test("HitomiLA rejects compressed and inconsistent ranged Nozomi representations", async () => {
  const cases = [
    {
      headers: {
        "Content-Range": "bytes 0-3/200",
        "Content-Encoding": "gzip"
      },
      mimeType: "application/x-nozomi",
      bytes: nozomi([1])
    },
    {
      headers: { "Content-Range": "bytes 4-7/200" },
      mimeType: "application/x-nozomi",
      bytes: nozomi([1])
    },
    {
      headers: { "Content-Range": "bytes 0-3/200" },
      mimeType: "text/html",
      bytes: nozomi([1])
    }
  ];
  for (const fixture of cases) {
    const loaded = await loadContentExtension(mainPath, request => {
      assert.equal(request.headers["Accept-Encoding"], "identity");
      return runtimeResponse({
        url: request.url,
        status: 206,
        ...fixture
      });
    });
    await assert.rejects(
      () => loaded.extension.discover({ sectionId: "latest" }),
      error => error.name === "InvalidResponseError"
    );
  }
});
