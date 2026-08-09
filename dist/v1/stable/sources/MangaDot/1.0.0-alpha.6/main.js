/*!
 * MangaDot for manko
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Audited upstream snapshot: https://github.com/inkdex/general-extensions
 * Audited snapshot commit: b03d78c35dfb0ad305660dd3aa8618a006cbd73f
 * Audited snapshot path: src/MangaDot
 * Snapshot relationship: not recorded by the registry as this artifact's build input
 * Registry artifact: 5514d0bc58cb8edcee06c1c01458c51a7fd43e43/MangaDot/index.js
 * Adapter: manko Paperback compatibility bridge v1.2
 */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 manko Extension Contributors */
/*
 * Compatibility bridge for GPL-licensed Paperback 0.9 extension bundles.
 * This file is concatenated before the unmodified upstream bundle and adapts
 * the public Paperback Application/Extension surface to manko API v1.
 */
(() => {
  "use strict";

  const context = globalThis.manko?.context;
  if (!context) throw new Error("manko Extension API v1 is unavailable");

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
        throw new Error("This source requires manko API 1.1 webExecution permission");
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
  // manko decodes domain-model Date fields with Swift Codable's default
  // reference date (2001-01-01), while installment dates deliberately use ISO.
  const codableDate = value => {
    if (value === undefined || value === null || value === "") return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.valueOf()) ? undefined : date.valueOf() / 1000 - 978307200;
  };
  const rating = value => ["SAFE", "MATURE", "ADULT"].includes(value) ? value : "SAFE";
  const compact = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
  const paperbackSearchPolicies = Object.freeze({
    AllPornComic: {
      fields: [{ id: "genres", title: "Genres", shape: "triStateObject", supportsExclusion: false }],
      tagGroups: { genres: { fieldID: "genres", groupTitle: "Genres" } }
    },
    Atsumaru: {
      fields: [{ id: "tags", title: "Tags", shape: "triStateArray", supportsExclusion: true }],
      tagGroups: { tags: { fieldID: "tags", groupTitle: "Tags" } }
    },
    MadaraDex: {
      fields: [{ id: "genres", title: "Genres", shape: "triStateObject", supportsExclusion: false }],
      tagGroups: { genres: { fieldID: "genres", groupTitle: "Genres" } }
    },
    MangaDex: {
      fields: [
        { id: "format", title: "Format", shape: "nestedTriState", supportsExclusion: true },
        { id: "genre", title: "Genre", shape: "nestedTriState", supportsExclusion: true },
        { id: "theme", title: "Theme", shape: "nestedTriState", supportsExclusion: true },
        { id: "content", title: "Content", shape: "nestedTriState", supportsExclusion: true },
        { id: "tags", title: "Tags", shape: "nestedTriState", supportsExclusion: true }
      ],
      dynamicTagGroups: true,
      groupOrder: ["format", "genre", "theme", "content", "tags"]
    },
    MangaDot: {
      fields: [
        { id: "genres", title: "Genres", shape: "triStateObject", supportsExclusion: true },
        { id: "author", title: "Authors", shape: "valueArray", supportsExclusion: false },
        { id: "artist", title: "Artists", shape: "valueArray", supportsExclusion: false }
      ],
      tagGroups: { genres: { fieldID: "genres", groupTitle: "Genres" } },
      creators: {
        author: { fieldID: "author", groupTitle: "Authors" },
        artist: { fieldID: "artist", groupTitle: "Artists" }
      }
    },
    MangaFox: {
      fields: [{ id: "genres", title: "Genres", shape: "triStateArray", supportsExclusion: false }],
      tagGroups: { genres: { fieldID: "genres", groupTitle: "Genres" } }
    },
    Mangago: {
      fields: [{ id: "genres", title: "Genres", shape: "triStateObject", supportsExclusion: true }],
      tagGroups: { genres: { fieldID: "genres", groupTitle: "Genres" } }
    },
    RoyalRoad: {
      fields: [
        { id: "genres", title: "Genres", shape: "triStateObject", supportsExclusion: true },
        { id: "tags", title: "Tags", shape: "triStateObject", supportsExclusion: true },
        { id: "author", title: "Author", shape: "text", supportsExclusion: false }
      ],
      tagGroups: {
        genres: { fieldID: "genres", groupTitle: "Genres" },
        tags: { fieldID: "tags", groupTitle: "Tags" }
      },
      creators: { author: { fieldID: "author", groupTitle: "Authors" } }
    },
    Webtoon: {
      fields: [{ id: "genres", title: "Genres", shape: "valueArray", supportsExclusion: false }],
      tagGroups: {
        "0": { fieldID: "genres", groupTitle: "Genres" },
        genres: { fieldID: "genres", groupTitle: "Genres" }
      }
    }
  });
  const canonical = value => string(value).trim().toLowerCase();
  const titleCase = value => string(value)
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
  const splitCreators = value => string(value)
    .split(/[,\r\n]+/)
    .map(item => item.trim())
    .filter(Boolean);
  const tagRule = (policy, group) => {
    const groupID = string(group?.id).trim();
    const explicit = policy?.tagGroups?.[groupID];
    if (explicit) return explicit;
    if (!policy?.dynamicTagGroups || !groupID) return null;
    return {
      fieldID: groupID,
      groupTitle: string(group?.title, titleCase(groupID))
    };
  };
  const orderedTagGroups = (policy, groups) => {
    const values = Array.isArray(groups) ? groups.map((group, index) => ({ group, index })) : [];
    if (!policy?.groupOrder) return values.map(item => item.group);
    const order = new Map(policy.groupOrder.map((id, index) => [id, index]));
    return values
      .sort((left, right) => {
        const leftOrder = order.get(string(left.group?.id)) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = order.get(string(right.group?.id)) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.index - right.index;
      })
      .map(item => item.group);
  };
  const searchFacetsForManga = (sourceID, info) => {
    const policy = paperbackSearchPolicies[sourceID];
    if (!policy) return [];
    const facets = [];
    const seen = new Set();
    const append = facet => {
      const fieldID = string(facet.fieldID).trim();
      const value = string(facet.value).trim();
      const title = string(facet.title).trim();
      if (!fieldID || !value || !title) return;
      const key = `${facet.presentation}\u0000${fieldID}\u0000${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      facets.push(compact({ ...facet, fieldID, value, title }));
    };
    for (const group of orderedTagGroups(policy, info?.tagGroups)) {
      const rule = tagRule(policy, group);
      if (!rule) continue;
      const groupTitle = string(rule.groupTitle, string(group?.title, titleCase(group?.id)));
      for (const tag of Array.isArray(group?.tags) ? group.tags : []) {
        append({
          fieldID: rule.fieldID,
          value: tag?.id,
          title: tag?.title,
          groupTitle,
          presentation: "tag"
        });
      }
    }
    for (const [property, rule] of Object.entries(policy.creators ?? {})) {
      for (const title of splitCreators(info?.[property])) {
        append({
          fieldID: rule.fieldID,
          value: title,
          title,
          groupTitle: rule.groupTitle,
          presentation: "creator"
        });
      }
    }
    return facets;
  };
  const paperbackSearchMetadata = (sourceID, selections) => {
    const policy = paperbackSearchPolicies[sourceID];
    if (!policy || !Array.isArray(selections) || !selections.length) return undefined;
    const fields = new Map((policy.fields ?? []).map(field => [field.id, field]));
    const objectMetadata = {};
    const arrayMetadata = [];
    for (const selection of selections.slice(0, 24)) {
      const fieldID = string(selection?.fieldID).trim();
      const value = string(selection?.value).trim();
      const field = fields.get(fieldID)
        ?? (policy.dynamicTagGroups
          ? { id: fieldID, title: titleCase(fieldID), shape: "nestedTriState", supportsExclusion: true }
          : null);
      if (!field || !value) continue;
      const excluded = selection?.polarity === "exclude";
      if (excluded && !field.supportsExclusion) continue;
      const state = excluded ? "excluded" : "included";
      if (field.shape === "triStateArray") {
        let entry = arrayMetadata.find(item => item.id === fieldID);
        if (!entry) {
          entry = { id: fieldID, value: {} };
          arrayMetadata.push(entry);
        }
        entry.value[value] = state;
      } else if (field.shape === "nestedTriState") {
        objectMetadata.tagsByGroup ??= {};
        objectMetadata.tagsByGroup[fieldID] ??= {};
        objectMetadata.tagsByGroup[fieldID][value] = state;
      } else if (field.shape === "triStateObject") {
        objectMetadata[fieldID] ??= {};
        objectMetadata[fieldID][value] = state;
      } else if (field.shape === "valueArray") {
        if (excluded) continue;
        objectMetadata[fieldID] ??= [];
        if (!objectMetadata[fieldID].includes(value)) objectMetadata[fieldID].push(value);
      } else if (field.shape === "text" && !excluded) {
        objectMetadata[fieldID] = value;
      }
    }
    if (arrayMetadata.length) return arrayMetadata;
    return Object.keys(objectMetadata).length ? objectMetadata : undefined;
  };
  const paperbackSearchConfiguration = async (sourceID, instance) => {
    const policy = paperbackSearchPolicies[sourceID];
    const fields = (policy?.fields ?? []).map(field => ({
      id: field.id,
      title: field.title,
      queryPrefix: `${field.id}:`,
      placeholder: `Filter by ${field.title.toLowerCase()}`,
      supportsExclusion: field.supportsExclusion,
      options: []
    }));
    let sortOptions = [];
    if (typeof instance.getSortingOptions === "function") {
      try {
        const values = await instance.getSortingOptions({ title: "" });
        sortOptions = (Array.isArray(values) ? values : [])
          .filter(value => value?.id !== undefined && value?.label !== undefined)
          .map(value => ({ id: string(value.id), title: string(value.label) }));
      } catch (_) {}
    }
    return {
      id: `${sourceID.toLowerCase()}-search`,
      title: `${sourceID} Search`,
      fields,
      sortOptions,
      defaultSortID: sortOptions[0]?.id
    };
  };
  const workFromSourceManga = (manga, fallbackMediaKind = "manga", sourceID = "") => {
    const info = manga?.mangaInfo ?? {};
    const searchFacets = searchFacetsForManga(sourceID, info);
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
        searchFacets,
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
  const sortingOption = async (instance, query, requestedID) => {
    if (typeof instance.getSortingOptions !== "function") return undefined;
    const options = await instance.getSortingOptions(query);
    if (!Array.isArray(options)) return undefined;
    return options.find(option => string(option?.id) === string(requestedID)) ?? options[0];
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
  const mirroredImageHosts = new Set([
    "img-r1.2xstorage.com",
    "img-r2.2xstorage.com",
    "imgs-2.2xstorage.com"
  ]);
  const resource = async (url, sourceID) => {
    const requestedURL = new URL(string(url));
    const candidates = [requestedURL];
    if ((sourceID === "MangaBat" || sourceID === "MangaKakalot") && mirroredImageHosts.has(requestedURL.hostname.toLowerCase())) {
      for (const host of mirroredImageHosts) {
        if (host === requestedURL.hostname.toLowerCase()) continue;
        const alternative = new URL(requestedURL.href);
        alternative.hostname = host;
        candidates.push(alternative);
      }
    }

    let lastResponse;
    let lastError;
    for (const candidate of candidates) {
      let response;
      let data;
      try {
        [response, data] = await scheduleRequest({ url: candidate.href, method: "GET", headers: {} });
      } catch (error) {
        if (isChallengeError(error) || candidates.length === 1) throw error;
        lastError = error;
        continue;
      }
      lastResponse = response;
      const mimeType = string(response.mimeType ?? response.headers?.["content-type"]).toLowerCase();
      if (response.status >= 200 && response.status < 300 && !mimeType.includes("text/html")) {
        return { dataBase64: encodeBase64(data), mimeType: mimeType || undefined };
      }
    }
    const status = Number(lastResponse?.status ?? 0);
    const suffix = lastError?.message ? `: ${lastError.message}` : "";
    throw new Error(`Paperback image request failed with HTTP ${status || "unknown"} after ${candidates.length} approved host attempt${candidates.length === 1 ? "" : "s"}${suffix}`);
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
    // manko's `since` argument advisory and preserve only upstream data.
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
    const mangaCache = new Map();
    const chapterCache = new Map();
    const cacheManga = manga => {
      const workID = string(manga?.mangaId);
      if (workID) mangaCache.set(workID, manga);
      return manga;
    };
    const cachedManga = async sourceWork => {
      const workID = string(sourceWork?.workId);
      if (!workID) throw new Error("Paperback source context cannot be restored because the work ID is missing");
      const cached = mangaCache.get(workID);
      if (cached) return cached;
      const refreshed = await instance.getMangaDetails(workID);
      if (!refreshed || string(refreshed.mangaId) !== workID) {
        throw new Error(`Paperback source no longer returns work ${workID}; retry after refreshing the title`);
      }
      return cacheManga(refreshed);
    };
    const chapterKey = (workID, chapterID) => `${string(workID)}\u0000${string(chapterID)}`;
    const cacheChapters = (workID, chapters) => {
      for (const chapter of chapters ?? []) {
        const chapterID = string(chapter?.chapterId);
        if (chapterID) chapterCache.set(chapterKey(workID, chapterID), chapter);
      }
      return chapters;
    };
    const refreshedChapters = async sourceWork => {
      const manga = await cachedManga(sourceWork);
      const chapters = await instance.getChapters(manga);
      if (!Array.isArray(chapters)) throw new TypeError("Paperback source returned an invalid chapter list");
      return cacheChapters(manga.mangaId, chapters);
    };
    const resolvedChapter = async installment => {
      const sourceWork = installment?.sourceWork ?? { workId: installment?.workId, workInfo: {} };
      const workID = string(sourceWork?.workId);
      const chapterID = string(installment?.installmentId);
      if (!workID || !chapterID) throw new Error("Paperback chapter context cannot be restored because its remote ID is missing");
      const cached = chapterCache.get(chapterKey(workID, chapterID));
      if (cached) return cached;
      const chapters = await refreshedChapters(sourceWork);
      const matched = chapters.find(chapter => string(chapter?.chapterId) === chapterID);
      if (!matched) throw new Error(`Chapter ${chapterID} is no longer available from this source. Refresh the title and retry.`);
      return matched;
    };
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
      searchFilters: () => paperbackSearchConfiguration(id, instance),
      search: async ({ query, selections, sort, cursor }) => {
        const metadata = paperbackSearchMetadata(id, selections);
        const searchQuery = compact({ title: string(query), metadata });
        const result = await instance.getSearchResults(
          searchQuery,
          cursor ?? undefined,
          await sortingOption(instance, searchQuery, sort)
        );
        return { items: (result?.items ?? []).map(item => mapSearchItem(item, mediaKind)), metadata: result?.metadata ?? null };
      },
      details: async workID => workFromSourceManga(cacheManga(await instance.getMangaDetails(string(workID))), mediaKind, id),
      installments: async sourceWork => {
        const chapters = await refreshedChapters(sourceWork);
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
        const chapter = await resolvedChapter(installment);
        const details = await instance.getChapterDetails(chapter);
        return {
          id: string(details?.id, string(installment?.installmentId)),
          workId: string(details?.mangaId, string(sourceWork?.workId)),
          pages: (details?.pages ?? []).map(page => string(page?.url ?? page)).filter(Boolean)
        };
      },
      imagePageContent: ({ url }) => resource(url, id),
      ...(apiVersion === "1.1" ? {
        publicationContent: async installment => {
          const sourceWork = installment?.sourceWork ?? { workId: installment?.workId, workInfo: {} };
          const details = await instance.getChapterDetails(await resolvedChapter(installment));
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
var source=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});function t(e){"@babel/helpers - typeof";return t=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},t(e)}function n(e,n){if(t(e)!=`object`||!e)return e;var r=e[Symbol.toPrimitive];if(r!==void 0){var i=r.call(e,n||`default`);if(t(i)!=`object`)return i;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(n===`string`?String:Number)(e)}function r(e){var r=n(e,`string`);return t(r)==`symbol`?r:r+``}function i(e,t,n){return(t=r(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var a=class{constructor(){i(this,`requiresExplicitSubmission`,!1)}reloadForm(){let e=this.__underlying_formId;e&&Application.formDidChange(e)}};function o(e,t,n){return e[`__closure_selector-`+t]=n,Application.Selector(e,`__closure_selector-`+t)}function s(e,t){let n;return n=typeof e==`string`?{id:e}:e,{type:`listSection`,...n,items:t.filter(e=>e),allowAddition:!1,allowDeletion:!1,allowReorder:!1}}function c(e,t){return{id:e,type:`listSection`,header:t.header,footer:t.footer,allowAddition:t.onAddition!=null&&t.allowAddition==1,allowDeletion:t.onDeletion!=null&&t.allowDeletion==1,allowReorder:t.onReorder!=null&&t.allowReorder==1,onAddition:t.onAddition,onDeletion:t.onDeletion,onReorder:t.onReorder,items:t.items.filter(e=>e)}}function l(e,t){let n;return n=typeof e==`string`?{id:e}:e,{type:`flowSection`,...n,items:t.filter(e=>e)}}function u(e,t){if(t.maxItemCount<1)throw Error(`[${t.id}] maxItemCount must not be less than one`);if(t.minItemCount<0)throw Error(`[${t.id}] minItemCount must not be less than zero`);if(t.minItemCount>=t.maxItemCount&&t.maxItemCount>1)throw Error(`[${t.id}] minItemCount must be less than maxItemCount, or both must be one`);if(t.value.length<t.minItemCount)throw Error(`[${t.id}] value count must not be less than minItemCount`);if(!t.value.every(e=>t.items.some(t=>t.id===e)))throw Error(`[${t.id}] All provided values must be inside items`);let n=Object.keys(t.value).length;return(t.layout==`flow`?l:s)({id:t.id,header:t.header,footer:t.footer},t.items.map(r=>{let i=t.value.indexOf(r.id),a=i!==-1;return d(r.id,{title:r.title,value:a?{symbol:`checkmark`,style:`success`}:void 0,onSelect:o(e,`__select_${t.id}#${r.id}`,async()=>{if(a)n>t.minItemCount&&t.value.splice(i,1);else if(t.maxItemCount==1)t.value.splice(0,t.value.length,r.id);else if(n<t.maxItemCount)t.value.push(r.id);else return;t.onValueChange&&await Application.SelectorRegistry.selector(t.onValueChange)(),e.reloadForm()})})}))}function ee(e,t){let n=Object.keys(t.value).length;return(t.layout==`flow`?l:s)({id:t.id,header:t.header,footer:t.footer},t.items.map(r=>{let i=t.value[r.id],a,s;switch(i){case`included`:t.layout==`flow`?(s=`success`,a=void 0):(s=void 0,a={symbol:`checkmark`,style:`success`});break;case`excluded`:t.layout==`flow`?(s=`error`,a=void 0):(s=void 0,a={symbol:`xmark`,style:`error`});break;default:a=void 0,s=void 0;break}return d(r.id,{style:s,title:r.title,value:a,onSelect:o(e,`__multiselect_${t.id}#${r.id}`,async()=>{let a,o=!t.maximum||n<t.maximum,s=t.allowEmptySelection&&n==1||n>1;switch(i){case`included`:if(t.allowExclusion){a=`excluded`;break}if(s){a=void 0;break}else return;case`excluded`:if(s){a=void 0;break}else return;case void 0:if(o){a=`included`;break}else return}a==null?delete t.value[r.id]:t.value[r.id]=a,t.onValueChange&&await Application.SelectorRegistry.selector(t.onValueChange)(),e.reloadForm()})})}))}function d(e,t){return{...t,id:e,type:`labelRow`,isHidden:t.isHidden??!1,isSelectable:t.onSelect!=null}}function te(e,t){return{...t,id:e,type:`inputRow`,isHidden:t.isHidden??!1}}function f(e,t){return{...t,id:e,type:`toggleRow`,isHidden:t.isHidden??!1}}function p(e,t){let n=Object.keys(t.value).length;return h(e,{form:new re(t.title,t),title:t.title,subtitle:t.subtitle,value:n==1?`${(`items`in t?t.items.find(e=>e.id==t.value[0])?.title:t.options.find(e=>e.id==t.value[0])?.title)??`1 item`}`:`${Object.keys(t.value).length} items`,isHidden:t.isHidden})}function m(e,t){return h(e,{form:new ie(t.title,t),title:t.title,subtitle:t.subtitle,value:`${Object.keys(t.value).length} items`,isHidden:t.isHidden})}function ne(e,t){return{...t,id:e,type:`buttonRow`,isHidden:t.isHidden??!1}}function h(e,t){return{...t,id:e,type:`navigationRow`,isHidden:t.isHidden??!1}}var re=class extends a{constructor(e,t){super(),i(this,`title`,void 0),i(this,`params`,void 0),i(this,`states`,[]),i(this,`requiresExplicitSubmission`,!0),this.title=e,this.params=t,this.states=[...t.value]}getSections(){return[u(this,{id:`select`,value:this.states,layout:`layout`in this.params?this.params.layout:`list`,items:`items`in this.params?this.params.items:this.params.options,minItemCount:this.params.minItemCount,maxItemCount:this.params.maxItemCount,isHidden:this.params.isHidden})]}async formDidSubmit(){await Application.SelectorRegistry.selector(this.params.onValueChange)(this.states)}},ie=class extends a{constructor(e,t){super(),i(this,`title`,void 0),i(this,`params`,void 0),i(this,`states`,{}),i(this,`requiresExplicitSubmission`,!0),this.title=e,this.params=t,this.states={...t.value}}getSections(){return[ee(this,{id:`multiselect`,value:this.states,items:this.params.items,allowExclusion:this.params.allowExclusion,allowEmptySelection:this.params.allowEmptySelection,maximum:this.params.maximum,layout:this.params.layout})]}async formDidSubmit(){await Application.SelectorRegistry.selector(this.params.onValueChange)(this.states)}},ae=class extends Error{constructor(e,t){super(t),i(this,`onConfirmation`,void 0),i(this,`type`,`confirmationError`),this.onConfirmation=e}},g=class extends a{constructor(...e){super(...e),i(this,`requiresExplicitSubmission`,!0)}async formDidSubmit(){}formDidCancel(){}},_=class{constructor(e){i(this,`id`,void 0),this.id=e}registerInterceptor(){Application.registerInterceptor(this.id,Application.Selector(this,`interceptRequest`),Application.Selector(this,`interceptResponse`))}unregisterInterceptor(){Application.unregisterInterceptor(this.id)}};let v={},y={},b=async e=>{if(v[e]){await v[e],await b(e);return}v[e]=new Promise(t=>y[e]=()=>{delete v[e],t()})},oe=e=>{y[e]&&y[e]()};var se=class extends _{constructor(e,t){super(e),i(this,`options`,void 0),i(this,`promise`,void 0),i(this,`currentRequestsMade`,0),i(this,`lastReset`,Date.now()),i(this,`imageRegex`,new RegExp(/\.(avif|gif|jpeg|jpg|jxl|png|webp)(\?|$)/i)),this.options=t}async interceptRequest(e){return this.options.ignoreImages&&this.imageRegex.test(e.url)?e:(await b(this.id),await this.incrementRequestCount(),oe(this.id),e)}async interceptResponse(e,t,n){return n}async incrementRequestCount(){if(await this.promise,(Date.now()-this.lastReset)/1e3>this.options.bufferInterval&&(this.currentRequestsMade=0,this.lastReset=Date.now()),this.currentRequestsMade+=1,this.currentRequestsMade>=this.options.numberOfRequests){let e=(Date.now()-this.lastReset)/1e3;if(e<=this.options.bufferInterval){let t=this.options.bufferInterval-e;console.log(`[BasicRateLimiter] rate limit hit, sleeping for ${t}`),this.promise=Application.sleep(t)}}}},ce=class extends Error{constructor(e,t=`Cloudflare bypass is required`){super(t),i(this,`resolutionRequest`,void 0),i(this,`type`,`cloudflareError`),this.resolutionRequest=e}};function x(e){let t={},n=e.match(/^(?:([a-zA-Z][a-zA-Z\d+\-.]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);if(!n)throw Error(`Invalid URL string provided.`);if(n[1]!==void 0&&n[1]!==``&&(t.protocol=n[1]),n[2]!==void 0&&n[2]!==``){let e=n[2],r=``,i=``,a=e.indexOf(`@`);if(a!==-1){if(r=e.substring(0,a),i=e.substring(a+1),r!==``){let e=r.indexOf(`:`);e===-1?(t.username=r,t.password=``):(t.username=r.substring(0,e),t.password=r.substring(e+1))}}else i=e;if(i!==``)if(i.startsWith(`[`)){let e=i.indexOf(`]`);if(e===-1)throw Error(`Invalid IPv6 address in URL update.`);t.hostname=i.substring(0,e+1);let n=i.substring(e+1);n.startsWith(`:`)&&(t.port=n.substring(1))}else{let e=i.lastIndexOf(`:`);e!==-1&&i.indexOf(`:`)===e?(t.hostname=i.substring(0,e),t.port=i.substring(e+1)):(t.hostname=i,t.port=``)}}if(n[3]!==void 0&&n[3]!==``&&(t.path=n[3].startsWith(`/`)?n[3]:`/${n[3]}`),n[4]!==void 0){let e={},r=n[4].split(`&`);for(let t of r){if(!t)continue;let[n,r=``]=t.split(`=`);if(n===void 0)continue;let i=decodeURIComponent(n),a=decodeURIComponent(r);if(i in e){let t=e[i];Array.isArray(t)?t.push(a):e[i]=[t,a]}else e[i]=a}t.queryItems=e}return n[5]!==void 0&&(t.fragment=n[5]),t}var le=class{constructor(e){i(this,`protocol`,void 0),i(this,`hostname`,void 0),i(this,`path`,void 0),i(this,`username`,void 0),i(this,`password`,void 0),i(this,`port`,void 0),i(this,`queryItems`,void 0),i(this,`fragment`,void 0);let t=x(e);if(!t.hostname||!t.protocol)throw Error(`URL Hostname and Protocol are required`);this.hostname=t.hostname,this.protocol=t.protocol,this.path=t.path??``,this.username=t.username,this.password=t.password,this.port=t.port,this.queryItems=t.queryItems,this.fragment=t.fragment}toString(){let e=`${this.protocol}://`;if(this.username!==void 0&&this.username!==``&&(e+=this.username,this.password!==void 0&&this.password!==``&&(e+=`:${this.password}`),e+=`@`),e+=this.hostname,this.port!==void 0&&this.port!==``&&(e+=`:${this.port}`),this.path!==``&&(e+=this.path.startsWith(`/`)?this.path:`/${this.path}`),this.queryItems!==void 0){let t=Object.keys(this.queryItems),n=[];if(t.length>0)for(let e of t){let t=this.queryItems[e];if(Array.isArray(t))for(let r of t)n.push(`${encodeURIComponent(e)}=${encodeURIComponent(r)}`);else t!==void 0&&n.push(`${encodeURIComponent(e)}=${encodeURIComponent(t)}`)}e+=`?${n.join(`&`)}`}return this.fragment!==void 0&&(e+=`#${this.fragment}`),e}setProtocol(e){if(e===``)throw Error(`Protocol is required`);return this.protocol=e,this}setUsername(e){return e===``?this.username=void 0:this.username=e,this}setPassword(e){return e===``?this.password=void 0:this.password=e,this}setHostname(e){if(e===``)throw Error(`Hostname is required`);return this.hostname=e,this}setPort(e){return e===``?this.port=void 0:this.port=e,this}setPath(e){return this.path=e.startsWith(`/`)?e:`/${e}`,this}addPathComponent(e){return this.path=(this.path??``)+(e.startsWith(`/`)?e:`/${e}`),this}setQueryItems(e){return this.queryItems=e,this}setQueryItem(e,t){return this.queryItems===void 0&&(this.queryItems={}),this.queryItems[e]=t,this}removeQueryItem(e){return delete this.queryItems?.[e],this}setFragment(e){return this.fragment=e,this}update(e){let t;return t=typeof e==`string`?x(e):e,t.protocol!==void 0&&this.setProtocol(t.protocol),t.username!==void 0&&this.setUsername(t.username),t.password!==void 0&&this.setPassword(t.password),t.hostname!==void 0&&this.setHostname(t.hostname),t.port!==void 0&&this.setPort(t.port),t.path!==void 0&&this.setPath(t.path),t.queryItems!==void 0&&this.setQueryItems(t.queryItems),t.fragment!==void 0&&this.setFragment(t.fragment),this}};let ue=`cookie_store_cookies`;var de=class extends _{get cookies(){return Object.freeze(Object.values(this._cookies))}set cookies(e){let t={};for(let n of e)this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t,this.saveCookiesToStorage()}constructor(e){super(`cookie_store`),i(this,`options`,void 0),i(this,`_cookies`,{}),this.options=e,this.loadCookiesFromStorage()}async interceptRequest(e){return e.cookies={...e.cookies??{},...this.cookiesForUrl(e.url).reduce((e,t)=>(e[t.name]=t.value,e),{})},e}async interceptResponse(e,t,n){let r=this._cookies;for(let e of t.cookies){let t=this.cookieIdentifier(e);if(this.isCookieExpired(e)){delete r[t];continue}r[t]=e}return this._cookies=r,this.saveCookiesToStorage(),n}setCookie(e){this.isCookieExpired(e)||(this._cookies[this.cookieIdentifier(e)]=e,this.saveCookiesToStorage())}deleteCookie(e){delete this._cookies[this.cookieIdentifier(e)]}cookiesForUrl(e){let t=new le(e),n=t.hostname;if(!n)return[];let r={},i=t.path.startsWith(`/`)?t.path:`/${t.path}`,a=n.split(`.`),o=i.split(`/`);o.shift();let s=this.cookies;for(let e of s){if(this.isCookieExpired(e)){delete this._cookies[this.cookieIdentifier(e)];continue}let t=this.cookieSanitizedDomain(e).split(`.`);if(a.length<t.length||t.length==0)continue;let n=!0;for(let e=0;e<t.length;e++){let r=t.length-1-e,i=a.length-1-e;if(t[r]!=a[i]){n=!1;break}}if(!n)continue;let s=this.cookieSanitizedPath(e),c=s.split(`/`);c.shift();let l=0;if(i===s)l=2**53-1;else if(c.length===0||s===`/`)l=1;else if(i.startsWith(s)&&o.length>=c.length)for(let e=0;e<c.length&&c[e]===o[e];e++)l+=1;l<=0||(r[e.name]?.pathMatches??0)<l&&(r[e.name]={cookie:e,pathMatches:l})}return Object.values(r).map(e=>e.cookie)}cookieIdentifier(e){return`${e.name}-${this.cookieSanitizedDomain(e)}-${this.cookieSanitizedPath(e)}`}cookieSanitizedPath(e){return e.path?.startsWith(`/`)?e.path:`/`+(e.path??``)}cookieSanitizedDomain(e){return e.domain.replace(/^(www)?\.?/gi,``).toLowerCase()}isCookieExpired(e){return!!(e.expires&&e.expires.getTime()<=Date.now())}loadCookiesFromStorage(){if(this.options.storage==`memory`)return;let e=Application.getState(ue);if(!e){this._cookies={};return}let t={};for(let n of e)!n.expires||this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t}saveCookiesToStorage(){this.options.storage!=`memory`&&Application.setState(this.cookies.filter(e=>e.expires),ue)}},S;(function(e){e[e.NONE=0]=`NONE`,e[e.MANGA_CHAPTERS=1]=`MANGA_CHAPTERS`,e[e.CHAPTER_PROVIDING=1]=`CHAPTER_PROVIDING`,e[e.MANGA_PROGRESS=2]=`MANGA_PROGRESS`,e[e.MANGA_PROGRESS_PROVIDING=2]=`MANGA_PROGRESS_PROVIDING`,e[e.PROGRESS_PROVIDING=2]=`PROGRESS_PROVIDING`,e[e.DISCOVER_SECIONS=4]=`DISCOVER_SECIONS`,e[e.DISCOVER_SECIONS_PROVIDING=4]=`DISCOVER_SECIONS_PROVIDING`,e[e.DISCOVER_SECTION_PROVIDING=4]=`DISCOVER_SECTION_PROVIDING`,e[e.COLLECTION_MANAGEMENT=8]=`COLLECTION_MANAGEMENT`,e[e.MANAGED_COLLECTION_PROVIDING=8]=`MANAGED_COLLECTION_PROVIDING`,e[e.CLOUDFLARE_BYPASS_REQUIRED=16]=`CLOUDFLARE_BYPASS_REQUIRED`,e[e.CLOUDFLARE_BYPASS_PROVIDING=16]=`CLOUDFLARE_BYPASS_PROVIDING`,e[e.SETTINGS_UI=32]=`SETTINGS_UI`,e[e.SETTINGS_FORM_PROVIDING=32]=`SETTINGS_FORM_PROVIDING`,e[e.MANGA_SEARCH=64]=`MANGA_SEARCH`,e[e.SEARCH_RESULTS_PROVIDING=64]=`SEARCH_RESULTS_PROVIDING`,e[e.SEARCH_RESULT_PROVIDING=64]=`SEARCH_RESULT_PROVIDING`})(S||(S={}));var C;(function(e){e.EVERYONE=`SAFE`,e.MATURE=`MATURE`,e.ADULT=`ADULT`})(C||(C={}));var w;(function(e){e[e.featured=0]=`featured`,e[e.simpleCarousel=1]=`simpleCarousel`,e[e.prominentCarousel=2]=`prominentCarousel`,e[e.chapterUpdates=3]=`chapterUpdates`,e[e.genres=4]=`genres`})(w||(w={})),Object.freeze({items:[],metadata:void 0});let T=`https://mangadot.net`,fe=[{id:``,title:`Any`},{id:`Ongoing`,title:`Ongoing`},{id:`Completed`,title:`Completed`},{id:`Hiatus`,title:`Interrupted`}],pe=[{id:`daily`,title:`Day`},{id:`weekly`,title:`Week`},{id:`monthly`,title:`Month`}],E=[{id:``,title:`Any`},{id:`JP`,title:`Manga`},{id:`KR`,title:`Manhwa`},{id:`CN&TW`,title:`Manhua`},{id:`ONESHOT`,title:`Oneshot`}],D=[{id:`0`,title:`No`},{id:`1`,title:`Yes`},{id:`both`,title:`Both`}],O=[{id:`most_viewed`,title:`Most Viewed`},{id:`top_rated`,title:`Top Rated`},{id:`most_tracked`,title:`Most Tracked Comics`},{id:`latest_updates`,title:`Latest updates`},{id:`recently_added`,title:`Recently Added`},{id:`genres`,title:`Genres`},{id:`themes`,title:`Themes`},{id:`demographics`,title:`Demographics`}];function me(e){return e.replaceAll(`-`,`@#@`).replaceAll(`'`,`&#@`).replaceAll(` `,`#@&`)}function k(e){return e.replaceAll(`@#@`,`-`).replaceAll(`&#@`,`'`).replaceAll(`#@&`,` `)}function A(){return Application.getState(`content_type`)??[``]}function j(){return Application.getState(`section_content_type`)??[``]}function M(){return Application.getState(`hidden_genres`)??[]}function N(){return Application.getState(`hidden_demographic`)??[]}function P(){return Application.getState(`hidden_themes`)??[]}function F(){return Application.getState(`hidden_more`)??[]}function I(){return Application.getState(`english_only_content`)??!1}function L(){return Application.getState(`show_adult_content`)??[`0`]}function R(){return Application.getState(`range_type`)??!1}function z(){return Application.getState(`multipage_section`)??!1}function he(){return Application.getState(`sections`)??O}function B(e){return{id:me(e),title:k(e)}}function V(e=``){return{genres:{...Object.fromEntries(M().map(e=>[e,`excluded`])),...e.length>0?{[e]:`included`}:{}},demographic:Object.fromEntries(N().map(e=>[e,`excluded`])),themes:Object.fromEntries(P().map(e=>[e,`excluded`])),more:Object.fromEntries(F().map(e=>[e,`excluded`])),origin:A().filter(e=>e!==``),adult:L()}}function H(){let e=Application.getState(`search_filter`);if(e===void 0)return{demographic:[],genre:[],more:[],themeAndContent:[]};try{return JSON.parse(e)}catch{return{demographic:[],genre:[],more:[],themeAndContent:[]}}}async function U(e){let t=H();await W(t.genre.length+t.themeAndContent.length+t.demographic.length+t.more.length===0,e)}async function W(e,t){if(Number(Application.getState(`last_genres_fetch`)??0)+172800>new Date().valueOf()/1e3&&!e){Application.getState(`search_filter`)===void 0&&await W(!0,t);return}let n=await t.getFilters();n.sort((e,t)=>e.localeCompare(t));let r=_e(n);Application.setState(JSON.stringify(r),`search_filter`),Application.setState(String(new Date().valueOf()/1e3),`last_genres_fetch`)}let ge={Shounen:`Demographic`,Seinen:`Demographic`,Shoujo:`Demographic`,Josei:`Demographic`,Kids:`Demographic`,Action:`Genre`,Adventure:`Genre`,Comedy:`Genre`,Drama:`Genre`,Fantasy:`Genre`,Horror:`Genre`,Mystery:`Genre`,Romance:`Genre`,"Sci-Fi":`Genre`,"Slice of Life":`Genre`,Sports:`Genre`,Thriller:`Genre`,Tragedy:`Genre`,Psychological:`Genre`,Supernatural:`Genre`,Mecha:`Genre`,Historical:`Genre`,Isekai:`Theme & content`,Ecchi:`Theme & content`,Harem:`Theme & content`,"Martial Arts":`Theme & content`,"School Life":`Theme & content`,Magic:`Theme & content`,Military:`Theme & content`,Music:`Theme & content`,Demons:`Theme & content`,Vampire:`Theme & content`,Game:`Theme & content`,Cooking:`Theme & content`,Medical:`Theme & content`,Webtoon:`Theme & content`};function _e(e){let t={demographic:[],genre:[],themeAndContent:[],more:[]};for(let n of e)switch(ge[n]){case`Demographic`:t.demographic.push(B(n));break;case`Genre`:t.genre.push(B(n));break;case`Theme & content`:t.themeAndContent.push(B(n));break;default:t.more.push(B(n));break}return t}var ve=class extends g{getSearchQueryMetadata(){return this.searchMetadata}constructor(e){super(),i(this,`searchMetadata`,void 0),e.metadata===void 0?this.searchMetadata=V():this.searchMetadata=e.metadata}getSections(){return[s(`genres`,this.getGenresFilter()),s(`status`,this.getStatusFilter()),s(`origin`,this.getOriginFilter()),s(`adult`,[p(`adultToggle`,{title:`Show Adult results`,value:this.searchMetadata.adult??L(),options:D,minItemCount:1,maxItemCount:1,onValueChange:Application.Selector(this,`handleAdult`)})]),s(`author`,[h(`author_filter`,{title:`Authors`,subtitle:this.searchMetadata.author?.flatMap(k).join(`, `)??``,form:new ye(this.searchMetadata)})]),s(`artist`,[h(`artist_filter`,{title:`Artists`,subtitle:this.searchMetadata.artist?.flatMap(k).join(`, `)??``,form:new be(this.searchMetadata)})])]}getGenresFilter(){return[m(`genres`,{title:`Genres`,layout:`list`,onValueChange:Application.Selector(this,`handleGenres`),items:H().genre,value:this.searchMetadata.genres??{},allowEmptySelection:!0,allowExclusion:!0,isHidden:!1}),m(`demographic`,{title:`Demographic`,layout:`list`,onValueChange:Application.Selector(this,`handleDemographic`),items:H().demographic,value:this.searchMetadata.demographic??{},allowEmptySelection:!0,allowExclusion:!0,isHidden:!1}),m(`themes`,{title:`Themes`,layout:`list`,onValueChange:Application.Selector(this,`handleThemes`),items:H().themeAndContent,value:this.searchMetadata.themes??{},allowEmptySelection:!0,allowExclusion:!0,isHidden:!1}),m(`more`,{title:`More`,layout:`list`,onValueChange:Application.Selector(this,`handleMore`),items:H().more,value:this.searchMetadata.more??{},allowEmptySelection:!0,allowExclusion:!0,isHidden:!1})]}getStatusFilter(){return[p(`status`,{title:`Status`,layout:`list`,onValueChange:Application.Selector(this,`handleStatus`),items:fe,value:this.searchMetadata.status&&this.searchMetadata.status.length>0?this.searchMetadata.status:[``],minItemCount:1,maxItemCount:1,isHidden:!1})]}getOriginFilter(){return[p(`origin`,{title:`Content Type`,layout:`list`,onValueChange:Application.Selector(this,`handleOrigin`),items:E,value:this.searchMetadata.origin&&this.searchMetadata.origin.length>0?this.searchMetadata.origin:[``],minItemCount:1,maxItemCount:E.length,isHidden:!1})]}async handleAdult(e){this.searchMetadata.adult=e}async handleDemographic(e){this.searchMetadata.demographic=e}async handleThemes(e){this.searchMetadata.themes=e}async handleMore(e){this.searchMetadata.more=e}async handleGenres(e){this.searchMetadata.genres=e}async handleStatus(e){this.searchMetadata.status=e}async handleOrigin(e){let t=(this.searchMetadata?.origin??[``]).includes(``),n=e.includes(``);t&&e.length>1?e=e.filter(e=>e!==``):!t&&n&&(e=[``]),this.searchMetadata.origin=e}},ye=class extends g{constructor(e){super(),i(this,`authorMetadata`,void 0),i(this,`authorFiltered`,[]),i(this,`savedAuthorFiltered`,[]),i(this,`searchedValue`,``),e===void 0?this.authorMetadata={author:[]}:this.authorMetadata=e,this.savedAuthorFiltered=this.authorMetadata.author?this.authorMetadata.author:[]}getSearchQueryMetadata(){return this.savedAuthorFiltered.length>0&&(this.authorMetadata.author=this.savedAuthorFiltered),this.authorMetadata}async formDidSubmit(){this.savedAuthorFiltered.length>0&&(this.authorMetadata.author=this.savedAuthorFiltered)}getSections(){return this.getAuthorFilter()}getAuthorFilter(){return[s(`author`,[te(`author`,{title:`Search Author`,value:this.searchedValue,onValueChange:Application.Selector(this,`handleAuthorLabel`)})]),...this.authorFiltered.length>0?[u(this,{id:`authorSearch`,layout:`list`,value:this.savedAuthorFiltered??[],items:this.authorFiltered.map(e=>B(e)),minItemCount:0,maxItemCount:this.authorFiltered.length})]:[],...this.savedAuthorFiltered&&this.savedAuthorFiltered.length>0?[u(this,{id:`selections`,layout:`list`,value:this.savedAuthorFiltered??[],items:this.savedAuthorFiltered.map(e=>B(e)),minItemCount:0,maxItemCount:this.savedAuthorFiltered.length})]:[]]}async handleAuthorLabel(e){if(this.searchedValue=e,e.length>2){let t=await $.api.getAuthor(e);this.authorFiltered=t.suggestions}}},be=class extends g{constructor(e){super(),i(this,`artistMetadata`,void 0),i(this,`artistsFiltered`,[]),i(this,`savedArtistFiltered`,[]),i(this,`searchedValue`,``),e===void 0?this.artistMetadata={artist:[]}:this.artistMetadata=e,this.savedArtistFiltered=this.artistMetadata.artist?this.artistMetadata.artist:[]}getSearchQueryMetadata(){return this.savedArtistFiltered.length>0&&(this.artistMetadata.artist=this.savedArtistFiltered),this.artistMetadata}async formDidSubmit(){this.savedArtistFiltered.length>0&&(this.artistMetadata.artist=this.savedArtistFiltered)}getSections(){return this.getArtistsFilter()}getArtistsFilter(){return[s(`artist`,[te(`artist`,{title:`Search Artist`,value:this.searchedValue,onValueChange:Application.Selector(this,`handleArtistLabel`)})]),...this.artistsFiltered.length>0?[u(this,{id:`artistSearch`,layout:`list`,value:this.savedArtistFiltered??[],items:this.artistsFiltered.map(e=>B(e)),minItemCount:0,maxItemCount:this.artistsFiltered.length})]:[],...this.savedArtistFiltered&&this.savedArtistFiltered.length>0?[u(this,{id:`selections`,layout:`list`,value:this.savedArtistFiltered??[],items:this.savedArtistFiltered.map(e=>B(e)),minItemCount:0,maxItemCount:this.savedArtistFiltered.length})]:[]]}async handleArtistLabel(e){if(this.searchedValue=e,e.length>2){let t=await $.api.getArtist(e);this.artistsFiltered=t.suggestions}}},xe=class extends a{constructor(e){super(),i(this,`api`,void 0),this.api=e}getSections(){let e=H();return[s({id:`update_settings`,header:`Default Search Filter`},[p(`type`,{title:`Content Type`,subtitle:`This settings only as default search filter`,value:A(),options:E,minItemCount:0,maxItemCount:E.length,onValueChange:Application.Selector(this,`handleTypeStatusChange`)}),p(`hide_genres`,{title:`Hide Genres`,subtitle:`Default value for contents`,value:M(),options:e.genre,minItemCount:0,maxItemCount:e.genre.length,onValueChange:Application.Selector(this,`handleHideGenresStatusChange`)}),p(`hide_demographic`,{title:`Hide Demographic`,subtitle:`Default value for contents`,value:N(),options:e.demographic,minItemCount:0,maxItemCount:e.demographic.length,onValueChange:Application.Selector(this,`handleHideDemographicStatusChange`)}),p(`hide_themes`,{title:`Hide Themes`,subtitle:`Default value for contents`,value:P(),options:e.themeAndContent,minItemCount:0,maxItemCount:e.themeAndContent.length,onValueChange:Application.Selector(this,`handleHideThemesStatusChange`)}),p(`hide_more`,{title:`Hide More`,subtitle:`Default value for contents`,value:F(),options:e.more,minItemCount:0,maxItemCount:e.more.length,onValueChange:Application.Selector(this,`handleHideMoreStatusChange`)})]),s({id:`section_settings`,header:`Sections Settings`,footer:`This settings apply on sections only`},[p(`section_type`,{title:`Content Type`,value:j(),options:E,minItemCount:1,maxItemCount:E.length,onValueChange:Application.Selector(this,`handleSectionTypeStatusChange`)}),f(`range_type`,{title:`Use Time range in sections`,subtitle:`Day/Week/Month ranges may return fewer items and do not contain some information`,value:R(),onValueChange:Application.Selector(this,`handleRangeTypeStatusChange`)}),f(`multipage_section`,{title:`Use Multipage on Latest Update`,subtitle:`Using multipage might have different results from the website homepage`,value:z(),onValueChange:Application.Selector(this,`handleMultipageStatusChange`)}),h(`sectionOrder`,{title:`Sections Order`,subtitle:`Sections Order`,form:new Se})]),s({id:`global_settings`,header:`Global Settings`},[p(`toggle_adult`,{title:`Show Adult results`,value:L(),options:D,minItemCount:1,maxItemCount:1,onValueChange:Application.Selector(this,`handleShowAdultStatusChange`)})]),s({id:`chapter_settings`,footer:`Chapters Settings`},[f(`en_only`,{title:`Show English only chapters`,value:I(),subtitle:"Fetch only English chapters. Will need a `Reload Chapters` to update the existing one",onValueChange:Application.Selector(this,`handleEnglishOnlyStatusChange`)})]),s({id:`reset_settings`,footer:`Filters`},[ne(`reload_genres`,{title:`Refresh genres filters`,onSelect:Application.Selector(this,`resetFiltersDialog`)})])]}async updateValue(e,t){Application.setState(e,t),this.reloadForm()}async handleShowAdultStatusChange(e){await this.updateValue(e,`show_adult_content`)}async handleEnglishOnlyStatusChange(e){await this.updateValue(e,`english_only_content`)}async handleTypeStatusChange(e){let t=A().includes(``),n=e.includes(``);t&&e.length>1?e=e.filter(e=>e!==``):!t&&n&&(e=[``]),await this.updateValue(e,`content_type`)}async handleRangeTypeStatusChange(e){Application.invalidateDiscoverSections(),await this.updateValue(e,`range_type`)}async handleMultipageStatusChange(e){Application.invalidateDiscoverSections(),await this.updateValue(e,`multipage_section`)}async handleSectionTypeStatusChange(e){let t=j().includes(``),n=e.includes(``);t&&e.length>1?e=e.filter(e=>e!==``):!t&&n&&(e=[``]),await this.updateValue(e,`section_content_type`)}async handleHideGenresStatusChange(e){await this.updateValue(e,`hidden_genres`)}async handleHideDemographicStatusChange(e){await this.updateValue(e,`hidden_demographic`)}async handleHideThemesStatusChange(e){await this.updateValue(e,`hidden_themes`)}async handleHideMoreStatusChange(e){await this.updateValue(e,`hidden_more`)}async resetFiltersDialog(){throw new ae(Application.Selector(this,`resetFilters`),`Do you want to refresh genres filters?`)}async resetFilters(){await W(!0,this.api)}};function G(){return Application.getState(`deleted_sections`)??[]}async function K(e){Application.invalidateDiscoverSections(),Application.setState(e,`sections`)}async function q(e){Application.setState(e,`deleted_sections`)}function J(){return Application.getState(`sections`)??O}var Se=class extends a{getSections(){let e=Application.Selector(this,`rowDidReorder`),t=Application.Selector(this,`rowDidDelete`);return[{...c(`edit`,{id:`edit`,header:`Section order`,footer:`Long press to reorder, swipe to hide`,items:J().map(e=>this.itemRow(e))}),allowDeletion:!0,allowReorder:!0,onReorder:e,onDeletion:t},...G().length>0?[new Ce().getDeletedSections()]:[],s(`status`,[ne(`reset`,{title:`Reset all Sections`,isHidden:G().length==0,onSelect:Application.Selector(this,`resetFiltersDialog`)})])]}async resetFiltersDialog(){throw new ae(Application.Selector(this,`handleLimitStatusChangeReset`),`Do you want to restore all deleted sections?`)}async handleLimitStatusChangeReset(){await K(O),await q([]),this.reloadForm()}itemRow(e){return d(e.id,{title:e.title})}async rowDidDelete(e){let t=G(),n=J();n.splice(e,1).forEach(e=>{t.push(e)}),await q(t),await K(n),this.reloadForm()}async rowDidReorder(e,t){let n=J(),[r]=n.splice(e,1);r&&n.splice(t,0,r),await K(n),this.reloadForm(),Application.invalidateDiscoverSections()}},Ce=class{constructor(){i(this,`onSelectLabelProxy`,new Proxy(this,{has(e,t){return typeof t==`string`&&t.startsWith(`onSelect_`)?!0:Object.hasOwn(e,t)},get(e,t){if(typeof t==`string`&&t.startsWith(`onSelect_`)){let n=t.slice(9);return async()=>{await e.onSelect(n)}}else return e[t]}})),i(this,`deletedForms`,G())}getDeletedSections(){return s({id:`addSectionSelect`,footer:`Tap to restore`},this.deletedForms.flatMap(e=>d(e.id,{title:e.title,onSelect:Application.Selector(this.onSelectLabelProxy,`onSelect_`+e.id)})))}async onSelect(e){let t=J(),n=this.deletedForms.filter(t=>t.id===e);t.push(n[0]),await K(t),await q(this.deletedForms.filter(t=>t.id!==e)),this.deletedForms=G()}},we=class extends _{async interceptRequest(e){return{...e,headers:{"user-agent":await Application.getDefaultUserAgent(),...e.headers}}}async interceptResponse(e,t,n){if(t.headers?.[`cf-mitigated`]===`challenge`)throw new ce({url:`${T}/`,method:e.method??`GET`,headers:{"user-agent":await Application.getDefaultUserAgent()}});return n}},Te=class{async fetchApi(e){let[,t]=await Application.scheduleRequest(e);try{return JSON.parse(Application.arrayBufferToUTF8String(t))}catch{throw Error(`Failed to fetch data from ${e.url} (Invalid response)`)}}async buildApiRequest(e){let t=new le(T);if((Array.isArray(e.path)?e.path:[e.path]).forEach(e=>t.addPathComponent(e)),e.query)for(let[n,r]of Object.entries(e.query))t.setQueryItem(n,r);let n={url:t.toString(),method:`GET`};return e.headers!==void 0&&(n.headers=e.headers),this.fetchApi(n)}buildTagSection(e,t){return{items:e.filter(e=>!t.includes(e.id)).map(e=>({type:`genresCarouselItem`,searchQuery:{title:``,metadata:V(e.id)},name:e.title,contentRating:C.EVERYONE}))}}async getRangeSection(e){return{items:pe.map(t=>({type:`genresCarouselItem`,searchQuery:{title:``,metadata:{range:t.id,sectionName:e}},name:t.title,contentRating:C.EVERYONE}))}}async getGenreSection(){return this.buildTagSection(H().genre,M())}async getDemographicSection(){return this.buildTagSection(H().demographic,N())}async getThemesSection(){return this.buildTagSection(H().themeAndContent,P())}async getSection(e,t){return e===`most_viewed`?this.getMostViewed(t):e===`latest_updates`?this.getLatestUpdateSection(t):this.getAllTimesSection(e,t)}async getAllTimesSection(e,t){let n={path:[`api`,`manga`,`section`,e.replaceAll(`_`,`-`)],query:{origin:j().join(`,`).replaceAll(`&`,`,`),adult:L(),page:t.toString()}};return this.buildApiRequest(n)}getMostViewed(e){let t={path:[`api`,`search`],query:{page:e.toString(),origin:j().join(`,`).replaceAll(`&`,`,`),sortBy:`views`,sortOrder:`desc`,adult:L()}};return this.buildApiRequest(t)}async getLatestUpdateSection(e){if(z()){let t={path:[`api`,`manga`,`section`,`latest-updates`],query:{origin:j().join(`,`).replaceAll(`&`,`,`),adult:L(),page:e.toString()}};return this.buildApiRequest(t)}else{let e={path:[`api`,`manga`,`section`],query:{id:`latest_updates`,origin:j().join(`,`).replaceAll(`&`,`,`),adult:L(),limit:`100`}};return this.buildApiRequest(e)}}async getMangaData(e){let t={path:[`api`,`manga`,e]};return this.buildApiRequest(t)}async getChapterList(e){let t={path:[`api`,`manga`,e,`chapters`,`list`],query:I()?{lang:`en`}:{}};return this.buildApiRequest(t)}async getVolumes(e){let t={path:[`api`,`manga`,e,`volumes`]};return this.buildApiRequest(t)}async getSearch(e,t,n){let r={...e.metadata?.genres,...e.metadata?.demographic,...e.metadata?.more,...e.metadata?.themes},i=Object.entries(r).map(([e,t])=>{let n=k(e);return t===`excluded`?`-${n}`:n}),[a,o]=n.id.split(`$`),s={path:[`api`,`search`],query:{...e.title&&{search:e.title},page:t.toString(),...i.length&&{genres:i.join(`,`)},...e.metadata?.origin?.length&&{origin:(e.metadata?.origin??[]).join(`,`).replaceAll(`&`,`,`)},...e.metadata?.status?.length&&{status:(e.metadata?.status??[]).join(`,`)},...e.metadata?.author?.length&&{author:(e.metadata?.author??[]).join(`,`)},...e.metadata?.artist?.length&&{artist:(e.metadata?.artist??[]).join(`,`)},sortBy:a,sortOrder:o||``,adult:e.metadata?.adult??L()}};return this.buildApiRequest(s)}async getChapterPages(e,t,n){let r={path:[`api`,n===`trusted`?`uploads`:`chapters`,e,`images`],headers:{referer:`${T}/manga/${t}`}};return this.buildApiRequest(r)}async getFilters(){return this.buildApiRequest({path:[`api`,`manga`,`genres`]})}async getAuthor(e){let t={path:[`api`,`manga`,`people-suggest`],query:{kind:`author`,q:e}};return this.buildApiRequest(t)}async getArtist(e){let t={path:[`api`,`manga`,`people-suggest`],query:{kind:`artist`,q:e}};return this.buildApiRequest(t)}async MangaSectionRequestToSearchResponse(e,t){let n={path:[`api`,`manga`,`section`],query:{id:e,origin:j().join(`,`).replaceAll(`&`,`,`),adult:L(),range:t,limit:`100`}};return{items:(await this.buildApiRequest(n)).items.map(e=>({mangaId:e.id.toString(),title:e.title,subtitle:`Ch. ${e.chapter_count} | ★ ${e.avg_rating}`,imageUrl:`${T}${e.photo}`,contentRating:e.is_blurworthy?C.ADULT:C.EVERYONE})),metadata:void 0}}};function Y(e){if(e==null)return[];if(Array.isArray(e))return e;try{return JSON.parse(e)}catch{return[e]}}function X(e){return Y(e.authors).join(`,`)}function Z(e){return e?new Date(e.split(`.`)[0].split(`+`)[0].replace(` `,`T`)):new Date}function Q(e){if(e.is_adult)return C.ADULT;if(e.is_blurworthy)return C.MATURE;switch(e.content_rating){case`safe`:return C.EVERYONE;case`suggestive`:return C.EVERYONE;case`erotica`:return C.MATURE;case`pornographic`:return C.ADULT;default:return C.EVERYONE}}let Ee=(e,t)=>{let n=e.manga;return{mangaId:n.id.toString(),mangaInfo:{thumbnailUrl:`${T}${n.photo}`,synopsis:n.description,primaryTitle:n.title,secondaryTitles:Y(n.alt_titles),contentRating:Q(n),status:n.status,artist:Y(n.artists).join(`,`),author:X(n),bannerUrl:`${T}${n.banner_image}`,artworkUrls:[`${T}${n.banner_image}`,...t],rating:n.avg_rating?n.avg_rating/10:0,tagGroups:[{id:`genres`,title:`Genres`,tags:n.genres.map(e=>B(e))}],shareUrl:`${T}/manga/${n.id}`}}},De=(e,t)=>e.map(e=>({chapterId:e.id.toString(),sourceManga:t,langCode:e.language,chapNum:e.chapter_number??0,title:e.chapter_title,version:e.group_name,volume:e.volume_number??0,sortingIndex:e.chapter_number??0,publishDate:Z(e.date_added),creationDate:Z(e.date_added),additionalInfo:{upload:e.uploader_upload_status?.toString()??``}})),Oe=(e,t)=>{let n=[],r=t?.page??1;return e.manga_list.forEach(e=>{n.push({mangaId:e.id.toString(),title:e.title,subtitle:X(e),imageUrl:`${T}${e.photo}`,contentRating:Q(e)})}),{items:n,metadata:e.pagination.total_pages>r?{page:r+1}:void 0}},ke=(e,t)=>{if(!e?.images||!Array.isArray(e.images))throw Error(`pages.images doesn't exist`);return{id:t.chapterId,mangaId:t.sourceManga.mangaId,pages:e.images.map(e=>`${T}${e.url}`)}},Ae=(e,t,n)=>{let r=[],i=`manga_list`in e;return i&&(r=e.manga_list),`items`in e&&(r=e.items),{items:r.map(e=>{let t={mangaId:e.id.toString(),title:e.title,imageUrl:`${T}${e.photo}`,contentRating:i?Q(e):e.is_blurworthy?C.ADULT:C.EVERYONE},r={symbol:`star.fill`,text:`${e.avg_rating}`},a={symbol:`book.fill`,text:`${e.status}`},o;switch(e.avg_rating!=null&&e.status?o=[r,a]:e.avg_rating==null?e.status&&(o=[a]):o=[r],n){case`chapterUpdatesCarouselItem`:return{...t,type:n,subtitle:i?X(e):`Ch. ${e.chapter_count} | ★ ${e.avg_rating}`,chapterId:e.chapter_count.toString(),publishDate:Z(e.last_chapter_date)};case`featuredCarouselItem`:return{...t,type:n,supertitle:i?X(e):`Ch. ${e.chapter_count} | ★ ${e.avg_rating}`,summary:i?e.description:``,infoItems:o};case`prominentCarouselItem`:return{...t,type:n,subtitle:i?X(e):`Ch. ${e.chapter_count} | ★ ${e.avg_rating}`};default:return{...t,type:`simpleCarouselItem`,subtitle:i?X(e):`Ch. ${e.chapter_count} | ★ ${e.avg_rating}`}}}),metadata:i&&e.pagination.total_pages>t?{page:t+1}:void 0}};var je=class{constructor(){i(this,`api`,new Te),i(this,`globalRateLimiter`,new se(`rateLimiter`,{numberOfRequests:5,bufferInterval:1,ignoreImages:!0})),i(this,`mainInterceptor`,new we(`main`)),i(this,`cookieStorageInterceptor`,new de({storage:`stateManager`}))}async initialise(){this.globalRateLimiter.registerInterceptor(),this.cookieStorageInterceptor.registerInterceptor(),this.mainInterceptor.registerInterceptor()}async getSettingsForm(){return await U(this.api),new xe(this.api)}async getMangaDetails(e){return Ee(await this.api.getMangaData(e),(await this.api.getVolumes(e)).map(e=>`${T}${e.cover_url}`))}async getChapters(e){return De(await this.api.getChapterList(e.mangaId),e)}async getChapterDetails(e){return ke(await this.api.getChapterPages(e.chapterId,e.sourceManga.mangaId,e.additionalInfo?.upload),e)}async getDiscoverSections(){let e={most_viewed:{id:`most_viewed`,title:`Most Viewed`,type:w.featured},latest_updates:{id:`latest_updates`,title:`Latest updates`,type:w.chapterUpdates},most_tracked:{id:`most_tracked`,title:`Most Tracked Comics`,type:R()?w.genres:w.simpleCarousel},top_rated:{id:`top_rated`,title:`Top Rated`,type:R()?w.genres:w.prominentCarousel},recently_added:{id:`recently_added`,title:`Recently Added`,type:R()?w.genres:w.simpleCarousel},genres:{id:`genres`,title:`Genres`,type:w.genres},themes:{id:`themes`,title:`Themes`,type:w.genres},demographics:{id:`demographics`,title:`Demographics`,type:w.genres}};return he().map(t=>e[t.id]).filter(Boolean)}async getDiscoverSectionItems(e,t){if(await U(this.api),e.id===`genres`)return this.api.getGenreSection();if(e.id===`demographics`)return this.api.getDemographicSection();if(e.id===`themes`)return this.api.getThemesSection();if(R()){if(e.id===`most_tracked`)return this.api.getRangeSection(`most_tracked`);if(e.id===`top_rated`)return this.api.getRangeSection(`top_rated`);if(e.id===`recently_added`)return this.api.getRangeSection(`recently_added`)}let n=t?.page??1;return Ae(await this.api.getSection(e.id,n),n,{most_viewed:`featuredCarouselItem`,latest_updates:`chapterUpdatesCarouselItem`,most_tracked:`simpleCarouselItem`,top_rated:`prominentCarouselItem`,recently_added:`simpleCarouselItem`}[e.id]??`simpleCarouselItem`)}async cloudflareBypassCompleted(e,t,n){for(let e of t)e.name==`cf_clearance`&&this.cookieStorageInterceptor.setCookie(e)}async getAdvancedSearchForm(e){return await U(this.api),new ve(e)}async getSearchResults(e,t,n){let r=n;r.id=r.id.split(e.title.length>0?`#title`:`#empty`)[0];let i=t?.page??1;return e.metadata===void 0&&(e.metadata=V()),e.metadata.range&&e.metadata.sectionName?this.api.MangaSectionRequestToSearchResponse(e.metadata.sectionName,e.metadata.range):Oe(await this.api.getSearch(e,i,r),t)}async getSortingOptions(e){let t=e.title.length>0?`#title`:``,n=[{id:`latest$desc#empty`,label:`Default`},{id:`latest$asc`,label:`Latest ↑`},{id:`latest$desc`,label:`Latest ↓`},{id:`alphabetical$asc`,label:`A-Z`},{id:`alphabetical$desc`,label:`Z-A`},{id:`chapters$asc`,label:`Chapters ↑`},{id:`chapters$desc`,label:`Chapters ↓`},{id:`views$asc`,label:`Most Viewed ↑`},{id:`views$desc`,label:`Most Viewed ↓`},{id:`tracked$asc`,label:`Most tracked ↑`},{id:`tracked$desc`,label:`Most tracked ↓`},{id:`rating$asc`,label:`Top Rated ↑`},{id:`rating$desc`,label:`Top Rated ↓`}];return e.title.length>0&&(n.unshift({id:`relevance$desc`+t,label:`Relevance`}),n=n.filter(e=>e.id!==`latest$desc#empty`)),n}};let $=new je;return e.MangaDot=$,e.MangaDotExtension=je,e})({});

/* manko registration footer. */
PaperbackCompat.registerContent("MangaDot", source["MangaDot"], {"apiVersion":"1.0"});
