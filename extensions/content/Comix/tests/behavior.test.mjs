/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDeclaredHTTPSCovers } from "../../test-assertions.mjs";
import { MINIMAL_PNG_BYTES, MINIMAL_WEBP_BYTES, loadContentExtension, runtimeResponse } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
const item = {
  hid: "sanitized-title",
  title: "Sanitized Title",
  synopsis: "A sanitized protected-API fixture.",
  type: "manga",
  poster: { medium: "https://static.comix.to/posters/sanitized-medium.webp", large: "https://static.comix.to/posters/sanitized.webp" },
  status: "releasing",
  contentRating: "safe",
  ratedAvg: 8.5,
  latestChapter: 4,
  altTitles: ["Sanitized Alternate"],
  authors: [{ id: 1, title: "Sample Author" }],
  artists: [{ id: 2, title: "Sample Artist" }],
  demographics: [{ id: 3, title: "Seinen" }],
  genres: [{ id: 4, title: "Adventure" }],
  tags: [],
  url: "/title/sanitized-title"
};
const initialData = JSON.stringify({ queries: { '["detail","sanitized-title"]': { result: item } } });
const pageHTML = `<!doctype html><html><head><script type="module" src="/assets/main-sanitized.js"></script></head><body><script id="initial-data" type="application/json">${initialData}</script></body></html>`;
const secureModuleFixture = "export function fixtureSecureInstaller() { return null; }";

function protectedLiteral(script, name, wrapped = false) {
  const prefix = wrapped ? `const ${name} = new URL\\(` : `const ${name} = `;
  const match = script.match(new RegExp(`${prefix}(\"(?:\\\\.|[^\"])*\")\\)?;`));
  assert.ok(match, `${name} literal is missing from protected script`);
  return JSON.parse(match[1]);
}

function encodeProtected(value, key) {
  const clear = Buffer.from(JSON.stringify(value), "utf8");
  return { payload: Buffer.from(clear.map(byte => byte ^ key)).toString("base64") };
}

function decodeProtected(value, key) {
  const encrypted = Buffer.from(value.payload, "base64");
  return JSON.parse(Buffer.from(encrypted.map(byte => byte ^ key)).toString("utf8"));
}

test("Comix dynamically installs secure signing and decoding for direct protected API operations", async () => {
  const secureModules = new Map();
  const loaded = await loadContentExtension(
    mainPath,
    request => {
      const url = new URL(request.url);
      if (url.hostname === "comix.to" && url.pathname === "/") return runtimeResponse({ url: request.url, text: pageHTML });
      if (url.hostname === "comix.to" && url.pathname === "/assets/main-sanitized.js") {
        return runtimeResponse({ url: request.url, text: 'import "./secure-sanitized.js";' });
      }
      if (url.hostname === "comix.to" && url.pathname === "/assets/secure-sanitized.js") {
        return runtimeResponse({ url: request.url, text: secureModuleFixture });
      }
      if (url.hostname === "comix.to" && url.pathname.startsWith("/api/v1/")) {
        assert.match(url.searchParams.get("fixture-signature") || "", /^[0-9a-f]+-[1-9][0-9]*$/, "native broker receives the signed API URL");
        assert.equal(request.headers["X-Fixture-Signed"], "yes");
        let clear;
        if (url.pathname === "/api/v1/manga" && url.searchParams.has("page")) {
          clear = { result: { items: [item], meta: { page: 1, lastPage: 1 } } };
        } else if (url.pathname === "/api/v1/manga/sanitized-title") {
          clear = { result: item };
        } else if (url.pathname === "/api/v1/manga/sanitized-title/chapters") {
          clear = { items: [{ id: 123, language: "en", number: 4, name: "Arrival", url: "/title/sanitized-title/chapter/123" }], meta: { page: 1, lastPage: 1 } };
        } else if (url.pathname === "/api/v1/chapters/123") {
          clear = { pages: { baseUrl: "https://cdn.wowpic1.store/pages", items: [{ url: "one.webp", s: 7, width: 4, height: 4 }, { url: "/two.webp" }] } };
        } else {
          throw new Error(`Unexpected protected API URL ${url.href}`);
        }
        const identity = [...secureModules.keys()][0];
        const secure = secureModules.get(identity);
        const encoded = encodeProtected(clear, secure.key);
        assert.notDeepEqual(encoded, clear);
        return runtimeResponse({ url: request.url, headers: { "x-enc": "1" }, text: JSON.stringify(encoded) });
      }
      if (url.hostname === "static.comix.to" || url.hostname === "cdn.wowpic1.store") return runtimeResponse({ url: request.url, mimeType: "image/webp", bytes: MINIMAL_WEBP_BYTES });
      throw new Error(`Unexpected request ${request.url}`);
    },
    {
      webHandler(request) {
        if (request.script.includes("const imageURL = ")) {
          assert.match(request.script, /await import\(moduleBlobURL\)/);
          assert.match(request.script, /URL\.createObjectURL\(new Blob/);
          assert.equal(protectedLiteral(request.script, "secureModuleSource"), secureModuleFixture);
          assert.match(request.script, /candidate\.length === 3/);
          assert.match(request.script, /blobDescrambler/);
          assert.doesNotMatch(request.script, /x-scramble/i);
          assert.match(request.script, /requested === parsedImageURL\.href/);
          assert.match(request.script, /attempted an unbrokered HTTP request/);
          assert.match(request.script, /new Response\(payloadBytes\.slice\(\)\.buffer/);
          assert.equal(request.payloadMimeType, "image/webp");
          assert.equal(request.payloadBase64, Buffer.from(MINIMAL_WEBP_BYTES).toString("base64"));
          const imageURL = new URL(protectedLiteral(request.script, "imageURL"));
          const moduleURL = protectedLiteral(request.script, "secureModuleURL");
          const fingerprint = protectedLiteral(request.script, "moduleFingerprint");
          assert.equal(imageURL.href, "https://cdn.wowpic1.store/pages/one.webp");
          assert.match(request.script, /"s":7,"width":4,"height":4/);
          const identity = `${moduleURL}#${fingerprint}`;
          const secure = secureModules.get(identity);
          assert.ok(secure, "image execution uses the protected API module identity");
          secure.descrambleCalls++;
          const png = Buffer.from(MINIMAL_PNG_BYTES);
          return { result: { ok: true, dataBase64: png.toString("base64"), mimeType: "image/png", moduleFingerprint: fingerprint }, cookies: [] };
        }
        assert.match(request.script, /await import\(moduleBlobURL\)/);
        assert.match(request.script, /URL\.createObjectURL\(new Blob/);
        assert.doesNotMatch(request.script, /await import\(secureModuleURL\)/);
        assert.equal(protectedLiteral(request.script, "secureModuleSource"), secureModuleFixture);
        assert.equal(request.loadCSS, false);
        assert.equal(request.loadImages, false);
        if (request.script.includes("const encodedDataBase64 = ")) {
          assert.match(request.script, /responseInterceptor/);
          assert.doesNotMatch(request.script, /\bfetch\s*\(/);
          const moduleURL = protectedLiteral(request.script, "secureModuleURL");
          const fingerprint = protectedLiteral(request.script, "moduleFingerprint");
          const secure = secureModules.get(`${moduleURL}#${fingerprint}`);
          assert.ok(secure, "decoder uses the signer module identity");
          const encodedBody = Buffer.from(protectedLiteral(request.script, "encodedDataBase64"), "base64").toString("utf8");
          secure.decodeCalls++;
          const decoded = decodeProtected(JSON.parse(encodedBody), secure.key);
          // The live secure interceptor currently returns decrypted JSON text for
          // encrypted chapter/page endpoints, rather than an already-parsed value.
          return { result: { ok: true, value: JSON.stringify(decoded), moduleFingerprint: fingerprint }, cookies: [] };
        }
        assert.match(request.script, /requestInterceptor/);
        assert.doesNotMatch(request.script, /\bfetch\s*\(/);
        const target = new URL(protectedLiteral(request.script, "targetURL", true));
        const moduleURL = protectedLiteral(request.script, "secureModuleURL");
        const fingerprint = protectedLiteral(request.script, "moduleFingerprint");
        assert.equal(moduleURL, "https://comix.to/assets/secure-sanitized.js");
        const identity = `${moduleURL}#${fingerprint}`;
        if (!secureModules.has(identity)) secureModules.set(identity, { key: 0x5a, signCalls: 0, decodeCalls: 0, descrambleCalls: 0 });
        const secure = secureModules.get(identity);

        // Model the dynamically discovered request interceptor: it mutates every
        // protected URL, and the fixture server refuses unsigned requests.
        secure.signCalls++;
        const signed = new URL(target);
        signed.searchParams.set("fixture-signature", `${fingerprint}-${secure.signCalls}`);
        assert.equal(signed.searchParams.get("fixture-signature"), `${fingerprint}-${secure.signCalls}`);

        return { result: { ok: true, url: signed.href, headers: { "X-Fixture-Signed": "yes" }, moduleFingerprint: fingerprint }, cookies: [] };
      }
    }
  );

  const discovery = await loaded.extension.discover({ sectionId: "popular" });
  assert.equal(discovery.items.length, 1);
  assert.equal(discovery.items[0].type, "work");
  await assertDeclaredHTTPSCovers(mainPath, discovery.items);
  const cover = await loaded.extension.imagePageContent({ url: discovery.items[0].imageUrl });
  assert.equal(cover.mimeType, "image/webp");
  const work = await loaded.extension.details("sanitized-title");
  assert.equal(work.workInfo.status, "ongoing");
  assert.equal(work.workInfo.author, "Sample Author");
  assert.equal(work.workInfo.artist, "Sample Artist");
  const chapters = await loaded.extension.installments(work);
  assert.equal(chapters[0].installmentId, "123");
  const sequence = await loaded.extension.imagePages(chapters[0]);
  assert.deepEqual(Array.from(sequence.pages), [
    "https://cdn.wowpic1.store/pages/one.webp#mr-comix=7,4,4",
    "https://cdn.wowpic1.store/pages/two.webp"
  ]);
  const image = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(image.mimeType, "image/png");
  assert.equal(loaded.webCalls.length, 9);
  assert.equal(loaded.calls.filter(call => new URL(call.url).pathname.startsWith("/api/v1/")).length, 4, "all protected API payloads pass through the native request broker");
  assert.equal(secureModules.size, 1, "all isolated executions use one validated secure-module identity");
  const secure = [...secureModules.values()][0];
  assert.equal(secure.signCalls, 4);
  assert.equal(secure.decodeCalls, 4);
  assert.equal(secure.descrambleCalls, 1);
  assert.equal(loaded.calls.filter(call => new URL(call.url).pathname === "/assets/main-sanitized.js").length, 1, "bounded runtime cache reuses secure-module discovery metadata");
  assert.equal(loaded.calls.filter(call => new URL(call.url).pathname === "/assets/secure-sanitized.js").length, 1, "bounded runtime cache reuses the brokered secure-module source");
});

test("Comix fails closed when signing or x-enc response decoding fails", async () => {
  const responder = request => {
    const url = new URL(request.url);
    if (url.pathname === "/") return runtimeResponse({ url: request.url, text: pageHTML });
    if (url.pathname === "/assets/main-sanitized.js") return runtimeResponse({ url: request.url, text: 'import "./secure-sanitized.js";' });
    if (url.pathname === "/assets/secure-sanitized.js") return runtimeResponse({ url: request.url, text: secureModuleFixture });
    if (url.pathname === "/api/v1/manga") return runtimeResponse({ url: request.url, headers: { "x-enc": "1" }, text: JSON.stringify(encodeProtected({ result: { items: [], meta: { page: 1, lastPage: 1 } } }, 0x5a)) });
    throw new Error(`Unexpected request ${request.url}`);
  };
  const signing = await loadContentExtension(mainPath, responder, {
    webHandler: () => ({ result: { ok: false, error: { code: "signingFailed", message: "fixture signer refused" } }, cookies: [] })
  });
  await assert.rejects(
    signing.extension.discover({ sectionId: "popular" }),
    error => error?.name === "ServiceError" && /signer refused/.test(error.message)
  );

  const decoding = await loadContentExtension(mainPath, responder, {
    webHandler: request => request.script.includes("const targetURL = ")
      ? {
          result: {
            ok: true,
            url: protectedLiteral(request.script, "targetURL", true),
            headers: {},
            moduleFingerprint: protectedLiteral(request.script, "moduleFingerprint")
          },
          cookies: []
        }
      : { result: { ok: false, error: { code: "decodeFailed", message: "fixture x-enc decoder refused" } }, cookies: [] }
  });
  await assert.rejects(
    decoding.extension.discover({ sectionId: "popular" }),
    error => error?.name === "InvalidResponseError" && /decoder refused/.test(error.message)
  );
});

test("Comix protected API payloads retain the native broker response ceiling", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/") return runtimeResponse({ url: request.url, text: pageHTML });
    if (url.pathname === "/assets/main-sanitized.js") return runtimeResponse({ url: request.url, text: 'import "./secure-sanitized.js";' });
    if (url.pathname === "/assets/secure-sanitized.js") return runtimeResponse({ url: request.url, text: secureModuleFixture });
    if (url.pathname === "/api/v1/manga") {
      const error = new Error("The native HTTP response exceeded 16 MiB");
      error.name = "ResponseTooLargeError";
      throw error;
    }
    throw new Error(`Unexpected request ${request.url}`);
  }, {
    webHandler: request => ({
      result: {
        ok: true,
        url: protectedLiteral(request.script, "targetURL", true),
        headers: {},
        moduleFingerprint: protectedLiteral(request.script, "moduleFingerprint")
      },
      cookies: []
    })
  });
  await assert.rejects(
    loaded.extension.discover({ sectionId: "popular" }),
    error => error?.name === "ResponseTooLargeError" && /16 MiB/.test(error.message)
  );
  assert.equal(loaded.calls.filter(call => new URL(call.url).pathname === "/api/v1/manga").length, 1);
});

test("Comix rejects a secure module that gains an unbrokered dependency graph", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/") return runtimeResponse({ url: request.url, text: pageHTML });
    if (url.pathname === "/assets/main-sanitized.js") return runtimeResponse({ url: request.url, text: 'import "./secure-sanitized.js";' });
    if (url.pathname === "/assets/secure-sanitized.js") return runtimeResponse({ url: request.url, text: 'import "./dependency.js"; export const value = 1;' });
    throw new Error(`Unexpected request ${request.url}`);
  }, {
    webHandler: () => { throw new Error("Web execution must not start for a non-self-contained module"); }
  });
  await assert.rejects(
    loaded.extension.discover({ sectionId: "popular" }),
    error => error?.name === "ServiceError" && /no longer self-contained/.test(error.message)
  );
  assert.equal(loaded.webCalls.length, 0);
});

test("Comix fails closed when the site-provided image descrambler is unavailable", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/") return runtimeResponse({ url: request.url, text: pageHTML });
    if (url.pathname === "/assets/main-sanitized.js") return runtimeResponse({ url: request.url, text: 'import "./secure-sanitized.js";' });
    if (url.pathname === "/assets/secure-sanitized.js") return runtimeResponse({ url: request.url, text: secureModuleFixture });
    if (url.hostname === "static.comix.to") return runtimeResponse({ url: request.url, mimeType: "image/webp", bytes: MINIMAL_WEBP_BYTES });
    throw new Error(`Unexpected request ${request.url}`);
  }, {
    webHandler: request => {
      assert.match(request.script, /secure image descrambler/i);
      return { result: { ok: false, error: { code: "descramblerUnavailable", message: "fixture site descrambler missing" } }, cookies: [] };
    }
  });
  await assert.rejects(
    loaded.extension.imagePageContent({ url: "https://static.comix.to/pages/protected.webp#mr-comix=7,100,200" }),
    error => error?.name === "InvalidResponseError" && /descrambler missing/.test(error.message)
  );
});

test("Comix rejects site-descrambled images above the exact 16 MiB resource ceiling", async () => {
  const maximumBase64Length = Math.ceil((16 * 1024 * 1024) / 3) * 4;
  assert.equal(maximumBase64Length, 22_369_624);
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/") return runtimeResponse({ url: request.url, text: pageHTML });
    if (url.pathname === "/assets/main-sanitized.js") return runtimeResponse({ url: request.url, text: 'import "./secure-sanitized.js";' });
    if (url.pathname === "/assets/secure-sanitized.js") return runtimeResponse({ url: request.url, text: secureModuleFixture });
    if (url.hostname === "static.comix.to") return runtimeResponse({ url: request.url, mimeType: "image/webp", bytes: MINIMAL_WEBP_BYTES });
    throw new Error(`Unexpected request ${request.url}`);
  }, {
    webHandler: request => {
      assert.match(request.script, /const maximumImageBase64Length = 22369624/);
      return {
        result: {
          ok: true,
          dataBase64: "A".repeat(maximumBase64Length + 4),
          mimeType: "image/png",
          moduleFingerprint: protectedLiteral(request.script, "moduleFingerprint")
        },
        cookies: []
      };
    }
  });
  await assert.rejects(
    loaded.extension.imagePageContent({ url: "https://static.comix.to/pages/oversized.webp#mr-comix=7,100,200" }),
    error => error?.name === "InvalidResponseError" && /16 MiB/.test(error.message)
  );
});
