/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 manko Extension Contributors */

import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(packageRoot, "../..");
const bridgeSource = await readFile(join(packageRoot, "bridge.js"), "utf8");
const registryRoot = resolve(process.env.INKDEX_REGISTRY_ROOT ?? "/tmp/inkdex-registry/0.9/stable");
const registrySkip = existsSync(registryRoot)
  ? false
  : `Paperback registry is unavailable at ${registryRoot}`;

const plain = value => JSON.parse(JSON.stringify(value));
const base64 = value => Buffer.from(value).toString("base64");

function encryptZeroPaddedAES(text, keyHex, ivHex) {
  const input = Buffer.from(text, "utf8");
  const padded = Buffer.alloc(Math.ceil(input.length / 16) * 16);
  input.copy(padded);
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(keyHex, "hex"), Buffer.from(ivHex, "hex"));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}

function encodeSojsonV4Fixture(source) {
  const prefix = "['sojson.v4']".padEnd(240, "_");
  const encoded = [...source].map(character => character.charCodeAt(0)).join("x");
  return `${prefix}${encoded}${"z".repeat(59)}`;
}

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

function makeDocument() {
  return {
    createElement(tag) {
      return String(tag).toLowerCase() === "canvas" ? { kind: "canvas" } : makeTextarea();
    }
  };
}

function loadBridge() {
  const state = new Map();
  const secureState = new Map();
  const sandbox = {
    manko: {
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
    document: makeDocument()
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(bridgeSource, context, { filename: "bridge.js", timeout: 5_000 });
  return context;
}

function loadSyntheticPaperback(id, mangaInfo = {}) {
  const context = loadBridge();
  let definition;
  context.defineContentExtension = candidate => {
    definition = candidate;
  };
  context.__mangaInfo = plain(mangaInfo);
  vm.runInContext(`
    globalThis.__searchCalls = [];
    globalThis.__synthetic = {
      getSortingOptions: async () => [
        { id: "default", label: "Default" },
        { id: "requested", label: "Requested" }
      ],
      getSearchResults: async (query, cursor, sorting) => {
        __searchCalls.push([query, cursor, sorting]);
        return { items: [], metadata: undefined };
      },
      getMangaDetails: async mangaId => ({ mangaId, mangaInfo: __mangaInfo })
    };
    PaperbackCompat.registerContent(${JSON.stringify(id)}, __synthetic);
  `, context);
  assert.ok(definition, `${id} synthetic source did not register`);
  return { context, definition };
}

test("Paperback base64 decoding returns valid UTF-8 text", () => {
  const context = loadBridge();
  const expected = "manko • 漫画";
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

test("Paperback canvas compatibility is constructible without exposing network APIs", () => {
  const context = loadBridge();
  assert.equal(vm.runInContext("new HTMLCanvasElement().kind", context), "canvas");
  assert.equal(
    vm.runInContext("typeof fetch + ':' + typeof XMLHttpRequest + ':' + typeof WebSocket", context),
    "undefined:undefined:undefined"
  );
});

async function loadBundle(id, { prepare, response, web, globals = {}, apiVersion = "1.0", generated = false, initialState = {}, initialSecureState = {} } = {}) {
  const bundleSource = await readFile(
    generated
      ? join(monorepoRoot, "extensions", "content", id, "main.js")
      : join(registryRoot, id, "index.js"),
    "utf8"
  );
  const state = new Map(Object.entries(plain(initialState)));
  const secureState = new Map(Object.entries(plain(initialSecureState)));
  const requests = [];
  const challenges = [];
  let definition;

  const sandbox = {
    manko: {
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
        challenge: { request: url => challenges.push(url) },
        ...(web ? { web: { execute: web } } : {})
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
    document: makeDocument(),
    ...globals
  };
  const context = vm.createContext(sandbox);
  if (!generated) vm.runInContext(bridgeSource, context, { filename: "bridge.js", timeout: 5_000 });
  vm.runInContext(bundleSource, context, { filename: `${id}/index.js`, timeout: 5_000 });
  if (prepare) vm.runInContext(prepare, context, { filename: `${id}/prepare.js`, timeout: 5_000 });
  if (!generated) {
    vm.runInContext(
      `PaperbackCompat.registerContent(${JSON.stringify(id)}, source[${JSON.stringify(id)}], { apiVersion: ${JSON.stringify(apiVersion)} });`,
      context,
      { filename: `${id}/register.js`, timeout: 5_000 }
    );
  }
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

test("a compiled MangaDex bundle maps content operations to manko API v1", { skip: registrySkip }, async () => {
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
      shareUrl: "https://mock.test/title/manga-1",
      mediaKind: "manga"
    }
  });
  const installments = await definition.installments(work);
  assert.deepEqual(plain(installments), [{
    installmentId: "chapter-12",
    workId: "manga-1",
    langCode: "en",
    number: 12.5,
    title: "Chapter 12.5",
    volume: 2,
    publishDate: "2026-07-16T00:00:00.000Z",
    format: "imageSequence"
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
  assert.deepEqual(calls[1], ["search", { title: "Needle" }, { page: 3 }, { id: "relevance", label: "Relevance" }]);
  assert.equal(calls[2][0], "chapters");
  assert.equal(calls[2][1].mangaId, "manga-1");
  assert.equal(calls[3][0], "chapterDetails");
  assert.equal(calls[3][1].sourceManga.mangaId, "manga-1");
});

test("search omits compatibility metadata so each Paperback source can apply its own defaults", async () => {
  const { definition, context } = await loadBundle("Atsumaru", {
    generated: true,
    prepare: `
      globalThis.__searchQueries = [];
      const instance = source.Atsumaru;
      instance.getSortingOptions = async query => {
        __searchQueries.push(["sorting", query]);
        return [];
      };
      instance.getSearchResults = async query => {
        __searchQueries.push(["search", query]);
        return { items: [] };
      };
    `
  });

  await definition.search({ query: "Needle" });
  assert.deepEqual(plain(context.__searchQueries), [
    ["sorting", { title: "Needle" }],
    ["search", { title: "Needle" }]
  ]);
});

test("Paperback metadata facets preserve website groups and exact source values", async () => {
  const mangaDex = loadSyntheticPaperback("MangaDex", {
    primaryTitle: "Grouped",
    tagGroups: [
      { id: "content", title: "Content", tags: [{ id: "safe-id", title: "Safe" }] },
      { id: "genre", title: "Genre", tags: [{ id: "action-id", title: "Action" }] },
      { id: "format", title: "Format", tags: [{ id: "oneshot-id", title: "Oneshot" }] }
    ]
  });
  const grouped = await mangaDex.definition.details("fixture");
  assert.deepEqual(
    plain(grouped.workInfo.searchFacets),
    [
      { fieldID: "format", value: "oneshot-id", title: "Oneshot", groupTitle: "Format", presentation: "tag" },
      { fieldID: "genre", value: "action-id", title: "Action", groupTitle: "Genre", presentation: "tag" },
      { fieldID: "content", value: "safe-id", title: "Safe", groupTitle: "Content", presentation: "tag" }
    ]
  );

  const mangaDot = loadSyntheticPaperback("MangaDot", {
    primaryTitle: "Creators",
    author: "First Author, Second Author",
    artist: "First Author",
    tagGroups: [{ id: "genres", title: "Genres", tags: [{ id: "blue_sky", title: "Blue Sky" }] }]
  });
  const creators = await mangaDot.definition.details("fixture");
  assert.deepEqual(
    plain(creators.workInfo.searchFacets),
    [
      { fieldID: "genres", value: "blue_sky", title: "Blue Sky", groupTitle: "Genres", presentation: "tag" },
      { fieldID: "author", value: "First Author", title: "First Author", groupTitle: "Authors", presentation: "creator" },
      { fieldID: "author", value: "Second Author", title: "Second Author", groupTitle: "Authors", presentation: "creator" },
      { fieldID: "artist", value: "First Author", title: "First Author", groupTitle: "Artists", presentation: "creator" }
    ]
  );
});

test("Paperback structured selections use each pinned source metadata shape", async () => {
  const cases = [
    {
      id: "Atsumaru",
      selections: [
        { fieldID: "tags", value: "action-id", polarity: "include" },
        { fieldID: "tags", value: "blocked-id", polarity: "exclude" }
      ],
      expected: [{ id: "tags", value: { "action-id": "included", "blocked-id": "excluded" } }]
    },
    {
      id: "MangaDex",
      selections: [{ fieldID: "genre", value: "action-id", polarity: "include" }],
      expected: { tagsByGroup: { genre: { "action-id": "included" } } }
    },
    {
      id: "Webtoon",
      selections: [{ fieldID: "genres", value: "DRAMA", polarity: "include" }],
      expected: { genres: ["DRAMA"] }
    },
    {
      id: "RoyalRoad",
      selections: [
        { fieldID: "genres", value: "fantasy", polarity: "exclude" },
        { fieldID: "author", value: "Sample Author", polarity: "include" }
      ],
      expected: { genres: { fantasy: "excluded" }, author: "Sample Author" }
    },
    {
      id: "MangaFox",
      selections: [
        { fieldID: "genres", value: "action", polarity: "include" },
        { fieldID: "genres", value: "blocked", polarity: "exclude" }
      ],
      expected: [{ id: "genres", value: { action: "included" } }]
    }
  ];

  for (const fixture of cases) {
    const runtime = loadSyntheticPaperback(fixture.id);
    await runtime.definition.search({
      query: "needle",
      selections: fixture.selections,
      sort: "requested",
      cursor: { page: 2 }
    });
    const [[query, cursor, sorting]] = plain(runtime.context.__searchCalls);
    assert.equal(query.title, "needle", fixture.id);
    assert.deepEqual(query.metadata, fixture.expected, fixture.id);
    assert.deepEqual(cursor, { page: 2 }, fixture.id);
    assert.equal(sorting.id, "requested", fixture.id);
  }
});

test("a fresh runtime rehydrates opaque manga and chapter context before opening text", async () => {
  const { definition, context } = await loadBundle("LNori", {
    generated: true,
    prepare: `
      globalThis.__rehydrationCalls = [];
      const instance = source.LNori;
      instance.getMangaDetails = async mangaId => {
        __rehydrationCalls.push(["details", mangaId]);
        return { mangaId, mangaInfo: {
          primaryTitle: "Cold Novel", contentType: "novel", contentRating: "SAFE",
          additionalInfo: { volumes: "fixture-volumes" }
        }};
      };
      instance.getChapters = async sourceManga => {
        __rehydrationCalls.push(["chapters", sourceManga.mangaInfo.additionalInfo.volumes]);
        return [{
          sourceManga, chapterId: "chapter-1", langCode: "en", chapNum: 1,
          additionalInfo: { url: "https://lnori.com/chapter-1" }
        }];
      };
      instance.getChapterDetails = async chapter => {
        __rehydrationCalls.push(["chapter", chapter.additionalInfo.url]);
        return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, type: "html", html: "<p>Cold text</p>" };
      };
    `
  });

  const publication = await definition.publicationContent({
    installmentId: "chapter-1",
    workId: "novel-1",
    langCode: "en",
    number: 1,
    format: "xhtml",
    sourceWork: { workId: "novel-1", workInfo: { mediaKind: "lightNovel" } }
  });
  assert.match(publication.text, /Cold text/);
  assert.deepEqual(plain(context.__rehydrationCalls), [
    ["details", "novel-1"],
    ["chapters", "fixture-volumes"],
    ["chapter", "https://lnori.com/chapter-1"]
  ]);
});

test("fresh-runtime hydration reports a removed chapter instead of constructing incomplete context", async () => {
  const { definition } = await loadBundle("LNori", {
    generated: true,
    prepare: `
      const instance = source.LNori;
      instance.getMangaDetails = async mangaId => ({ mangaId, mangaInfo: { primaryTitle: "Removed", contentType: "novel" } });
      instance.getChapters = async () => [];
      instance.getChapterDetails = async () => { throw new Error("must not be called"); };
    `
  });

  await assert.rejects(
    definition.publicationContent({
      installmentId: "removed-chapter",
      workId: "novel-1",
      sourceWork: { workId: "novel-1", workInfo: { mediaKind: "lightNovel" } }
    }),
    /no longer available.*Refresh the title and retry/i
  );
});

test("MangaBat retries only reviewed image mirrors and retains interceptor headers", async () => {
  const runtime = await loadBundle("MangaBat", {
    generated: true,
    response: input => {
      const host = new URL(input.url).hostname;
      return host === "img-r1.2xstorage.com"
        ? {
            url: input.url,
            status: 200,
            headers: { "content-type": "image/webp" },
            mimeType: "image/webp",
            cookies: [],
            dataBase64: base64("mirror-image")
          }
        : {
            url: input.url,
            status: 404,
            headers: { "content-type": "text/html" },
            mimeType: "text/html",
            cookies: [],
            dataBase64: base64("missing")
          };
    }
  });
  await runtime.definition.initialize();

  const resource = await runtime.definition.imagePageContent({
    url: "https://img-r2.2xstorage.com/chapter/page-1.webp"
  });
  assert.equal(resource.mimeType, "image/webp");
  assert.equal(Buffer.from(resource.dataBase64, "base64").toString(), "mirror-image");
  assert.deepEqual(runtime.requests.map(request => new URL(request.url).hostname), [
    "img-r2.2xstorage.com",
    "img-r1.2xstorage.com"
  ]);
  for (const request of runtime.requests) {
    const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    assert.match(headers.referer ?? "", /^https:\/\/www\.mangabats\.com\/?/);
  }
});

test("all imported generated Paperback packages execute search, details, installments, and content contracts", { skip: registrySkip }, async () => {
  const ids = [
    "AllPornComic", "Atsumaru", "LNori", "MadaraDex",
    "MangaDex", "MangaDot", "MangaFox", "Mangago", "RoyalRoad", "Webtoon"
  ];
  const novels = new Set(["LNori", "RoyalRoad"]);

  for (const id of ids) {
    const runtime = await loadBundle(id, {
      generated: true,
      prepare: `
        globalThis.__fixtureCalls = [];
        const instance = source[${JSON.stringify(id)}];
        instance.initialise = async () => __fixtureCalls.push(["initialize"]);
        instance.getSortingOptions = async () => [{ id: "fixture", label: "Fixture" }];
        instance.getSearchResults = async (query, cursor) => {
          __fixtureCalls.push(["search", query, cursor]);
          return {
            items: [{ mangaId: "work-1", title: query.title, imageUrl: "https://fixture.example/cover.jpg", contentRating: "SAFE" }],
            metadata: cursor ? undefined : { page: 2 }
          };
        };
        instance.getMangaDetails = async mangaId => ({ mangaId, mangaInfo: {
          primaryTitle: "Fixture ${id}", synopsis: "Fixture details", contentRating: "SAFE",
          contentType: ${JSON.stringify(novels.has(id) ? "novel" : "manga")}
        }});
        instance.getChapters = async sourceManga => [{
          sourceManga, chapterId: "chapter-1", langCode: "en", chapNum: 1, title: "Chapter 1"
        }];
        instance.getChapterDetails = async chapter => ${novels.has(id)
          ? `({ id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, type: "html", html: "<p>Fixture <em>chapter</em></p>" })`
          : `({ id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages: ["https://fixture.example/1.jpg"] })`};
      `
    });
    const { definition, context } = runtime;
    assert.equal(definition.apiVersion, novels.has(id) ? "1.1" : "1.0", id);
    await definition.initialize();
    const first = await definition.search({ query: "Needle", cursor: undefined });
    const second = await definition.search({ query: "Needle", cursor: first.metadata });
    assert.equal(first.items[0].workId, "work-1", id);
    assert.deepEqual(plain(first.metadata), { page: 2 }, id);
    assert.ok(second.metadata === undefined || second.metadata === null, id);
    const work = await definition.details("work-1");
    assert.equal(work.workInfo.primaryTitle, `Fixture ${id}`, id);
    assert.equal(work.workInfo.mediaKind, novels.has(id) ? "lightNovel" : "manga", id);
    const installments = await definition.installments(work);
    assert.equal(installments[0].format, novels.has(id) ? "xhtml" : "imageSequence", id);
    if (novels.has(id)) {
      const publication = await definition.publicationContent({ ...installments[0], sourceWork: work });
      assert.equal(publication.mimeType, "application/xhtml+xml", id);
      assert.match(publication.text, /Fixture <em>chapter<\/em>/, id);
    } else {
      const pages = await definition.imagePages({ ...installments[0], sourceWork: work });
      assert.deepEqual(plain(pages.pages), ["https://fixture.example/1.jpg"], id);
    }

    vm.runInContext(`source[${JSON.stringify(id)}].getChapters = async () => ({ malformed: true })`, context);
    await assert.rejects(
      definition.installments(work),
      error => error?.name === "TypeError",
      `${id} accepted malformed chapters`
    );
  }
});

test("MangaFox and Mangago traverse catalog covers through first-page bytes in the packaged compatibility runtime", async () => {
  const catalog = JSON.parse(await readFile(join(monorepoRoot, "dist", "v1", "stable", "catalog.json"), "utf8"));
  const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const fixtures = [
    {
      id: "MangaFox",
      version: "1.0.0-alpha.14",
      rating: "MATURE",
      coverURL: "https://fanfox.net/fixtures/cover.png",
      pageURL: "https://fanfox.net/fixtures/page-1.png"
    },
    {
      id: "Mangago",
      version: "1.0.0-alpha.2",
      rating: "ADULT",
      coverURL: "https://www.mangago.me/fixtures/cover.png",
      pageURL: "https://www.youhim.me/cspiclink/fixtures/page-1.png"
    }
  ];

  for (const fixture of fixtures) {
    const catalogEntry = catalog.sources.find(source => source.id === fixture.id);
    assert.ok(catalogEntry, `${fixture.id} is missing from the catalog`);
    assert.equal(catalogEntry.version, fixture.version);
    assert.equal(catalogEntry.contentRating, fixture.rating);
    assert.equal(catalogEntry.compatibility?.status, "supported");
    assert.equal(catalogEntry.extension.apiVersion, "1.0");

    const runtime = await loadBundle(fixture.id, {
      generated: true,
      prepare: `
        const instance = source[${JSON.stringify(fixture.id)}];
        instance.getSortingOptions = async () => [{ id: "fixture", label: "Fixture" }];
        instance.getSearchResults = async query => ({
          items: [{
            mangaId: "fixture-work",
            title: query.title,
            imageUrl: ${JSON.stringify(fixture.coverURL)},
            contentRating: ${JSON.stringify(fixture.rating)}
          }],
          metadata: undefined
        });
        instance.getMangaDetails = async mangaId => ({
          mangaId,
          mangaInfo: {
            primaryTitle: "Fixture ${fixture.id}",
            thumbnailUrl: ${JSON.stringify(fixture.coverURL)},
            contentRating: ${JSON.stringify(fixture.rating)}
          }
        });
        instance.getChapters = async sourceManga => [{
          sourceManga,
          chapterId: "fixture-chapter",
          langCode: "en",
          chapNum: 1,
          title: "Chapter 1"
        }];
        instance.getChapterDetails = async chapter => ({
          id: chapter.chapterId,
          mangaId: chapter.sourceManga.mangaId,
          pages: [${JSON.stringify(fixture.pageURL)}]
        });
      `,
      response: input => {
        assert.ok(
          input.url === fixture.coverURL || input.url === fixture.pageURL,
          `${fixture.id} requested unexpected fixture URL ${input.url}`
        );
        return {
          url: input.url,
          status: 200,
          headers: { "content-type": "image/png" },
          mimeType: "image/png",
          cookies: [],
          dataBase64: imageBytes.toString("base64")
        };
      }
    });

    await runtime.definition.initialize();
    const catalogPage = await runtime.definition.search({ query: "Fixture" });
    assert.equal(catalogPage.items.length, 1, `${fixture.id} catalog result count`);
    assert.equal(catalogPage.items[0].coverURL, fixture.coverURL, `${fixture.id} catalog cover`);

    const cover = await runtime.definition.imagePageContent({ url: catalogPage.items[0].coverURL });
    assert.equal(cover.mimeType, "image/png", `${fixture.id} cover MIME`);
    assert.deepEqual(Buffer.from(cover.dataBase64, "base64"), imageBytes, `${fixture.id} cover bytes`);

    const work = await runtime.definition.details(catalogPage.items[0].workId);
    assert.equal(work.workInfo.primaryTitle, `Fixture ${fixture.id}`, `${fixture.id} details`);
    const installments = await runtime.definition.installments(work);
    assert.equal(installments.length, 1, `${fixture.id} installments`);
    const pages = await runtime.definition.imagePages({ ...installments[0], sourceWork: work });
    assert.deepEqual(plain(pages.pages), [fixture.pageURL], `${fixture.id} page list`);

    const firstPage = await runtime.definition.imagePageContent({ url: pages.pages[0] });
    assert.equal(firstPage.mimeType, "image/png", `${fixture.id} first-page MIME`);
    assert.deepEqual(Buffer.from(firstPage.dataBase64, "base64"), imageBytes, `${fixture.id} first-page bytes`);
    assert.deepEqual(runtime.requests.map(request => request.url), [fixture.coverURL, fixture.pageURL]);
  }
});

test("API 1.1 maps Paperback web execution through the broker", { skip: registrySkip }, async () => {
  const calls = [];
  const { context, definition } = await loadBundle("Comix", {
    apiVersion: "1.1",
    web: async request => {
      calls.push(plain(request));
      return { result: ["page-1", "page-2"], cookies: [] };
    }
  });
  assert.equal(definition.apiVersion, "1.1");
  context.__webResult = await vm.runInContext(`Application.executeInWebView({
    source: { html: "<main>chapter</main>", baseUrl: "https://comix.to/title/1", loadCSS: false, loadImages: false },
    inject: "return window.__comixResult__",
    storage: { cookies: [{ name: "approved", value: "one" }] }
  })`, context);
  assert.deepEqual(plain(context.__webResult), { result: ["page-1", "page-2"], cookies: [] });
  assert.deepEqual(calls, [{
    html: "<main>chapter</main>",
    baseURL: "https://comix.to/title/1",
    script: "return window.__comixResult__",
    loadCSS: false,
    loadImages: false,
    cookies: [{ name: "approved", value: "one" }]
  }]);
});

test("MangaFox executes its indirect eval chapter parser through the compatibility runtime", { skip: registrySkip }, async () => {
  const packedChapterScript = "(function(p,a,c,k,e,d){var newImgs=['//fanfox.net/images/fixture-1.jpg','//fanfox.net/images/fixture-2.jpg']})";
  const chapterHTML = `<!doctype html><html><body>
    <script src="/scripts/chapter_bar.js"></script>
    <script>${packedChapterScript}</script>
  </body></html>`;
  const runtime = await loadBundle("MangaFox", {
    prepare: `
      const instance = source.MangaFox;
      instance.getMangaDetails = async mangaId => ({
        mangaId,
        mangaInfo: { primaryTitle: "Fixture MangaFox", contentRating: "MATURE" }
      });
      instance.getChapters = async sourceManga => [{
        sourceManga,
        chapterId: "c001",
        langCode: "en",
        chapNum: 1
      }];
    `,
    response: input => ({
      url: input.url,
      status: 200,
      headers: { "content-type": "text/html" },
      mimeType: "text/html",
      cookies: [],
      dataBase64: base64(chapterHTML)
    })
  });

  await runtime.definition.initialize();
  const work = await runtime.definition.details("fixture-manga");
  const [installment] = await runtime.definition.installments(work);
  const pages = await runtime.definition.imagePages({ ...installment, sourceWork: work });

  assert.deepEqual(plain(pages.pages), [
    "https://fanfox.net/images/fixture-1.jpg",
    "https://fanfox.net/images/fixture-2.jpg"
  ]);
  assert.deepEqual(runtime.requests.map(request => request.url), [
    "https://fanfox.net/manga/fixture-manga/c001"
  ]);
});

test("Mangago executes aliased Function image-key processing through the compatibility runtime", { skip: registrySkip }, async () => {
  const keyHex = "00112233445566778899aabbccddeeff";
  const ivHex = "ffeeddccbbaa99887766554433221100";
  const descrambleKey = "0a1a2a3";
  const deobfuscatedChapterJS = [
    `var key = CryptoJS.enc.Hex.parse("${keyHex}");`,
    `var iv = CryptoJS.enc.Hex.parse("${ivHex}");`,
    "var widthnum = heightnum = 2;",
    `/* ${"fixture-padding-".repeat(90)} */`,
    "var renImg = function(img,width,height,id){",
    `var key = "${descrambleKey}";`,
    "key = key.split('a');",
    "};"
  ].join("\n");
  const chapterJS = encodeSojsonV4Fixture(deobfuscatedChapterJS);
  const imageURL = "https://www.youhim.me/cspiclink/fixture.jpg";
  const imgsrcs = encryptZeroPaddedAES(imageURL, keyHex, ivHex);
  const readerHTML = `<!doctype html><html><body>
    <script>var imgsrcs = "${imgsrcs}";</script>
    <script src="/assets/chapter.js?v=fixture"></script>
  </body></html>`;
  let functionConstructorCalls = 0;
  const trackedFunction = (...args) => {
    functionConstructorCalls += 1;
    return Function(...args);
  };
  const runtime = await loadBundle("Mangago", {
    globals: { crypto: globalThis.crypto, Function: trackedFunction },
    prepare: `
      const instance = source.Mangago;
      instance.getMangaDetails = async mangaId => ({
        mangaId,
        mangaInfo: { primaryTitle: "Fixture Mangago", contentRating: "ADULT" }
      });
      instance.getChapters = async sourceManga => [{
        sourceManga,
        chapterId: "/read-manga/fixture/chapter-1/",
        langCode: "en",
        chapNum: 1
      }];
    `,
    response: input => {
      const body = input.url.includes("chapter.js") ? chapterJS : readerHTML;
      return {
        url: input.url,
        status: 200,
        headers: { "content-type": "text/html" },
        mimeType: "text/html",
        cookies: [],
        dataBase64: base64(body)
      };
    }
  });

  await runtime.definition.initialize();
  const work = await runtime.definition.details("/manga/fixture");
  const [installment] = await runtime.definition.installments(work);
  const pages = await runtime.definition.imagePages({ ...installment, sourceWork: work });

  assert.deepEqual(plain(pages.pages), [
    `${imageURL}#desckey=${encodeURIComponent(descrambleKey)}&cols=2`
  ]);
  assert.equal(functionConstructorCalls, 1);
  assert.deepEqual(runtime.requests.map(request => new URL(request.url).pathname), [
    "/read-manga/fixture/chapter-1/",
    "/assets/chapter.js"
  ]);
});

test("API 1.1 maps novel chapters to sanitized XHTML publication content", { skip: registrySkip }, async () => {
  const { definition } = await loadBundle("LNori", {
    apiVersion: "1.1",
    prepare: `
      const instance = source.LNori;
      instance.getMangaDetails = async mangaId => ({ mangaId, mangaInfo: {
        primaryTitle: "Mock Novel", synopsis: "Novel text", contentType: "novel", contentRating: "SAFE"
      }});
      instance.getChapters = async sourceManga => [{
        sourceManga, chapterId: "chapter-1", langCode: "en", chapNum: 1, title: "Arrival"
      }];
      instance.getChapterDetails = async chapter => ({
        id: chapter.chapterId,
        mangaId: chapter.sourceManga.mangaId,
        type: "html",
        html: '<article onclick="steal()"><h1>Arrival</h1><script>alert(1)</script><p>Safe <em>text</em>.</p><iframe src="https://evil.invalid/"></iframe><a href="https://evil.invalid/">remote</a></article>'
      });
    `
  });
  const work = await definition.details("novel-1");
  assert.equal(work.workInfo.mediaKind, "lightNovel");
  const installments = await definition.installments(work);
  assert.equal(installments[0].format, "xhtml");
  const publication = await definition.publicationContent({ ...installments[0], sourceWork: work });
  assert.equal(publication.mimeType, "application/xhtml+xml");
  assert.match(publication.text, /<h1>Arrival<\/h1>/);
  assert.match(publication.text, /Safe <em>text<\/em>/);
  assert.doesNotMatch(publication.text, /script|iframe|onclick|evil\.invalid/i);
});

test("Paperback Cloudflare errors become manko challenge errors exactly once", { skip: registrySkip }, async () => {
  const allPornComic = await loadBundle("AllPornComic", {
    response: input => ({
      url: input.url,
      status: 403,
      headers: { "cf-mitigated": "challenge", "content-type": "text/html" },
      mimeType: "text/html",
      cookies: [],
      dataBase64: base64("challenge")
    })
  });
  await allPornComic.definition.initialize();
  await assert.rejects(
    allPornComic.definition.imagePageContent({ url: "https://allporncomic.com/challenge.jpg" }),
    error => {
      assert.equal(error.name, "ChallengeRequiredError");
      assert.equal(error.type, "challengeRequired");
      assert.equal(error.url, "https://allporncomic.com");
      return true;
    }
  );
  assert.deepEqual(allPornComic.challenges, ["https://allporncomic.com"]);

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
