/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 MangaReader Extension Contributors */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const bridgeSource = await readFile(join(packageRoot, "bridge.js"), "utf8");
const registryRoot = resolve(process.env.INKDEX_REGISTRY_ROOT ?? "/tmp/inkdex-registry/0.9/stable");
const registrySkip = existsSync(registryRoot)
  ? false
  : `Paperback registry is unavailable at ${registryRoot}`;

const plain = value => JSON.parse(JSON.stringify(value));
const base64 = value => Buffer.from(value).toString("base64");

function makeTextarea() {
  return {
    value: "",
    set innerHTML(value) {
      this.value = String(value)
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", "\"")
        .replaceAll("&#39;", "'");
    }
  };
}

function loadBridge() {
  const state = new Map();
  const secureState = new Map();
  const sandbox = {
    MangaReader: {
      context: {
        state: {
          get: key => state.get(key),
          set: (key, value) => state.set(key, value),
          remove: key => state.delete(key),
          reset: () => state.clear()
        },
        secureState: {
          get: key => secureState.get(key),
          set: (key, value) => secureState.set(key, value),
          remove: key => secureState.delete(key)
        },
        rateLimit: { sleep: async () => {} }
      }
    },
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    ArrayBuffer,
    Uint8Array,
    DataView,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    document: { createElement: () => makeTextarea() }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(bridgeSource, context, { filename: "bridge.js", timeout: 5_000 });
  return context;
}

test("Paperback base64 decoding returns valid UTF-8 text", () => {
  const context = loadBridge();
  const expected = "MangaReader • 漫画";
  context.__encoded = Buffer.from(expected, "utf8").toString("base64");
  assert.equal(vm.runInContext("Application.base64Decode(__encoded)", context), expected);
});

test("Paperback base64 decoding preserves non-UTF-8 binary bytes", () => {
  const context = loadBridge();
  context.__encoded = Buffer.from([0xff, 0xfe, 0x80, 0x00]).toString("base64");
  assert.deepEqual(
    plain(vm.runInContext("Array.from(new Uint8Array(Application.base64Decode(__encoded)))", context)),
    [0xff, 0xfe, 0x80, 0x00]
  );
});

test("Paperback base64 decoding parses an unpadded base64url JWT payload", () => {
  const context = loadBridge();
  const expected = { sub: "reader-1", username: "漫画", exp: 1_900_000_000 };
  context.__encoded = Buffer.from(JSON.stringify(expected), "utf8").toString("base64url");
  const decoded = vm.runInContext("Application.base64Decode(__encoded)", context);
  assert.deepEqual(JSON.parse(decoded), expected);
});

async function loadBundle(id, { prepare, response, initialState = {}, initialSecureState = {} } = {}) {
  const bundleSource = await readFile(join(registryRoot, id, "index.js"), "utf8");
  const state = new Map(Object.entries(plain(initialState)));
  const secureState = new Map(Object.entries(plain(initialSecureState)));
  const requests = [];
  const challenges = [];
  let definition;

  const sandbox = {
    MangaReader: {
      context: {
        http: {
          async request(input) {
            requests.push(plain(input));
            return response?.(input) ?? {
              url: input.url,
              status: 200,
              headers: { "content-type": "application/octet-stream" },
              mimeType: "application/octet-stream",
              cookies: [],
              dataBase64: ""
            };
          }
        },
        state: {
          get: key => state.get(key),
          set: (key, value) => state.set(key, plain(value)),
          remove: key => state.delete(key),
          reset: () => state.clear()
        },
        secureState: {
          get: key => secureState.get(key),
          set: (key, value) => secureState.set(key, plain(value)),
          remove: key => secureState.delete(key)
        },
        rateLimit: { sleep: async () => {} },
        challenge: { request: url => challenges.push(url) }
      }
    },
    defineContentExtension(candidate) {
      assert.equal(definition, undefined, `${id} registered more than once`);
      definition = candidate;
    },
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    ArrayBuffer,
    Uint8Array,
    DataView,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    document: { createElement: () => makeTextarea() }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(bridgeSource, context, { filename: "bridge.js", timeout: 5_000 });
  vm.runInContext(bundleSource, context, { filename: `${id}/index.js`, timeout: 5_000 });
  if (prepare) vm.runInContext(prepare, context, { filename: `${id}/prepare.js`, timeout: 5_000 });
  vm.runInContext(
    `PaperbackCompat.registerContent(${JSON.stringify(id)}, source[${JSON.stringify(id)}]);`,
    context,
    { filename: `${id}/register.js`, timeout: 5_000 }
  );
  assert.ok(definition, `${id} did not register an extension`);
  return { context, definition, requests, challenges, state, secureState };
}

test("the bridge registers every pinned Paperback content singleton", { skip: registrySkip }, async () => {
  const entries = (await readdir(registryRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  const contentEntries = entries.filter(id => id !== "AniList" && id !== "MangaUpdates");
  assert.equal(contentEntries.length, 66);

  for (const id of contentEntries) {
    const { definition, context } = await loadBundle(id);
    assert.equal(definition.id, id);
    assert.equal(definition.apiVersion, "1.0");
    assert.ok(context.source[id], `${id} has no exported singleton`);
    assert.equal(typeof definition.search, "function");
  }
});

test("a compiled MangaDex bundle maps content operations to MangaReader API v1", { skip: registrySkip }, async () => {
  const prepare = `
    globalThis.__calls = [];
    const instance = source.MangaDex;
    instance.getDiscoverSections = async () => [
      { id: "latest", title: "Latest", subtitle: "Fresh chapters", type: 2 }
    ];
    instance.getDiscoverSectionItems = async (section, cursor) => {
      __calls.push(["discover", section, cursor]);
      return {
        items: [{ type: "simpleCarouselItem", mangaId: "manga-1", imageUrl: "https://mock.test/cover.jpg", title: "Mock Manga", subtitle: "Chapter 12", contentRating: "MATURE" }],
        metadata: { page: 2 }
      };
    };
    instance.getSortingOptions = async () => [{ id: "relevance", label: "Relevance" }];
    instance.getSearchResults = async (query, cursor, sorting) => {
      __calls.push(["search", query, cursor, sorting]);
      return {
        items: [{ mangaId: "manga-1", title: query.title, subtitle: sorting.id, imageUrl: "https://mock.test/cover.jpg", contentRating: "SAFE" }],
        metadata: { cursor: "next" }
      };
    };
    instance.getMangaDetails = async mangaId => ({
      mangaId,
      mangaInfo: {
        thumbnailUrl: "https://mock.test/cover.jpg",
        synopsis: "Mapped synopsis",
        primaryTitle: "Mock Manga",
        secondaryTitles: ["Mock Alternate"],
        contentRating: "ADULT",
        status: "Completed",
        artist: "Mock Artist",
        author: "Mock Author",
        shareUrl: "https://mock.test/title/manga-1"
      }
    });
    instance.getChapters = async sourceManga => {
      __calls.push(["chapters", sourceManga]);
      return [{
        sourceManga,
        chapterId: "chapter-12",
        langCode: "en",
        chapNum: 12.5,
        title: "Chapter 12.5",
        volume: 2,
        publishDate: new Date("2026-07-16T00:00:00Z")
      }];
    };
    instance.getChapterDetails = async chapter => {
      __calls.push(["chapterDetails", chapter]);
      return {
        id: chapter.chapterId,
        mangaId: chapter.sourceManga.mangaId,
        pages: ["https://mock.test/page-1.jpg", { url: "https://mock.test/page-2.jpg" }]
      };
    };
  `;
  const runtime = await loadBundle("MangaDex", {
    prepare,
    response: input => ({
      url: input.url,
      status: 200,
      headers: { "content-type": "image/jpeg" },
      mimeType: "image/jpeg",
      cookies: [],
      dataBase64: base64("mock-image")
    })
  });
  const { definition, context, requests } = runtime;

  await definition.initialize();
  assert.deepEqual(plain(await definition.discoverSections()), [
    { id: "latest", title: "Latest", subtitle: "Fresh chapters", type: 2 }
  ]);
  assert.deepEqual(plain(await definition.discover({ section: { id: "latest" }, cursor: { page: 1 } })), {
    items: [{
      type: "simpleCarouselItem",
      workId: "manga-1",
      imageUrl: "https://mock.test/cover.jpg",
      title: "Mock Manga",
      subtitle: "Chapter 12",
      contentRating: "MATURE"
    }],
    metadata: { page: 2 }
  });
  assert.deepEqual(plain(await definition.search({ query: "Needle", cursor: { page: 3 } })), {
    items: [{
      workId: "manga-1",
      id: "manga-1",
      title: "Needle",
      subtitle: "relevance",
      imageUrl: "https://mock.test/cover.jpg",
      coverURL: "https://mock.test/cover.jpg",
      contentRating: "SAFE",
      mediaKind: "manga"
    }],
    metadata: { cursor: "next" }
  });

  const work = await definition.details("manga-1");
  assert.deepEqual(plain(work), {
    workId: "manga-1",
    workInfo: {
      thumbnailUrl: "https://mock.test/cover.jpg",
      synopsis: "Mapped synopsis",
      primaryTitle: "Mock Manga",
      secondaryTitles: ["Mock Alternate"],
      contentRating: "ADULT",
      status: "Completed",
      artist: "Mock Artist",
      author: "Mock Author",
      shareUrl: "https://mock.test/title/manga-1"
    }
  });
  const installments = await definition.installments(work);
  assert.deepEqual(plain(installments), [{
    installmentId: "chapter-12",
    langCode: "en",
    number: 12.5,
    title: "Chapter 12.5",
    volume: 2,
    publishDate: "2026-07-16T00:00:00.000Z"
  }]);
  assert.deepEqual(plain(await definition.imagePages({ ...installments[0], sourceWork: work })), {
    id: "chapter-12",
    workId: "manga-1",
    pages: ["https://mock.test/page-1.jpg", "https://mock.test/page-2.jpg"]
  });
  assert.deepEqual(plain(await definition.imagePageContent({ url: "https://mock.test/page-1.jpg" })), {
    dataBase64: base64("mock-image"),
    mimeType: "image/jpeg"
  });
  assert.equal(requests.at(-1).url, "https://mock.test/page-1.jpg");

  const calls = plain(context.__calls);
  assert.deepEqual(calls[0], ["discover", { id: "latest" }, { page: 1 }]);
  assert.deepEqual(calls[1], ["search", { title: "Needle", metadata: {} }, { page: 3 }, { id: "relevance", label: "Relevance" }]);
  assert.equal(calls[2][0], "chapters");
  assert.equal(calls[2][1].mangaId, "manga-1");
  assert.equal(calls[3][0], "chapterDetails");
  assert.equal(calls[3][1].sourceManga.mangaId, "manga-1");
});

test("Paperback Cloudflare errors become MangaReader challenge errors exactly once", { skip: registrySkip }, async () => {
  const mangaFox = await loadBundle("MangaFox", {
    response: input => ({
      url: input.url,
      status: 403,
      headers: { "cf-mitigated": "challenge", "content-type": "text/html" },
      mimeType: "text/html",
      cookies: [],
      dataBase64: base64("challenge")
    })
  });
  await mangaFox.definition.initialize();
  await assert.rejects(
    mangaFox.definition.imagePageContent({ url: "https://fanfox.net/challenge.jpg" }),
    error => {
      assert.equal(error.name, "ChallengeRequiredError");
      assert.equal(error.type, "challengeRequired");
      assert.equal(error.url, "https://fanfox.net/");
      return true;
    }
  );
  assert.deepEqual(mangaFox.challenges, ["https://fanfox.net/"]);

  const mangaDex = await loadBundle("MangaDex", {
    prepare: `
      source.MangaDex.getSettingsForm = async () => {
        const error = new Error("Settings challenge");
        error.type = "cloudflareError";
        error.resolutionRequest = { url: "https://auth.mock.test/verify" };
        throw error;
      };
    `
  });
  await assert.rejects(
    mangaDex.definition.settings(),
    error => error.name === "ChallengeRequiredError"
      && error.type === "challengeRequired"
      && error.url === "https://auth.mock.test/verify"
  );
  assert.deepEqual(mangaDex.challenges, ["https://auth.mock.test/verify"]);
});

test("Paperback cookie expiration dates survive state reloads and HTTP responses", { skip: registrySkip }, async () => {
  const persistedExpiry = "2099-01-02T03:04:05.000Z";
  const responseExpiry = "2099-06-07T08:09:10.000Z";
  const runtime = await loadBundle("MangaFox", {
    initialState: {
      cookie_store_cookies: [{
        name: "persisted",
        value: "one",
        domain: "fanfox.net",
        path: "/",
        expires: persistedExpiry
      }]
    },
    response: input => ({
      url: input.url,
      status: 200,
      headers: { "content-type": "image/jpeg" },
      mimeType: "image/jpeg",
      cookies: [{
        name: "fresh",
        value: "two",
        domain: "fanfox.net",
        path: "/",
        expires: responseExpiry
      }],
      dataBase64: base64("image")
    })
  });

  assert.equal(vm.runInContext(
    `source.MangaFox.cookieStorageInterceptor.cookies[0].expires instanceof Date
      && source.MangaFox.cookieStorageInterceptor.cookies[0].expires.getTime() === Date.parse(${JSON.stringify(persistedExpiry)})`,
    runtime.context
  ), true);
  await runtime.definition.initialize();
  await runtime.definition.imagePageContent({ url: "https://fanfox.net/page.jpg" });
  assert.equal(vm.runInContext(
    `source.MangaFox.cookieStorageInterceptor.cookies.every(cookie => cookie.expires instanceof Date && Number.isFinite(cookie.expires.getTime()))`,
    runtime.context
  ), true);
  assert.equal(vm.runInContext(
    `Application.getState("cookie_store_cookies").every(cookie => cookie.expires instanceof Date)`,
    runtime.context
  ), true);
  assert.deepEqual(runtime.state.get("cookie_store_cookies").map(cookie => cookie.expires), [persistedExpiry, responseExpiry]);
});

test("latest-update providers map only upstream identifiers, dates, and pagination", { skip: registrySkip }, async () => {
  const { definition, context } = await loadBundle("MangaPlus", {
    prepare: `
      globalThis.__updateCalls = [];
      source.MangaPlus.getLatestUpdates = async (section, cursor) => {
        __updateCalls.push([section, cursor]);
        return {
          items: [
            { mangaId: "remote-1", changedAt: new Date("2026-07-16T02:00:00Z"), title: "Ignored presentation data" },
            { id: "update-2", mangaId: "remote-2", updatedAt: "not-a-date" },
            { title: "Missing identifier" }
          ],
          metadata: { page: 2 },
          nextPage: 3,
          totalCount: 7
        };
      };
    `
  });

  assert.deepEqual(plain(await definition.updates({
    since: "2026-07-15T00:00:00Z",
    cursor: { value: "{\"page\":1}", metadata: {} }
  })), {
    items: [
      { id: "remote-1", remoteWorkID: "remote-1", changedAt: 805860000 },
      { id: "update-2", remoteWorkID: "remote-2" }
    ],
    nextCursor: { value: "{\"page\":2}", metadata: {} },
    nextPage: 3,
    totalCount: 7
  });
  assert.deepEqual(plain(context.__updateCalls), [[null, { page: 1 }]]);
});

test("managed collections preserve upstream membership and commit an actual diff", { skip: registrySkip }, async () => {
  const { definition, context } = await loadBundle("MangaDex", {
    prepare: `
      globalThis.__collectionCommits = [];
      const instance = source.MangaDex;
      const collection = { id: "reading", title: "Reading", marker: "upstream-object", modifiedAt: new Date("2026-07-16T03:00:00Z") };
      const current = [
        { mangaId: "keep", mangaInfo: { primaryTitle: "Keep" } },
        { mangaId: "remove", mangaInfo: { primaryTitle: "Remove" } },
        { mangaId: "keep", mangaInfo: { primaryTitle: "Duplicate" } }
      ];
      instance.getManagedLibraryCollections = async () => [collection];
      instance.getSourceMangaInManagedCollection = async received => {
        if (received.marker !== "upstream-object") throw new Error("Bridge replaced the upstream collection");
        return current;
      };
      instance.getMangaDetails = async mangaId => ({ mangaId, mangaInfo: { primaryTitle: "Fetched " + mangaId, verified: true } });
      instance.commitManagedCollectionChanges = async changes => __collectionCommits.push(changes);
    `
  });

  assert.deepEqual(plain(await definition.managedCollections({ cursor: null })), {
    items: [{
      id: "reading",
      title: "Reading",
      workRemoteIDs: ["keep", "remove"],
      modifiedAt: 805863600
    }],
    totalCount: 1
  });
  await definition.synchronizeManagedCollection({
    id: "reading",
    title: "Reading",
    workRemoteIDs: ["keep", "add"]
  });
  const commits = plain(context.__collectionCommits);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].collection.marker, "upstream-object");
  assert.deepEqual(commits[0].additions, [{ mangaId: "add", mangaInfo: { primaryTitle: "Fetched add", verified: true } }]);
  assert.deepEqual(commits[0].deletions, [{ mangaId: "remove", mangaInfo: { primaryTitle: "Remove" } }]);
});
