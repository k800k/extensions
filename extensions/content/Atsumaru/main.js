/*!
 * Atsumaru for MangaReader
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Audited upstream snapshot: https://github.com/inkdex/general-extensions
 * Audited snapshot commit: b03d78c35dfb0ad305660dd3aa8618a006cbd73f
 * Audited snapshot path: src/Atsumaru
 * Snapshot relationship: not recorded by the registry as this artifact's build input
 * Registry artifact: 5514d0bc58cb8edcee06c1c01458c51a7fd43e43/Atsumaru/index.js
 * Adapter: MangaReader Paperback compatibility bridge v1.1
 */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 MangaReader Extension Contributors */
/*
 * Compatibility bridge for GPL-licensed Paperback 0.9 extension bundles.
 * This file is concatenated before the unmodified upstream bundle and adapts
 * the public Paperback Application/Extension surface to MangaReader API v1.
 */
(() => {
  "use strict";

  const context = globalThis.MangaReader?.context;
  if (!context) throw new Error("MangaReader Extension API v1 is unavailable");

  const selectors = new Map();
  const interceptors = new Map();
  const secureKeys = new Set();
  const translatedChallenge = Symbol("paperbackTranslatedChallenge");
  let selectorSequence = 0;
  let redirectHandler = null;

  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const isChallengeError = error => {
    if (error?.[translatedChallenge]) return true;
    const type = String(error?.type ?? "").toLowerCase();
    const name = String(error?.name ?? "").toLowerCase();
    return type === "cloudflareerror"
      || type === "challengeerror"
      || type === "challengerequired"
      || name === "cloudflareerror"
      || name === "challengeerror"
      || name === "challengerequirederror"
      || Boolean(error?.resolutionRequest?.url);
  };
  const challengeURL = error => {
    const resolutionRequest = error?.resolutionRequest;
    const value = error?.url
      ?? (typeof resolutionRequest === "string" ? resolutionRequest : resolutionRequest?.url)
      ?? error?.request?.url;
    return value === undefined || value === null || value === "" ? undefined : String(value);
  };
  const normalizeOperationError = error => {
    if (!isChallengeError(error) || error?.[translatedChallenge]) return error;
    const url = challengeURL(error);
    const normalized = new Error(error?.message || "Cloudflare verification is required");
    normalized.name = "ChallengeRequiredError";
    normalized.type = "challengeRequired";
    if (url !== undefined) normalized.url = url;
    Object.defineProperty(normalized, translatedChallenge, { value: true });
    try { context.challenge?.request?.(url ?? null); } catch (_) {}
    return normalized;
  };
  const adaptOperation = operation => async (...args) => {
    try { return await operation(...args); }
    catch (error) { throw normalizeOperationError(error); }
  };
  const adaptDefinition = definition => Object.fromEntries(
    Object.entries(definition).map(([key, value]) => [key, typeof value === "function" ? adaptOperation(value) : value])
  );
  const reviveCookie = value => {
    const cookie = clone(value);
    if (!cookie || typeof cookie !== "object" || cookie.expires === undefined || cookie.expires === null) return cookie;
    const expires = new Date(cookie.expires);
    if (Number.isNaN(expires.valueOf())) delete cookie.expires;
    else cookie.expires = expires;
    return cookie;
  };
  const reviveCookies = value => Array.isArray(value) ? value.map(reviveCookie) : [];
  const reviveState = (key, value) => key === "cookie_store_cookies" ? reviveCookies(value) : clone(value);
  const bytesOf = value => {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (typeof value === "string") return new TextEncoder().encode(value);
    return new TextEncoder().encode(JSON.stringify(value ?? null));
  };
  const arrayBufferOf = value => {
    const bytes = bytesOf(value);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  };
  const encodeBase64 = value => {
    const bytes = bytesOf(value);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  };
  const decodeBase64 = value => {
    let bytes;
    if (typeof value === "string") {
      const unpadded = value.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
      const encoded = unpadded + "=".repeat((4 - (unpadded.length % 4)) % 4);
      const binary = atob(encoded);
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value);
    } else {
      throw new Error("Unable to convert base64 String to decoded Data");
    }

    const decoded = new TextDecoder("utf-8").decode(bytes);
    const reencoded = new TextEncoder().encode(decoded);
    const isUTF8 = reencoded.length === bytes.length
      && reencoded.every((byte, index) => byte === bytes[index]);
    return isUTF8 ? decoded : arrayBufferOf(bytes);
  };
  const callable = selector => {
    if (typeof selector === "function") return selector;
    const result = selectors.get(String(selector));
    if (!result) throw new Error(`Unknown Paperback selector: ${String(selector)}`);
    return result;
  };

  // Synchronous MD5 is part of Paperback's Application contract. This compact
  // implementation accepts UTF-8 strings or buffers and returns lowercase hex.
  const md5 = input => {
    const source = bytesOf(input);
    const length = source.length;
    const paddedLength = (((length + 8) >>> 6) + 1) * 64;
    const bytes = new Uint8Array(paddedLength);
    bytes.set(source);
    bytes[length] = 0x80;
    const bitLength = length * 8;
    const view = new DataView(bytes.buffer);
    view.setUint32(paddedLength - 8, bitLength >>> 0, true);
    view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);
    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const shifts = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);
    const rotate = (value, amount) => ((value << amount) | (value >>> (32 - amount))) >>> 0;
    for (let offset = 0; offset < paddedLength; offset += 64) {
      const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));
      let a = a0, b = b0, c = c0, d = d0;
      for (let index = 0; index < 64; index++) {
        let f, wordIndex;
        if (index < 16) { f = (b & c) | (~b & d); wordIndex = index; }
        else if (index < 32) { f = (d & b) | (~d & c); wordIndex = (5 * index + 1) % 16; }
        else if (index < 48) { f = b ^ c ^ d; wordIndex = (3 * index + 5) % 16; }
        else { f = c ^ (b | ~d); wordIndex = (7 * index) % 16; }
        const nextD = d;
        d = c;
        c = b;
        b = (b + rotate((a + f + constants[index] + words[wordIndex]) >>> 0, shifts[index])) >>> 0;
        a = nextD;
      }
      a0 = (a0 + a) >>> 0;
      b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0;
      d0 = (d0 + d) >>> 0;
    }
    return [a0,b0,c0,d0].map(word => [0,8,16,24].map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
  };

  const decodeEntities = value => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value);
    return textarea.value;
  };

  // Paperback exposes HTMLCanvasElement as a constructible polyfill. WebKit's
  // native interface is not directly constructible, so retain browser canvas
  // behavior while matching the Paperback call shape used by Comix.
  const PaperbackCanvas = function () { return document.createElement("canvas"); };
  try {
    Object.defineProperty(globalThis, "HTMLCanvasElement", {
      value: PaperbackCanvas,
      writable: false,
      configurable: false
    });
  } catch (_) {}

  const scheduleRequest = adaptOperation(async input => {
    let request = clone(input ?? {});
    request.url = String(request.url ?? "");
    for (const interceptor of interceptors.values()) {
      if (interceptor.request) request = await callable(interceptor.request)(request) ?? request;
    }
    const native = await context.http.request({
      url: String(request.url),
      method: String(request.method ?? "GET"),
      headers: clone(request.headers ?? {}),
      cookies: clone(request.cookies ?? {}),
      body: request.body ?? null
    });
    const response = {
      url: native.url,
      status: Number(native.status),
      headers: Object.fromEntries(Object.entries(native.headers ?? {}).flatMap(([key, value]) => [[key, value], [key.toLowerCase(), value]])),
      mimeType: native.mimeType ?? null,
      cookies: reviveCookies(native.cookies ?? [])
    };
    let data = decodeBase64(native.dataBase64 ?? "");
    for (const interceptor of [...interceptors.values()].reverse()) {
      if (!interceptor.response) continue;
      const transformed = await callable(interceptor.response)(request, response, data);
      if (transformed instanceof ArrayBuffer || ArrayBuffer.isView(transformed)) data = arrayBufferOf(transformed);
    }
    if (redirectHandler && native.url && native.url !== request.url) {
      await callable(redirectHandler)(request.url, native.url);
    }
    return [response, data];
  });

  const Application = Object.freeze({
    isResourceLimited: false,
    Selector(target, method) {
      if (!target || typeof target[method] !== "function") throw new Error(`Invalid Paperback selector method: ${String(method)}`);
      const id = `selector-${++selectorSequence}`;
      selectors.set(id, target[method].bind(target));
      return id;
    },
    SelectorRegistry: Object.freeze({ selector: callable }),
    registerInterceptor(id, request, response) { interceptors.set(String(id), { request, response }); },
    unregisterInterceptor(id) { interceptors.delete(String(id)); },
    scheduleRequest,
    getState(key) {
      const normalizedKey = String(key);
      return reviveState(normalizedKey, context.state.get(normalizedKey));
    },
    setState(value, key) { value === undefined ? context.state.remove(String(key)) : context.state.set(String(key), clone(value)); },
    getSecureState(key) {
      const normalizedKey = String(key);
      secureKeys.add(normalizedKey);
      return reviveState(normalizedKey, context.secureState.get(normalizedKey));
    },
    setSecureState(value, key) {
      secureKeys.add(String(key));
      value === undefined ? context.secureState.remove(String(key)) : context.secureState.set(String(key), clone(value));
    },
    resetAllState() {
      context.state.reset();
      for (const key of secureKeys) context.secureState.remove(key);
      secureKeys.clear();
    },
    arrayBufferToUTF8String(value) { return new TextDecoder().decode(bytesOf(value)); },
    arrayBufferToASCIIString(value) { return [...bytesOf(value)].map(byte => String.fromCharCode(byte & 0x7f)).join(""); },
    base64Encode: encodeBase64,
    base64Decode: decodeBase64,
    crypto_md5Hash: md5,
    decodeHTMLEntities: decodeEntities,
    getDefaultUserAgent() { return Promise.resolve("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"); },
    sleep(seconds) { return context.rateLimit.sleep(Math.max(0, Number(seconds) * 1000)); },
    formDidChange() {},
    invalidateDiscoverSections() {},
    setRedirectHandler(selector) { redirectHandler = selector ?? null; },
    async executeInWebView(input) {
      if (!context.web?.execute) {
        throw new Error("This source requires MangaReader API 1.1 webExecution permission");
      }
      const source = input?.source ?? {};
      return context.web.execute({
        html: string(source.html),
        baseURL: string(source.baseUrl ?? source.baseURL),
        script: string(input?.inject, "return null"),
        userAgent: source.userAgent === undefined ? undefined : string(source.userAgent),
        loadCSS: source.loadCSS !== false,
        loadImages: source.loadImages !== false,
        cookies: clone(input?.storage?.cookies ?? [])
      });
    }
  });
  Object.defineProperty(globalThis, "Application", { value: Application, writable: false, configurable: false });

  const string = (value, fallback = "") => value === undefined || value === null ? fallback : String(value);
  const number = value => {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  };
  const optionalNumber = value => value === undefined || value === null || !Number.isFinite(Number(value)) ? undefined : Number(value);
  const isoDate = value => {
    if (value === undefined || value === null || value === "") return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
  };
  // MangaReader decodes domain-model Date fields with Swift Codable's default
  // reference date (2001-01-01), while installment dates deliberately use ISO.
  const codableDate = value => {
    if (value === undefined || value === null || value === "") return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.valueOf()) ? undefined : date.valueOf() / 1000 - 978307200;
  };
  const rating = value => ["SAFE", "MATURE", "ADULT"].includes(value) ? value : "SAFE";
  const compact = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
  const mangaInfoFromWork = work => {
    const info = work?.workInfo ?? {};
    return {
      thumbnailUrl: string(info.thumbnailUrl),
      synopsis: string(info.synopsis),
      primaryTitle: string(info.primaryTitle, string(work?.workId)),
      secondaryTitles: Array.isArray(info.secondaryTitles) ? info.secondaryTitles.map(String) : [],
      contentRating: rating(info.contentRating),
      status: info.status,
      artist: info.artist,
      author: info.author,
      shareUrl: info.shareUrl,
      contentType: info.mediaKind === "lightNovel" || info.mediaKind === "book" ? "novel" : info.contentType
    };
  };
  const sourceMangaFromWork = work => ({ mangaId: string(work?.workId), mangaInfo: mangaInfoFromWork(work) });
  const workFromSourceManga = (manga, fallbackMediaKind = "manga") => {
    const info = manga?.mangaInfo ?? {};
    return {
      workId: string(manga?.mangaId),
      workInfo: compact({
        thumbnailUrl: string(info.thumbnailUrl),
        synopsis: string(info.synopsis),
        primaryTitle: string(info.primaryTitle, string(manga?.mangaId)),
        secondaryTitles: Array.isArray(info.secondaryTitles) ? info.secondaryTitles.map(String) : [],
        contentRating: rating(info.contentRating),
        status: info.status,
        artist: info.artist,
        author: info.author,
        shareUrl: info.shareUrl,
        mediaKind: info.contentType === "novel" ? "lightNovel" : fallbackMediaKind
      })
    };
  };
  const mapSearchItem = (item, kind = "manga") => compact({
    workId: string(item?.mangaId ?? item?.id),
    id: string(item?.mangaId ?? item?.id),
    title: string(item?.title, "Untitled"),
    subtitle: item?.subtitle,
    imageUrl: string(item?.imageUrl ?? item?.coverURL),
    coverURL: item?.imageUrl ?? item?.coverURL ?? undefined,
    contentRating: item?.contentRating ? rating(item.contentRating) : undefined,
    mediaKind: kind
  });
  const mapDiscoverItem = item => compact({
    type: string(item?.type, "item"),
    workId: item?.mangaId === undefined ? undefined : string(item.mangaId),
    imageUrl: item?.imageUrl,
    title: item?.title ?? item?.name,
    subtitle: item?.subtitle,
    contentRating: item?.contentRating ? rating(item.contentRating) : undefined
  });
  const sortingOption = async (instance, query) => {
    if (typeof instance.getSortingOptions !== "function") return undefined;
    const options = await instance.getSortingOptions(query);
    return Array.isArray(options) ? options[0] : undefined;
  };
  const formSchema = async (instance, method, id, title, query) => {
    if (typeof instance[method] !== "function") return { id, title, fields: [] };
    try {
      const form = await instance[method](query);
      const sections = typeof form?.getSections === "function" ? await form.getSections() : [];
      const fields = [];
      for (const section of Array.isArray(sections) ? sections : []) {
        for (const row of Array.isArray(section?.items) ? section.items : []) {
          const type = string(row?.type);
          let kind;
          if (type === "inputRow") kind = row.isSecure ? "secureText" : "text";
          else if (type === "toggleRow") kind = "toggle";
          else if (type === "buttonRow" || type === "oauthButtonRow") kind = "button";
          else if (type === "navigationRow") kind = "selection";
          else continue;
          fields.push(compact({
            id: string(row.id, `${id}-${fields.length}`),
            kind,
            title: string(row.title, string(section?.header, "Option")),
            subtitle: row.subtitle,
            placeholder: row.placeholder,
            options: [],
            minimum: undefined,
            maximum: undefined,
            step: undefined,
            destination: row.url,
            isRequired: Boolean(row.isRequired)
          }));
        }
      }
      return { id, title: string(form?.title, title), fields };
    } catch (error) {
      if (isChallengeError(error)) throw normalizeOperationError(error);
      return { id, title, fields: [] };
    }
  };
  const resource = async url => {
    const [response, data] = await scheduleRequest({ url, method: "GET", headers: {} });
    return { dataBase64: encodeBase64(data), mimeType: response.mimeType ?? response.headers?.["content-type"] ?? undefined };
  };

  const sanitizedXHTML = value => {
    let html = string(value).trim();
    if (!html) throw new Error("Paperback returned an empty XHTML chapter");
    html = html
      .replace(/<(script|style|iframe|frame|frameset|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<(script|style|iframe|frame|frameset|object|embed|form|link)\b[^>]*\/?\s*>/gi, "")
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+(?:src|href|poster|action)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript\s*:/gi, "");
    if (!/<html\b/i.test(html)) {
      html = `<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>${html}</body></html>`;
    }
    return html;
  };

  const sourceCursor = metadata => {
    if (metadata === undefined || metadata === null) return undefined;
    const value = JSON.stringify(metadata);
    return value === undefined ? undefined : { value, metadata: {} };
  };
  const paperbackCursor = cursor => {
    if (!cursor || typeof cursor !== "object" || typeof cursor.value !== "string") return cursor;
    try { return JSON.parse(cursor.value); }
    catch (_) { return cursor; }
  };
  const integer = value => value === undefined || value === null || value === ""
    ? undefined
    : Number.isInteger(Number(value)) ? Number(value) : undefined;
  const latestUpdates = async (instance, { cursor } = {}) => {
    if (typeof instance.getLatestUpdates !== "function") return { items: [] };
    // Paperback's latest-update providers do not accept a date boundary. Keep
    // MangaReader's `since` argument advisory and preserve only upstream data.
    const result = await instance.getLatestUpdates(undefined, paperbackCursor(cursor) ?? undefined);
    const items = [];
    for (const item of result?.items ?? []) {
      const remoteWorkID = item?.mangaId ?? item?.id;
      if (remoteWorkID === undefined || remoteWorkID === null || String(remoteWorkID) === "") continue;
      const id = item?.id ?? remoteWorkID;
      items.push(compact({
        id: string(id),
        remoteWorkID: string(remoteWorkID),
        changedAt: codableDate(item?.changedAt ?? item?.publishDate ?? item?.updatedAt)
      }));
    }
    return compact({
      items,
      nextCursor: sourceCursor(result?.metadata),
      nextPage: integer(result?.nextPage),
      totalCount: integer(result?.totalCount)
    });
  };
  const canReadManagedCollections = instance => typeof instance.getManagedLibraryCollections === "function"
    && typeof instance.getSourceMangaInManagedCollection === "function";
  const canWriteManagedCollections = instance => canReadManagedCollections(instance)
    && typeof instance.commitManagedCollectionChanges === "function"
    && typeof instance.getMangaDetails === "function";
  const managedCollections = async instance => {
    if (!canReadManagedCollections(instance)) return { items: [] };
    const collections = await instance.getManagedLibraryCollections();
    const items = [];
    for (const collection of collections ?? []) {
      if (collection?.id === undefined || collection?.id === null) continue;
      const sourceMangas = await instance.getSourceMangaInManagedCollection(collection);
      const workRemoteIDs = [];
      const seen = new Set();
      for (const manga of sourceMangas ?? []) {
        if (manga?.mangaId === undefined || manga?.mangaId === null) continue;
        const remoteID = string(manga.mangaId);
        if (!remoteID || seen.has(remoteID)) continue;
        seen.add(remoteID);
        workRemoteIDs.push(remoteID);
      }
      items.push(compact({
        id: string(collection.id),
        title: string(collection.title, string(collection.id)),
        workRemoteIDs,
        modifiedAt: codableDate(collection.modifiedAt)
      }));
    }
    return { items, totalCount: items.length };
  };
  const synchronizeManagedCollection = async (instance, collection) => {
    if (!canWriteManagedCollections(instance)) throw new Error("Paperback source does not support managed collection synchronization");
    if (!Array.isArray(collection?.workRemoteIDs)) throw new Error("Managed collection workRemoteIDs are required");
    const collections = await instance.getManagedLibraryCollections();
    const upstreamCollection = (collections ?? []).find(item => string(item?.id) === string(collection.id));
    if (!upstreamCollection) throw new Error(`Unknown Paperback managed collection: ${string(collection?.id)}`);

    const currentMangas = await instance.getSourceMangaInManagedCollection(upstreamCollection) ?? [];
    const currentByID = new Map();
    for (const manga of currentMangas) {
      if (manga?.mangaId !== undefined && manga?.mangaId !== null) currentByID.set(string(manga.mangaId), manga);
    }
    const desiredIDs = [...new Set(collection.workRemoteIDs.map(string).filter(Boolean))];
    const desired = new Set(desiredIDs);
    const additionIDs = desiredIDs.filter(remoteID => !currentByID.has(remoteID));
    const deletions = [...currentByID].filter(([remoteID]) => !desired.has(remoteID)).map(([, manga]) => manga);
    const additions = await Promise.all(additionIDs.map(async remoteID => {
      const manga = await instance.getMangaDetails(remoteID);
      if (!manga || manga.mangaId === undefined || manga.mangaId === null) {
        throw new Error(`Paperback returned no manga for managed collection item ${remoteID}`);
      }
      return manga;
    }));
    if (additions.length || deletions.length) {
      await instance.commitManagedCollectionChanges({ collection: upstreamCollection, additions, deletions });
    }
    return null;
  };

  const registerContent = (id, instance, options = {}) => {
    if (!instance) throw new Error(`Paperback bundle did not export ${id}`);
    const apiVersion = options.apiVersion === "1.1" ? "1.1" : "1.0";
    const mediaKind = options.mediaKind === "lightNovel" ? "lightNovel" : "manga";
    const paperbackChapter = (installment, sourceWork) => compact({
      chapterId: string(installment?.installmentId),
      langCode: string(installment?.langCode, "unknown"),
      chapNum: number(installment?.number),
      title: installment?.title,
      volume: optionalNumber(installment?.volume),
      publishDate: installment?.publishDate ? new Date(installment.publishDate) : undefined,
      sourceManga: sourceMangaFromWork(sourceWork)
    });
    defineContentExtension(adaptDefinition({
      id,
      apiVersion,
      initialize: async () => { if (typeof instance.initialise === "function") await instance.initialise(); },
      settings: () => formSchema(instance, "getSettingsForm", "settings", id),
      discoverSections: async () => {
        const sections = await instance.getDiscoverSections();
        return (sections ?? []).map(section => compact({ id: string(section.id), title: string(section.title), subtitle: section.subtitle, type: number(section.type) }));
      },
      discover: async ({ section, cursor }) => {
        const result = await instance.getDiscoverSectionItems(section, cursor ?? undefined);
        return { items: (result?.items ?? []).map(mapDiscoverItem), metadata: result?.metadata ?? null };
      },
      searchFilters: () => formSchema(instance, "getAdvancedSearchForm", "search", "Search", { title: "", metadata: {} }),
      search: async ({ query, cursor }) => {
        const searchQuery = { title: string(query), metadata: {} };
        const result = await instance.getSearchResults(searchQuery, cursor ?? undefined, await sortingOption(instance, searchQuery));
        return { items: (result?.items ?? []).map(item => mapSearchItem(item, mediaKind)), metadata: result?.metadata ?? null };
      },
      details: async workID => workFromSourceManga(await instance.getMangaDetails(string(workID)), mediaKind),
      installments: async sourceWork => {
        const chapters = await instance.getChapters(sourceMangaFromWork(sourceWork));
        const format = sourceWork?.workInfo?.mediaKind === "lightNovel" || sourceWork?.workInfo?.mediaKind === "book"
          ? "xhtml"
          : "imageSequence";
        return (chapters ?? []).map(chapter => compact({
          installmentId: string(chapter.chapterId),
          workId: string(sourceWork?.workId),
          langCode: string(chapter.langCode, "unknown"),
          number: number(chapter.chapNum),
          title: chapter.title,
          volume: optionalNumber(chapter.volume),
          publishDate: isoDate(chapter.publishDate),
          format
        }));
      },
      imagePages: async installment => {
        const sourceWork = installment?.sourceWork ?? { workId: installment?.workId, workInfo: {} };
        const chapter = paperbackChapter(installment, sourceWork);
        const details = await instance.getChapterDetails(chapter);
        return {
          id: string(details?.id, string(installment?.installmentId)),
          workId: string(details?.mangaId, string(sourceWork?.workId)),
          pages: (details?.pages ?? []).map(page => string(page?.url ?? page)).filter(Boolean)
        };
      },
      imagePageContent: ({ url }) => resource(url),
      ...(apiVersion === "1.1" ? {
        publicationContent: async installment => {
          const sourceWork = installment?.sourceWork ?? { workId: installment?.workId, workInfo: {} };
          const details = await instance.getChapterDetails(paperbackChapter(installment, sourceWork));
          if (details?.type !== "html" || typeof details?.html !== "string") {
            throw new Error("Paperback source did not return an XHTML chapter");
          }
          return {
            id: string(details.id, string(installment?.installmentId)),
            workId: string(details.mangaId, string(sourceWork?.workId)),
            mimeType: "application/xhtml+xml",
            text: sanitizedXHTML(details.html)
          };
        }
      } : {}),
      updates: args => latestUpdates(instance, args),
      managedCollections: () => managedCollections(instance),
      ...(canWriteManagedCollections(instance) ? {
        synchronizeManagedCollection: collection => synchronizeManagedCollection(instance, collection)
      } : {})
    }));
  };

  Object.defineProperty(globalThis, "PaperbackCompat", {
    value: Object.freeze({ registerContent, scheduleRequest, md5 }),
    writable: false,
    configurable: false
  });
})();

/* Unmodified compiled InkDex/Paperback bundle follows. */
var source=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});function t(e){"@babel/helpers - typeof";return t=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},t(e)}function n(e,n){if(t(e)!=`object`||!e)return e;var r=e[Symbol.toPrimitive];if(r!==void 0){var i=r.call(e,n||`default`);if(t(i)!=`object`)return i;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(n===`string`?String:Number)(e)}function r(e){var r=n(e,`string`);return t(r)==`symbol`?r:r+``}function i(e,t,n){return(t=r(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var a=class{constructor(){i(this,`requiresExplicitSubmission`,!1)}reloadForm(){let e=this.__underlying_formId;e&&Application.formDidChange(e)}};function o(e,t,n){return e[`__closure_selector-`+t]=n,Application.Selector(e,`__closure_selector-`+t)}function s(e,t){let n;return n=typeof e==`string`?{id:e}:e,{type:`listSection`,...n,items:t.filter(e=>e),allowAddition:!1,allowDeletion:!1,allowReorder:!1}}function c(e,t){let n;return n=typeof e==`string`?{id:e}:e,{type:`flowSection`,...n,items:t.filter(e=>e)}}function l(e,t){if(t.maxItemCount<1)throw Error(`[${t.id}] maxItemCount must not be less than one`);if(t.minItemCount<0)throw Error(`[${t.id}] minItemCount must not be less than zero`);if(t.minItemCount>=t.maxItemCount&&t.maxItemCount>1)throw Error(`[${t.id}] minItemCount must be less than maxItemCount, or both must be one`);if(t.value.length<t.minItemCount)throw Error(`[${t.id}] value count must not be less than minItemCount`);if(!t.value.every(e=>t.items.some(t=>t.id===e)))throw Error(`[${t.id}] All provided values must be inside items`);let n=Object.keys(t.value).length;return(t.layout==`flow`?c:s)({id:t.id,header:t.header,footer:t.footer},t.items.map(r=>{let i=t.value.indexOf(r.id),a=i!==-1;return d(r.id,{title:r.title,value:a?{symbol:`checkmark`,style:`success`}:void 0,onSelect:o(e,`__select_${t.id}#${r.id}`,async()=>{if(a)n>t.minItemCount&&t.value.splice(i,1);else if(t.maxItemCount==1)t.value.splice(0,t.value.length,r.id);else if(n<t.maxItemCount)t.value.push(r.id);else return;t.onValueChange&&await Application.SelectorRegistry.selector(t.onValueChange)(),e.reloadForm()})})}))}function u(e,t){let n=Object.keys(t.value).length;return(t.layout==`flow`?c:s)({id:t.id,header:t.header,footer:t.footer},t.items.map(r=>{let i=t.value[r.id],a,s;switch(i){case`included`:t.layout==`flow`?(s=`success`,a=void 0):(s=void 0,a={symbol:`checkmark`,style:`success`});break;case`excluded`:t.layout==`flow`?(s=`error`,a=void 0):(s=void 0,a={symbol:`xmark`,style:`error`});break;default:a=void 0,s=void 0;break}return d(r.id,{style:s,title:r.title,value:a,onSelect:o(e,`__multiselect_${t.id}#${r.id}`,async()=>{let a,o=!t.maximum||n<t.maximum,s=t.allowEmptySelection&&n==1||n>1;switch(i){case`included`:if(t.allowExclusion){a=`excluded`;break}if(s){a=void 0;break}else return;case`excluded`:if(s){a=void 0;break}else return;case void 0:if(o){a=`included`;break}else return}a==null?delete t.value[r.id]:t.value[r.id]=a,t.onValueChange&&await Application.SelectorRegistry.selector(t.onValueChange)(),e.reloadForm()})})}))}function d(e,t){return{...t,id:e,type:`labelRow`,isHidden:t.isHidden??!1,isSelectable:t.onSelect!=null}}function f(e,t){return{...t,id:e,type:`inputRow`,isHidden:t.isHidden??!1}}function p(e,t){return{...t,id:e,type:`toggleRow`,isHidden:t.isHidden??!1}}function m(e,t){return h(e,{form:new g(t.title,t),title:t.title,subtitle:t.subtitle,value:`${Object.keys(t.value).length} items`,isHidden:t.isHidden})}function h(e,t){return{...t,id:e,type:`navigationRow`,isHidden:t.isHidden??!1}}var g=class extends a{constructor(e,t){super(),i(this,`title`,void 0),i(this,`params`,void 0),i(this,`states`,{}),i(this,`requiresExplicitSubmission`,!0),this.title=e,this.params=t,this.states={...t.value}}getSections(){return[u(this,{id:`multiselect`,value:this.states,items:this.params.items,allowExclusion:this.params.allowExclusion,allowEmptySelection:this.params.allowEmptySelection,maximum:this.params.maximum,layout:this.params.layout})]}async formDidSubmit(){await Application.SelectorRegistry.selector(this.params.onValueChange)(this.states)}},ee=class extends a{constructor(...e){super(...e),i(this,`requiresExplicitSubmission`,!0)}async formDidSubmit(){}formDidCancel(){}},_=class{constructor(e){i(this,`id`,void 0),this.id=e}registerInterceptor(){Application.registerInterceptor(this.id,Application.Selector(this,`interceptRequest`),Application.Selector(this,`interceptResponse`))}unregisterInterceptor(){Application.unregisterInterceptor(this.id)}};let v={},y={},b=async e=>{if(v[e]){await v[e],await b(e);return}v[e]=new Promise(t=>y[e]=()=>{delete v[e],t()})},x=e=>{y[e]&&y[e]()};var S=class extends _{constructor(e,t){super(e),i(this,`options`,void 0),i(this,`promise`,void 0),i(this,`currentRequestsMade`,0),i(this,`lastReset`,Date.now()),i(this,`imageRegex`,new RegExp(/\.(avif|gif|jpeg|jpg|jxl|png|webp)(\?|$)/i)),this.options=t}async interceptRequest(e){return this.options.ignoreImages&&this.imageRegex.test(e.url)?e:(await b(this.id),await this.incrementRequestCount(),x(this.id),e)}async interceptResponse(e,t,n){return n}async incrementRequestCount(){if(await this.promise,(Date.now()-this.lastReset)/1e3>this.options.bufferInterval&&(this.currentRequestsMade=0,this.lastReset=Date.now()),this.currentRequestsMade+=1,this.currentRequestsMade>=this.options.numberOfRequests){let e=(Date.now()-this.lastReset)/1e3;if(e<=this.options.bufferInterval){let t=this.options.bufferInterval-e;console.log(`[BasicRateLimiter] rate limit hit, sleeping for ${t}`),this.promise=Application.sleep(t)}}}},C=class extends Error{constructor(e,t=`Cloudflare bypass is required`){super(t),i(this,`resolutionRequest`,void 0),i(this,`type`,`cloudflareError`),this.resolutionRequest=e}};function w(e){let t={},n=e.match(/^(?:([a-zA-Z][a-zA-Z\d+\-.]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);if(!n)throw Error(`Invalid URL string provided.`);if(n[1]!==void 0&&n[1]!==``&&(t.protocol=n[1]),n[2]!==void 0&&n[2]!==``){let e=n[2],r=``,i=``,a=e.indexOf(`@`);if(a!==-1){if(r=e.substring(0,a),i=e.substring(a+1),r!==``){let e=r.indexOf(`:`);e===-1?(t.username=r,t.password=``):(t.username=r.substring(0,e),t.password=r.substring(e+1))}}else i=e;if(i!==``)if(i.startsWith(`[`)){let e=i.indexOf(`]`);if(e===-1)throw Error(`Invalid IPv6 address in URL update.`);t.hostname=i.substring(0,e+1);let n=i.substring(e+1);n.startsWith(`:`)&&(t.port=n.substring(1))}else{let e=i.lastIndexOf(`:`);e!==-1&&i.indexOf(`:`)===e?(t.hostname=i.substring(0,e),t.port=i.substring(e+1)):(t.hostname=i,t.port=``)}}if(n[3]!==void 0&&n[3]!==``&&(t.path=n[3].startsWith(`/`)?n[3]:`/${n[3]}`),n[4]!==void 0){let e={},r=n[4].split(`&`);for(let t of r){if(!t)continue;let[n,r=``]=t.split(`=`);if(n===void 0)continue;let i=decodeURIComponent(n),a=decodeURIComponent(r);if(i in e){let t=e[i];Array.isArray(t)?t.push(a):e[i]=[t,a]}else e[i]=a}t.queryItems=e}return n[5]!==void 0&&(t.fragment=n[5]),t}var T=class{constructor(e){i(this,`protocol`,void 0),i(this,`hostname`,void 0),i(this,`path`,void 0),i(this,`username`,void 0),i(this,`password`,void 0),i(this,`port`,void 0),i(this,`queryItems`,void 0),i(this,`fragment`,void 0);let t=w(e);if(!t.hostname||!t.protocol)throw Error(`URL Hostname and Protocol are required`);this.hostname=t.hostname,this.protocol=t.protocol,this.path=t.path??``,this.username=t.username,this.password=t.password,this.port=t.port,this.queryItems=t.queryItems,this.fragment=t.fragment}toString(){let e=`${this.protocol}://`;if(this.username!==void 0&&this.username!==``&&(e+=this.username,this.password!==void 0&&this.password!==``&&(e+=`:${this.password}`),e+=`@`),e+=this.hostname,this.port!==void 0&&this.port!==``&&(e+=`:${this.port}`),this.path!==``&&(e+=this.path.startsWith(`/`)?this.path:`/${this.path}`),this.queryItems!==void 0){let t=Object.keys(this.queryItems),n=[];if(t.length>0)for(let e of t){let t=this.queryItems[e];if(Array.isArray(t))for(let r of t)n.push(`${encodeURIComponent(e)}=${encodeURIComponent(r)}`);else t!==void 0&&n.push(`${encodeURIComponent(e)}=${encodeURIComponent(t)}`)}e+=`?${n.join(`&`)}`}return this.fragment!==void 0&&(e+=`#${this.fragment}`),e}setProtocol(e){if(e===``)throw Error(`Protocol is required`);return this.protocol=e,this}setUsername(e){return e===``?this.username=void 0:this.username=e,this}setPassword(e){return e===``?this.password=void 0:this.password=e,this}setHostname(e){if(e===``)throw Error(`Hostname is required`);return this.hostname=e,this}setPort(e){return e===``?this.port=void 0:this.port=e,this}setPath(e){return this.path=e.startsWith(`/`)?e:`/${e}`,this}addPathComponent(e){return this.path=(this.path??``)+(e.startsWith(`/`)?e:`/${e}`),this}setQueryItems(e){return this.queryItems=e,this}setQueryItem(e,t){return this.queryItems===void 0&&(this.queryItems={}),this.queryItems[e]=t,this}removeQueryItem(e){return delete this.queryItems?.[e],this}setFragment(e){return this.fragment=e,this}update(e){let t;return t=typeof e==`string`?w(e):e,t.protocol!==void 0&&this.setProtocol(t.protocol),t.username!==void 0&&this.setUsername(t.username),t.password!==void 0&&this.setPassword(t.password),t.hostname!==void 0&&this.setHostname(t.hostname),t.port!==void 0&&this.setPort(t.port),t.path!==void 0&&this.setPath(t.path),t.queryItems!==void 0&&this.setQueryItems(t.queryItems),t.fragment!==void 0&&this.setFragment(t.fragment),this}};let E=`cookie_store_cookies`;var D=class extends _{get cookies(){return Object.freeze(Object.values(this._cookies))}set cookies(e){let t={};for(let n of e)this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t,this.saveCookiesToStorage()}constructor(e){super(`cookie_store`),i(this,`options`,void 0),i(this,`_cookies`,{}),this.options=e,this.loadCookiesFromStorage()}async interceptRequest(e){return e.cookies={...e.cookies??{},...this.cookiesForUrl(e.url).reduce((e,t)=>(e[t.name]=t.value,e),{})},e}async interceptResponse(e,t,n){let r=this._cookies;for(let e of t.cookies){let t=this.cookieIdentifier(e);if(this.isCookieExpired(e)){delete r[t];continue}r[t]=e}return this._cookies=r,this.saveCookiesToStorage(),n}setCookie(e){this.isCookieExpired(e)||(this._cookies[this.cookieIdentifier(e)]=e,this.saveCookiesToStorage())}deleteCookie(e){delete this._cookies[this.cookieIdentifier(e)]}cookiesForUrl(e){let t=new T(e),n=t.hostname;if(!n)return[];let r={},i=t.path.startsWith(`/`)?t.path:`/${t.path}`,a=n.split(`.`),o=i.split(`/`);o.shift();let s=this.cookies;for(let e of s){if(this.isCookieExpired(e)){delete this._cookies[this.cookieIdentifier(e)];continue}let t=this.cookieSanitizedDomain(e).split(`.`);if(a.length<t.length||t.length==0)continue;let n=!0;for(let e=0;e<t.length;e++){let r=t.length-1-e,i=a.length-1-e;if(t[r]!=a[i]){n=!1;break}}if(!n)continue;let s=this.cookieSanitizedPath(e),c=s.split(`/`);c.shift();let l=0;if(i===s)l=2**53-1;else if(c.length===0||s===`/`)l=1;else if(i.startsWith(s)&&o.length>=c.length)for(let e=0;e<c.length&&c[e]===o[e];e++)l+=1;l<=0||(r[e.name]?.pathMatches??0)<l&&(r[e.name]={cookie:e,pathMatches:l})}return Object.values(r).map(e=>e.cookie)}cookieIdentifier(e){return`${e.name}-${this.cookieSanitizedDomain(e)}-${this.cookieSanitizedPath(e)}`}cookieSanitizedPath(e){return e.path?.startsWith(`/`)?e.path:`/`+(e.path??``)}cookieSanitizedDomain(e){return e.domain.replace(/^(www)?\.?/gi,``).toLowerCase()}isCookieExpired(e){return!!(e.expires&&e.expires.getTime()<=Date.now())}loadCookiesFromStorage(){if(this.options.storage==`memory`)return;let e=Application.getState(E);if(!e){this._cookies={};return}let t={};for(let n of e)!n.expires||this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t}saveCookiesToStorage(){this.options.storage!=`memory`&&Application.setState(this.cookies.filter(e=>e.expires),E)}},O;(function(e){e[e.NONE=0]=`NONE`,e[e.MANGA_CHAPTERS=1]=`MANGA_CHAPTERS`,e[e.CHAPTER_PROVIDING=1]=`CHAPTER_PROVIDING`,e[e.MANGA_PROGRESS=2]=`MANGA_PROGRESS`,e[e.MANGA_PROGRESS_PROVIDING=2]=`MANGA_PROGRESS_PROVIDING`,e[e.PROGRESS_PROVIDING=2]=`PROGRESS_PROVIDING`,e[e.DISCOVER_SECIONS=4]=`DISCOVER_SECIONS`,e[e.DISCOVER_SECIONS_PROVIDING=4]=`DISCOVER_SECIONS_PROVIDING`,e[e.DISCOVER_SECTION_PROVIDING=4]=`DISCOVER_SECTION_PROVIDING`,e[e.COLLECTION_MANAGEMENT=8]=`COLLECTION_MANAGEMENT`,e[e.MANAGED_COLLECTION_PROVIDING=8]=`MANAGED_COLLECTION_PROVIDING`,e[e.CLOUDFLARE_BYPASS_REQUIRED=16]=`CLOUDFLARE_BYPASS_REQUIRED`,e[e.CLOUDFLARE_BYPASS_PROVIDING=16]=`CLOUDFLARE_BYPASS_PROVIDING`,e[e.SETTINGS_UI=32]=`SETTINGS_UI`,e[e.SETTINGS_FORM_PROVIDING=32]=`SETTINGS_FORM_PROVIDING`,e[e.MANGA_SEARCH=64]=`MANGA_SEARCH`,e[e.SEARCH_RESULTS_PROVIDING=64]=`SEARCH_RESULTS_PROVIDING`,e[e.SEARCH_RESULT_PROVIDING=64]=`SEARCH_RESULT_PROVIDING`})(O||(O={}));var k;(function(e){e.EVERYONE=`SAFE`,e.MATURE=`MATURE`,e.ADULT=`ADULT`})(k||(k={}));var A;(function(e){e[e.featured=0]=`featured`,e[e.simpleCarousel=1]=`simpleCarousel`,e[e.prominentCarousel=2]=`prominentCarousel`,e[e.chapterUpdates=3]=`chapterUpdates`,e[e.genres=4]=`genres`})(A||(A={})),Object.freeze({items:[],metadata:void 0});let j=`https://atsu.moe`;var M=class extends _{async interceptRequest(e){return{...e,headers:{...e.headers,referer:`${j}/`,"user-agent":await Application.getDefaultUserAgent()}}}async interceptResponse(e,t,n){if(t.headers?.[`cf-mitigated`]===`challenge`)throw new C({url:e.url,method:e.method??`GET`,headers:{"user-agent":await Application.getDefaultUserAgent()}});return n}};async function N(e){let[t,n]=await Application.scheduleRequest(e);if(t.status!==200)throw Error(`Request failed with status ${t.status}: ${e.url}`);let r=Application.arrayBufferToUTF8String(n);try{return typeof r==`string`?JSON.parse(r):r}catch(t){let n=t instanceof Error?t.message:String(t);throw Error(`Failed to parse JSON from ${e.url}: ${n}`)}}async function P(e){let[t,n]=await Application.scheduleRequest(e);if(t.status!==200)throw Error(`Request failed with status ${t.status}: ${e.url}`);let r=Application.arrayBufferToUTF8String(n);return typeof r==`string`?r:String(r)}var F;(function(e){e.singleRowNormal=`singleRowNormal`,e.singleRowLarge=`singleRowLarge`,e.doubleRow=`doubleRow`,e.featured=`featured`})(F||(F={}));var I;(function(e){e[e.MANGA_CHAPTERS=1]=`MANGA_CHAPTERS`,e[e.MANGA_TRACKING=2]=`MANGA_TRACKING`,e[e.HOMEPAGE_SECTIONS=4]=`HOMEPAGE_SECTIONS`,e[e.COLLECTION_MANAGEMENT=8]=`COLLECTION_MANAGEMENT`,e[e.CLOUDFLARE_BYPASS_REQUIRED=16]=`CLOUDFLARE_BYPASS_REQUIRED`,e[e.SETTINGS_UI=32]=`SETTINGS_UI`})(I||(I={}));var L;(function(e){e.EVERYONE=`EVERYONE`,e.MATURE=`MATURE`,e.ADULT=`ADULT`})(L||(L={}));var R;(function(e){e.BLUE=`default`,e.GREEN=`success`,e.GREY=`info`,e.YELLOW=`warning`,e.RED=`danger`})(R||(R={}));let z={};z.createSourceStateManager=function(){return{keychain:{async store(e,t){Application.setSecureState(t,e)},async retrieve(e){return Application.getSecureState(e)}},async store(e,t){Application.setState(t,e)},async retrieve(e){return Application.getState(e)}}};function B(e){let t=e.url;e.param&&(t+=e.param);let n={};for(let t of e.cookies??[])n[t.name]=t.value;return{url:t,method:e.method,body:e.data,headers:e.headers,cookies:n}}function te(e){return{url:e.url,method:e.method,headers:e.headers??{},cookies:Object.keys(e.cookies??{}).map(t=>({name:t,value:e.cookies[t],domain:``})),data:e.body}}z.createRequestManager=function(e){let t=new class extends _{constructor(e){super(`main`),i(this,`legacyInterceptor`,void 0),this.legacyInterceptor=e}async interceptRequest(e){if(!this.legacyInterceptor)return e;let t=te(e);return B(await this.legacyInterceptor.interceptRequest(t))}async interceptResponse(e,t,n){return this.legacyInterceptor,n}}(e.interceptor),n=new S(`rateLimit`,{numberOfRequests:e.requestsPerSecond??2,bufferInterval:1,ignoreImages:!0}),r=new D({storage:`memory`});return t.registerInterceptor(),n.registerInterceptor(),r.registerInterceptor(),{__backing_interceptor:t,__backing_rateLimit:n,__backing_cookieStore:r,interceptor:e.interceptor,cookieStore:{getAllCookies(){return r.cookies},addCookie(e){r.setCookie(e)},removeCookie(e){r.deleteCookie(e)}},async getDefaultUserAgent(){return Application.getDefaultUserAgent()},requestsPerSecond:e.requestsPerSecond??2,requestTimeout:e.requestTimeout??3e4,async schedule(e){let t=B(e);console.log(`[COMPAT] SCHEDULING REQUEST TO `+t.url);let[n,r]=await Application.scheduleRequest(t);return{request:e,headers:n.headers,status:n.status,data:Application.arrayBufferToUTF8String(r),get rawData(){return new Uint8Array(r)}}}}},globalThis.App=new Proxy(z,{get(e,t){if(e[t])return e[t];if(typeof t==`string`&&t.startsWith(`create`)){if(t.startsWith(`createDUI`)){let e=t.slice(6);return t=>Object.defineProperty(t,"type",{enumerable:!0,value:e})}return e=>e}}});var ne=class extends ee{constructor(e,t){super(),i(this,`filters`,void 0),i(this,`selectedFilterValues`,void 0),this.selectedFilterValues={};for(let t of e??[])this.selectedFilterValues[t.id]=t.value;t instanceof Promise?(this.filters=void 0,t.then(e=>this.filters=e).catch(e=>this.filters=e).finally(()=>this.reloadForm())):this.filters=t}getSections(){return this.filters?this.filters instanceof Error?[s(`error`,[d(`error`,{title:`Error loading search filters`,subtitle:this.filters.message})])]:this.filters.map(e=>{switch(e.type){case`dropdown`:{let t=[this.selectedFilterValues[e.id]??e.value];return l(this,{id:e.id,header:e.title,value:t,onValueChange:o(this,e.id,async()=>{this.selectedFilterValues[e.id]=t[0]}),layout:`list`,items:e.options.map(e=>({id:e.id,title:e.value})),minItemCount:1,maxItemCount:1})}case`multiselect`:{let t=this.selectedFilterValues[e.id]??e.value;return s({id:e.id},[m(e.id,{title:e.title,layout:`flow`,value:t,items:e.options.map(e=>({id:e.id,title:e.value})),allowExclusion:e.allowExclusion,allowEmptySelection:e.allowEmptySelection,maximum:e.maximum,onValueChange:o(this,e.id,async t=>{this.selectedFilterValues[e.id]=t,this.reloadForm()})})])}case`input`:{let t=this.selectedFilterValues[e.id]??e.value;return s({id:e.id,header:e.title},[f(e.id,{title:e.title,value:t,onValueChange:o(this,e.id,async t=>{this.selectedFilterValues[e.id]=t,this.reloadForm()})})])}}}):[s(`loading`,[d(`loading`,{title:`Loading Filters`})])]}getSearchQueryMetadata(){return this.filters&&!(this.filters instanceof Error)?this.filters.map(e=>({id:e.id,value:this.selectedFilterValues[e.id]??e.value})):[]}async formDidSubmit(){if(!this.filters)throw Error(`Search filters are loading`);if(this.filters instanceof Error)throw this.filters}},V=class extends a{getSections(){return[s({id:`adult-content`,footer:`Enable this to show adult/NSFW content across discover and search results. This setting is off by default.`},[this.showAdultRow()])]}showAdultRow(){return p(`show-adult`,{title:`Show Adult Content`,value:H(),onValueChange:Application.Selector(this,`handleShowAdultChange`)})}async handleShowAdultChange(e){U(e),this.reloadForm()}};function H(){return Application.getState(`atsumaru-show-adult`)??!1}function U(e){Application.setState(e,`atsumaru-show-adult`)}var W=class{async getSettingsForm(){return new V}};function G(e,t){t.forEach(t=>{Object.getOwnPropertyNames(t.prototype).forEach(n=>{Object.defineProperty(e.prototype,n,Object.getOwnPropertyDescriptor(t.prototype,n)||Object.create(null))})})}function K(e){let t=typeof e==`string`?e:e?.posterMedium??e?.posterSmall??e?.poster;return t?t.startsWith(`http`)?t:`${j}${t.startsWith(`/`)?t:`/static/${t}`}`:``}function q(){return H()?k.ADULT:k.EVERYONE}function J(e){let t=e.match(/window\.mangaPage\s*=\s*({[\s\S]*?});/);if(!t)throw Error(`Could not find manga data in page`);return JSON.parse(t[1]).mangaPage}function Y(e){return e.replace(/\D/g,``)}function X(e){let t=[],n=[],r=[],i=[],a=[],o=e.metadata?.find(e=>e.id===`tags`);if(o?.value&&typeof o.value==`object`){let e=o.value;Object.entries(e).forEach(([e,r])=>{r===`included`&&t.push(e),r===`excluded`&&n.push(e)})}let s=e.metadata?.find(e=>e.id===`types`);if(s?.value&&typeof s.value==`object`){let e=s.value;Object.keys(e).forEach(t=>{e[t]===`included`&&r.push(t)})}let c=e.metadata?.find(e=>e.id===`statuses`);if(c?.value&&typeof c.value==`object`){let e=c.value;Object.keys(e).forEach(t=>{e[t]===`included`&&i.push(t)})}let l=e.metadata?.find(e=>e.id===`years`);if(l?.value&&typeof l.value==`object`){let e=l.value;Object.keys(e).forEach(t=>{let n=Number(t);e[t]===`included`&&Number.isFinite(n)&&a.push(n)})}let u=e.metadata?.find(e=>e.id===`minChapters`),d=typeof u?.value==`string`?Y(u.value):``,f=/^\d+$/.test(d)?Number(d):null;return{includedTags:t,excludedTags:n,selectedTypes:r,selectedStatuses:i,selectedYears:a,minChapters:f!==null&&Number.isFinite(f)&&f>0?f:null,officialTranslation:e.metadata?.find(e=>e.id===`officialTranslation`)?.value===`true`}}var re=class extends ne{getSections(){return super.getSections().map(e=>({...e,items:e.items.map(e=>e.id!==`minChapters`||e.type!==`inputRow`?e:{...e,value:Y(e.value??``),onValueChange:Application.Selector(this,`setMinChapters`)})}))}async setMinChapters(e){this.selectedFilterValues.minChapters=Y(e),this.reloadForm()}};function Z(e){return`\`${e.replace(/\\/g,`\\\\`).replace(/`/g,"\\`")}\``}function ie(){let e=[];for(let t=new Date().getFullYear()+1;t>=1970;t--)e.push({id:String(t),value:String(t)});return e}var Q=class{async getSearchFilters(){let e=await N({url:new T(j).addPathComponent(`api`).addPathComponent(`explore`).addPathComponent(`availableFilters`).toString(),method:`GET`}),t=[];return e.genres&&e.genres.length>0&&t.push({type:`multiselect`,id:`tags`,title:`Tags`,options:e.genres.map(e=>({id:e.id,value:e.name})),value:{},allowExclusion:!0,allowEmptySelection:!0,maximum:void 0}),e.types&&e.types.length>0&&t.push({type:`multiselect`,id:`types`,title:`Types`,options:e.types.map(e=>({id:e.id,value:e.name})),value:{},allowExclusion:!1,allowEmptySelection:!0,maximum:void 0}),e.statuses&&e.statuses.length>0&&t.push({type:`multiselect`,id:`statuses`,title:`Status`,options:e.statuses.map(e=>({id:e.id,value:e.name})),value:{},allowExclusion:!1,allowEmptySelection:!0,maximum:void 0}),t.push({type:`multiselect`,id:`years`,title:`Years`,options:ie(),value:{},allowExclusion:!1,allowEmptySelection:!0,maximum:void 0}),t.push({type:`input`,id:`minChapters`,title:`Minimum Chapters`,placeholder:`0`,value:``}),t.push({type:`dropdown`,id:`officialTranslation`,title:`Official Translation`,options:[{id:``,value:`Any`},{id:`true`,value:`Only Official Translations`}],value:``}),t}async getSortingOptions(){return[{id:`views:desc`,label:`Popularity`},{id:`trending:desc`,label:`Trending`},{id:`dateAdded:desc`,label:`Date Added`},{id:`releaseDate:desc`,label:`Release Date`},{id:`mbRating:desc`,label:`Top Rated`}]}async getAdvancedSearchForm(e){return new re(e.metadata,this.getSearchFilters())}async getSearchResults(e,t,n){let r=t?.page??1,i=H(),a=X(e),o=e.title?.trim()||``,s=n?.id??`views:desc`,c=[];for(let e of a.includedTags)c.push(`genreIds:=${Z(e)}`);a.excludedTags.length>0&&c.push(`genreIds:!=[${a.excludedTags.map(e=>Z(e)).join(`,`)}]`),a.selectedTypes.length>0&&c.push(`type:=[${a.selectedTypes.map(e=>Z(e)).join(`,`)}]`),a.selectedStatuses.length>0&&c.push(`status:=[${a.selectedStatuses.map(e=>Z(e)).join(`,`)}]`),a.selectedYears.length>0&&c.push(`releaseYear:=[${a.selectedYears.join(`,`)}]`),a.minChapters!==null&&c.push(`chapterCount:>=${a.minChapters}`),a.officialTranslation&&c.push(`officialTranslation:=true`),i||c.push(`isAdult:=false`),s===`mbRating:desc`?c.push(`mbRating:>0`):s===`views:desc`&&c.push(`views:>0`);let l=await N({url:new T(j).addPathComponent(`collections`).addPathComponent(`manga`).addPathComponent(`documents`).addPathComponent(`search`).setQueryItem(`q`,o||`*`).setQueryItem(`query_by`,`title,englishTitle,otherNames,authors`).setQueryItem(`query_by_weights`,`4,3,2,1`).setQueryItem(`num_typos`,`4,3,2,1`).setQueryItem(`include_fields`,`id,title,englishTitle,poster,posterSmall,posterMedium,type`).setQueryItem(`filter_by`,c.join(` && `)).setQueryItem(`page`,String(r)).setQueryItem(`per_page`,`20`).setQueryItem(`sort_by`,s).toString(),method:`GET`}),u=l.hits??[];return{items:u.map(({document:e})=>({mangaId:e.id,title:e.title||e.englishTitle||``,imageUrl:K(e),subtitle:e.type,contentRating:q()})),metadata:r*20<l.found&&u.length>0?{page:r+1}:void 0}}};function ae(e,t,n){let r=e.chapters.map(e=>({chapter:e,groupName:e.scanlationMangaId?n.get(e.scanlationMangaId)??`No Group`:`No Group`})).sort((e,t)=>e.chapter.number===t.chapter.number?e.groupName.localeCompare(t.groupName):t.chapter.number-e.chapter.number);return r.map(({chapter:e,groupName:n},i)=>{let a=e.title.replace(/^((Chapter|Episode|Ch\.?)\s*[\d.]+|#\s*[\d.]+)\s*(\bS\d+\b)?\s*[-:]?\s*/i,``).trim(),o=Number(e.title.match(/\bS(\d+)\b/i)?.[1]??0);return{chapterId:e.id,sourceManga:t,title:a,chapNum:e.number,volume:o,langCode:`en`,version:n,sortingIndex:r.length-i,publishDate:new Date(e.createdAt)}})}var oe=class{async getChapters(e){let t=e.mangaId,n=new T(j).addPathComponent(`manga`).addPathComponent(t).toString(),r={url:n,method:`GET`},i=await P(r),a;try{a=J(i)}catch{let o=(await new Q().getSearchResults({title:e.mangaInfo.primaryTitle})).items.find(t=>t.title===e.mangaInfo.primaryTitle)?.mangaId;if(!o)throw Error(`Could not resolve manga ID for: ${e.mangaInfo.primaryTitle}`);t=o,n=new T(j).addPathComponent(`manga`).addPathComponent(t).toString(),r={url:n,method:`GET`},i=await P(r),a=J(i)}t=a.id;let o=new Map((a?.scanlators??[]).map(e=>[e.id,e.name]));return ae(await N({url:new T(j).addPathComponent(`api`).addPathComponent(`manga`).addPathComponent(`allChapters`).setQueryItem(`mangaId`,t).toString(),method:`GET`}),e,o)}async getChapterDetails(e){let t=e.sourceManga.mangaId,n=e.chapterId;return{id:n,mangaId:t,pages:(await N({url:new T(j).addPathComponent(`api`).addPathComponent(`read`).addPathComponent(`chapter`).setQueryItem(`mangaId`,t).setQueryItem(`chapterId`,n).toString(),method:`GET`})).readChapter.pages.sort((e,t)=>e.number-t.number).map(e=>e.image.startsWith(`http`)?e.image:`${j}${e.image}`)}}};function se(e){return e.homePage.sections.filter(e=>e.layout===`carousel`&&e.key!==`hot-updates`).map(e=>({id:e.key,title:e.title||`Unknown`,type:A.simpleCarousel}))}function ce(e,t){let n=e.homePage.sections.find(e=>e.key===t);return!n||!n.items?[]:n.items.map(e=>({type:`simpleCarouselItem`,mangaId:e.id,title:e.title,imageUrl:K(e.image),subtitle:e.type,contentRating:q()}))}var le=class{async getDiscoverSections(){let e=H(),t=new T(j).addPathComponent(`api`).addPathComponent(`home`).addPathComponent(`page`);return e&&t.setQueryItem(`adult`,`1`),se(await N({url:t.toString(),method:`GET`}))}async getDiscoverSectionItems(e,t){let n=H();if(e.id===`top-rated`){let t=new T(j).addPathComponent(`api`).addPathComponent(`home`).addPathComponent(`page`);return n&&t.setQueryItem(`adult`,`1`),{items:ce(await N({url:t.toString(),method:`GET`}),e.id),metadata:void 0}}let r=t?.page??0,i={"trending-carousel":`trending`,"most-bookmarked":`mostBookmarked`,"recently-updated":`recentlyUpdated`,popular:`popular`,"recently-added":`recentlyAdded`}[e.id];if(!i)throw Error(`Unknown section: ${e.id}`);let a=new T(j).addPathComponent(`api`).addPathComponent(`infinite`).addPathComponent(i).setQueryItem(`page`,r.toString()).setQueryItem(`types`,`Manga,Manwha,Manhua`);n&&a.setQueryItem(`adult`,`1`);let o=(await N({url:a.toString(),method:`GET`})).items.map(e=>({type:`simpleCarouselItem`,mangaId:e.id,title:e.title,imageUrl:K(e.image),subtitle:e.type,contentRating:q()}));return{items:o,metadata:o.length>0?{page:r+1}:void 0}}};function ue(e,t){let n=J(e);return{mangaId:t,mangaInfo:{primaryTitle:n.title,secondaryTitles:n.otherNames,thumbnailUrl:K(n.poster.image),synopsis:n.synopsis,author:n.authors.length>0?n.authors.map(e=>e.name).join(`, `):void 0,status:n.status,contentRating:q(),tagGroups:n.genres?.length>0?[{id:`tags`,title:`Tags`,tags:n.genres.map(e=>({id:e.id,title:e.name}))}]:[],shareUrl:`${j}/manga/${t}`}}}var de=class{async getMangaDetails(e){return ue(await P({url:new T(j).addPathComponent(`manga`).addPathComponent(e).toString(),method:`GET`}),e)}},$=class{constructor(){i(this,`cookieStorageInterceptor`,new D({storage:`stateManager`})),i(this,`globalRateLimiter`,new S(`rateLimiter`,{numberOfRequests:10,bufferInterval:1,ignoreImages:!0})),i(this,`atsuInterceptor`,new M(`atsumaru-interceptor`))}async initialise(){this.globalRateLimiter.registerInterceptor(),this.cookieStorageInterceptor.registerInterceptor(),this.atsuInterceptor.registerInterceptor()}async saveCloudflareBypassCookies(e){for(let t of e)(t.name.startsWith(`cf`)||t.name.startsWith(`_cf`)||t.name.startsWith(`__cf`))&&this.cookieStorageInterceptor.setCookie(t)}async bypassCloudflareRequest(e){return e}};return G($,[Q,de,oe,le,W]),e.Atsumaru=new $,e.AtsumaruExtension=$,e})({});

/* MangaReader registration footer. */
PaperbackCompat.registerContent("Atsumaru", source["Atsumaru"], {"apiVersion":"1.0"});
