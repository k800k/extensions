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
    async executeInWebView() {
      throw new Error("This source requires Paperback's interactive WebView execution, which MangaReader API v1 intentionally does not expose");
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
      shareUrl: info.shareUrl
    };
  };
  const sourceMangaFromWork = work => ({ mangaId: string(work?.workId), mangaInfo: mangaInfoFromWork(work) });
  const workFromSourceManga = manga => {
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
        shareUrl: info.shareUrl
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

  const registerContent = (id, instance) => {
    if (!instance) throw new Error(`Paperback bundle did not export ${id}`);
    defineContentExtension(adaptDefinition({
      id,
      apiVersion: "1.0",
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
        return { items: (result?.items ?? []).map(item => mapSearchItem(item)), metadata: result?.metadata ?? null };
      },
      details: async workID => workFromSourceManga(await instance.getMangaDetails(string(workID))),
      installments: async sourceWork => {
        const chapters = await instance.getChapters(sourceMangaFromWork(sourceWork));
        return (chapters ?? []).map(chapter => compact({
          installmentId: string(chapter.chapterId),
          langCode: string(chapter.langCode, "unknown"),
          number: number(chapter.chapNum),
          title: chapter.title,
          volume: optionalNumber(chapter.volume),
          publishDate: isoDate(chapter.publishDate)
        }));
      },
      imagePages: async installment => {
        const sourceWork = installment?.sourceWork ?? { workId: installment?.workId, workInfo: {} };
        const chapter = compact({
          chapterId: string(installment?.installmentId),
          langCode: string(installment?.langCode, "unknown"),
          chapNum: number(installment?.number),
          title: installment?.title,
          volume: optionalNumber(installment?.volume),
          publishDate: installment?.publishDate ? new Date(installment.publishDate) : undefined,
          sourceManga: sourceMangaFromWork(sourceWork)
        });
        const details = await instance.getChapterDetails(chapter);
        return {
          id: string(details?.id, string(installment?.installmentId)),
          workId: string(details?.mangaId, string(sourceWork?.workId)),
          pages: (details?.pages ?? []).map(page => string(page?.url ?? page)).filter(Boolean)
        };
      },
      imagePageContent: ({ url }) => resource(url),
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
