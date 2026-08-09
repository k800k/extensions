/*!
 * MangaBat for manko
 * SPDX-License-Identifier: Apache-2.0
 * Source-owned JavaScript port; generated from extensions/content/MangaBat/src.
 * Algorithm reference: https://github.com/Aidoku-Community/sources
 * Reference commit: 1faa9c5cfbf67af7cd18a302045a8d093e35867f
 * Reference paths: sources/en.mangabat/src/lib.rs, templates/mangabox/src/lib.rs, templates/mangabox/src/imp.rs, templates/mangabox/src/helpers.rs, templates/mangabox/src/models.rs
 */

/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

function mrCreateRuntime(configuration) {
  const allowedHosts = new Set(configuration.allowedHosts.map(host => host.toLowerCase()));
  const dynamicOrigins = new Set();
  let runtimeContext;

  function context() {
    const value = runtimeContext || globalThis.manko?.context;
    if (!value) throw operationError("ExtensionRuntimeError", "manko runtime context is unavailable");
    return value;
  }

  function initialize(value) {
    runtimeContext = value || globalThis.manko?.context;
    context();
  }

  function operationError(name, message, type, url) {
    const error = new Error(message);
    error.name = name;
    if (type) error.type = type;
    if (url) error.url = url;
    return error;
  }

  function header(headers, name) {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers || {})) {
      if (key.toLowerCase() === wanted) return String(value);
    }
    return "";
  }

  function hostAllowed(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (allowedHosts.has(host)) return true;
    for (const declaration of allowedHosts) {
      if (declaration.startsWith("*.") && host.endsWith(declaration.slice(1)) && host !== declaration.slice(2)) return true;
    }
    return false;
  }

  function parsedURL(value, baseURL = configuration.baseURL) {
    let parsed;
    try {
      parsed = new URL(String(value || ""), baseURL);
    } catch {
      throw operationError("InvalidResponseError", `${configuration.name} supplied an invalid URL`, "invalidResponse");
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
      throw operationError("InvalidResponseError", `${configuration.name} supplied an invalid HTTP(S) URL`, "invalidResponse");
    }
    return parsed;
  }

  function registerDynamicDestination(value, baseURL = configuration.baseURL) {
    const parsed = parsedURL(value, baseURL);
    dynamicOrigins.add(parsed.origin);
    return parsed;
  }

  function url(value, baseURL = configuration.baseURL) {
    const parsed = parsedURL(value, baseURL);
    if ((parsed.protocol !== "https:" || !hostAllowed(parsed.hostname)) && !dynamicOrigins.has(parsed.origin)) {
      throw operationError("HostNotAllowedError", `${configuration.name} supplied an unregistered HTTP(S) destination`, "hostNotAllowed");
    }
    return parsed;
  }

  function bytes(base64) {
    if (typeof atob === "function") {
      const binary = atob(base64 || "");
      const result = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) result[index] = binary.charCodeAt(index);
      return result;
    }
    return new Uint8Array(context().encoding.fromBase64(base64 || ""));
  }

  function base64(value) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (typeof btoa === "function") {
      let binary = "";
      for (let index = 0; index < data.length; index += 0x8000) {
        binary += String.fromCharCode(...data.subarray(index, index + 0x8000));
      }
      return btoa(binary);
    }
    return context().encoding.toBase64([...data]);
  }

  function text(response, maximumBytes) {
    let data = bytes(response.dataBase64);
    if (maximumBytes && data.byteLength > maximumBytes) data = data.subarray(0, maximumBytes);
    return new TextDecoder("utf-8", { fatal: false }).decode(data);
  }

  function cookieDomain(cookie) {
    return String(cookie?.domain || "").replace(/^\./, "").toLowerCase();
  }

  function cookiesFor(requestURL) {
    const parsed = url(requestURL);
    const result = {};
    for (const cookie of context().cookies?.getAll?.() || []) {
      const domain = cookieDomain(cookie);
      const path = String(cookie?.path || "/");
      if (!domain || (parsed.hostname !== domain && !parsed.hostname.endsWith(`.${domain}`))) continue;
      if (!(parsed.pathname === path || path === "/" || parsed.pathname.startsWith(path.endsWith("/") ? path : `${path}/`))) continue;
      if (cookie?.expires && Date.parse(cookie.expires) <= Date.now()) continue;
      if (cookie?.name) result[String(cookie.name)] = String(cookie.value || "");
    }
    return result;
  }

  function persistCookies(received) {
    if (!Array.isArray(received) || !received.length || !context().cookies?.setAll) return;
    const current = context().cookies.getAll?.() || [];
    const keyed = new Map(current.map(cookie => [`${cookie.name}\u0000${cookieDomain(cookie)}\u0000${cookie.path || "/"}`, cookie]));
    for (const cookie of received.slice(0, 100)) {
      const domain = cookieDomain(cookie);
      if (!cookie?.name || !hostAllowed(domain)) continue;
      keyed.set(`${cookie.name}\u0000${domain}\u0000${cookie.path || "/"}`, cookie);
    }
    context().cookies.setAll([...keyed.values()].slice(0, 100));
  }

  function isChallenge(response, body) {
    if (response.status !== 403 && response.status !== 503) return false;
    if (header(response.headers, "cf-mitigated").trim().toLowerCase() === "challenge") return true;
    const sample = String(body || "").slice(0, 8192);
    return /<form\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:challenge-form|managed-challenge)[^"']*["']/i.test(sample)
      || /<title>\s*just a moment(?:\.{3})?\s*<\/title>/i.test(sample);
  }

  async function request(value, options = {}) {
    const requestURL = url(value, options.baseURL);
    const response = await context().http.request({
      url: requestURL.href,
      method: options.method || "GET",
      headers: {
        Accept: options.accept || (options.binary ? "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5" : "text/html,application/json;q=0.9,*/*;q=0.5"),
        ...(configuration.userAgent ? { "User-Agent": configuration.userAgent } : {}),
        ...(configuration.referer ? { Referer: configuration.referer } : {}),
        ...(options.headers || {})
      },
      cookies: cookiesFor(requestURL.href),
      ...(options.bodyBase64 ? { bodyBase64: options.bodyBase64 } : {})
    });
    persistCookies(response.cookies);
    const challengeBody = response.status === 403 || response.status === 503 ? text(response, 8192) : "";
    if (isChallenge(response, challengeBody)) {
      const handoffURL = configuration.challengeURL || configuration.baseURL;
      context().challenge?.request?.(handoffURL);
      throw operationError("ChallengeRequiredError", `${configuration.name} requires verification`, "challengeRequired", handoffURL);
    }
    if (response.status === 429 && !options.retried) {
      const delay = Math.max(1, Math.min(30, Number.parseInt(header(response.headers, "retry-after"), 10) || 1));
      await context().rateLimit.sleep(delay * 1000);
      return request(requestURL.href, { ...options, retried: true });
    }
    if (response.status === 404 && options.missingOK) return null;
    if (response.status < 200 || response.status >= 300) {
      const notFound = response.status === 404;
      throw operationError(notFound ? "NotFoundError" : "ServiceError", `${configuration.name} returned HTTP ${response.status}`, notFound ? "notFound" : "serviceError", requestURL.href);
    }
    return options.binary || options.returnResponse ? response : text(response);
  }

  async function jsonRequest(value, options = {}) {
    const body = await request(value, { ...options, accept: "application/json" });
    try {
      return JSON.parse(body);
    } catch {
      throw operationError("InvalidResponseError", `${configuration.name} returned malformed JSON`, "invalidResponse", url(value).href);
    }
  }

  async function image(value, alternatives = []) {
    const candidates = [value, ...alternatives];
    let lastError;
    for (const candidate of candidates) {
      try {
        const response = await request(candidate, { binary: true });
        const mimeType = String(response.mimeType || header(response.headers, "content-type"))
          .split(";", 1)[0].trim().toLowerCase();
        if (!/^image\/(?:avif|gif|jpeg|jpg|png|webp)$/.test(mimeType) && mimeType !== "application/octet-stream") {
          throw operationError("InvalidResponseError", `${configuration.name} returned a non-image resource`, "invalidResponse", url(candidate).href);
        }
        if (!response.dataBase64) throw operationError("InvalidResponseError", `${configuration.name} returned an empty image`, "invalidResponse");
        return { dataBase64: response.dataBase64, mimeType };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || operationError("ServiceError", `${configuration.name} image request failed`, "serviceError");
  }

  function page(input) {
    const value = input?.metadata?.page ?? input?.cursor?.page ?? 1;
    if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) {
      throw operationError("InvalidCursorError", `${configuration.name} page cursor is invalid`, "invalidCursor");
    }
    return value;
  }

  return Object.freeze({ initialize, context, operationError, header, hostAllowed, registerDynamicDestination, url, bytes, base64, text, persistCookies, request, jsonRequest, image, page });
}

/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

function mrDecodeHTML(value) {
  const entities = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return String(value || "").replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const number = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}

function mrTextContent(value) {
  return mrDecodeHTML(String(value || "")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function mrAttribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag || "").match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i"));
  return mrDecodeHTML(match?.[1] ?? match?.[2] ?? "");
}

function mrAbsoluteURL(value, baseURL) {
  if (!value) return "";
  try {
    return new URL(mrDecodeHTML(value), baseURL).href;
  } catch {
    return "";
  }
}

function mrTags(html, name) {
  const result = [];
  const expression = new RegExp(`<${name}\\b[^>]*>`, "gi");
  for (const match of String(html || "").matchAll(expression)) result.push({ tag: match[0], index: match.index || 0 });
  return result;
}

function mrElements(html, name) {
  const result = [];
  const expression = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "gi");
  for (const match of String(html || "").matchAll(expression)) result.push({ html: match[0], index: match.index || 0 });
  return result;
}

function mrWindow(html, index, before = 1200, after = 2400) {
  return String(html || "").slice(Math.max(0, index - before), Math.min(String(html || "").length, index + after));
}

function mrUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

function mrScriptJSON(html, id) {
  const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html || "").match(new RegExp(`<script\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i"));
  if (!match) return null;
  try {
    return JSON.parse(mrDecodeHTML(match[1]).trim());
  } catch {
    return null;
  }
}

function mrJavaScriptArray(source, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(source || "").match(new RegExp(`(?:var|let|const)?\\s*${escaped}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;`, "i"));
  if (!match) return [];
  try {
    const value = JSON.parse(match[1].replace(/\\\//g, "/").replace(/'/g, '"'));
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [...match[1].matchAll(/["']([^"']+)["']/g)].map(item => item[1].replace(/\\\//g, "/"));
  }
}

function mrNumber(value) {
  const number = Number.parseFloat(String(value ?? "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

function mrDefineMangaBoxSource(configuration) {
  const runtime = mrCreateRuntime({
    name: configuration.name,
    baseURL: configuration.baseURL,
    challengeURL: configuration.baseURL,
    referer: `${configuration.baseURL}/`,
    allowedHosts: configuration.allowedHosts,
    userAgent: configuration.userAgent
  });
  const imageMirrors = ["img-r1.2xstorage.com", "img-r2.2xstorage.com", "imgs-2.2xstorage.com"];
  const maximumSiteImageBases = 16;
  const maximumChapterPages = 2000;
  const maximumImageReferenceLength = 2048;
  const pageAlternatives = new Map();

  function invalidPageData(reason) {
    return runtime.operationError(
      "InvalidResponseError",
      `${configuration.name} chapter image data is ${reason}`,
      "invalidResponse"
    );
  }

  function boundedImageReference(value, label) {
    const text = String(value ?? "").trim();
    if (!text || text.length > maximumImageReferenceLength || /[\\\u0000-\u001f\u007f]/.test(text)) {
      throw invalidPageData(`${label} malformed or oversized`);
    }
    return text;
  }

  function validateRelativeImagePath(pathname) {
    const value = pathname.replace(/^\/+/, "");
    if (!value) throw invalidPageData("missing a page path");
    for (const segment of value.split("/")) {
      let decoded;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        throw invalidPageData("using a malformed page path");
      }
      if (!segment || decoded === "." || decoded === "..") {
        throw invalidPageData("using an unsafe page path");
      }
    }
    return value;
  }

  function normalizedSiteBase(value) {
    const text = boundedImageReference(value, "CDN base");
    const parsed = runtime.registerDynamicDestination(text, configuration.baseURL);
    if (parsed.search || parsed.hash) throw invalidPageData("using a CDN base with query or fragment data");
    if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
    return parsed.href;
  }

  function normalizedPageReference(value) {
    const text = boundedImageReference(value, "page reference");
    if (text.includes("#")) throw invalidPageData("using a page fragment");
    if (/^(?:https?:)?\/\//i.test(text)) {
      const parsed = runtime.registerDynamicDestination(text, configuration.baseURL);
      return {
        absolute: parsed.href,
        relative: `${validateRelativeImagePath(parsed.pathname)}${parsed.search}`
      };
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) throw invalidPageData("using a non-HTTP page scheme");
    const queryIndex = text.indexOf("?");
    const pathname = queryIndex < 0 ? text : text.slice(0, queryIndex);
    const query = queryIndex < 0 ? "" : text.slice(queryIndex);
    return { absolute: null, relative: `${validateRelativeImagePath(pathname)}${query}` };
  }

  function rememberPageAlternatives(primary, alternatives) {
    pageAlternatives.delete(primary);
    pageAlternatives.set(primary, alternatives.slice(0, maximumSiteImageBases));
    while (pageAlternatives.size > maximumChapterPages) {
      pageAlternatives.delete(pageAlternatives.keys().next().value);
    }
  }

  function workID(value) {
    const parsed = runtime.url(String(value || ""), configuration.baseURL);
    if (!parsed.pathname.startsWith("/manga/")) {
      throw runtime.operationError("InvalidIdentifierError", `${configuration.name} work identifier is invalid`, "invalidIdentifier");
    }
    return parsed.pathname.replace(/\/+$/, "");
  }

  function cardFromAnchor(anchor, html) {
    const href = mrAttribute(anchor, "href");
    if (!href || !href.includes("/manga/")) return null;
    let id;
    try {
      id = workID(mrAbsoluteURL(href, configuration.baseURL));
    } catch {
      return null;
    }
    const index = html.indexOf(anchor);
    const nearby = mrWindow(html, index, 900, 1800);
    const imageTag = mrTags(nearby, "img").find(item => mrAttribute(item.tag, "src") || mrAttribute(item.tag, "data-src"))?.tag || "";
    const imageUrl = mrAbsoluteURL(mrAttribute(imageTag, "src") || mrAttribute(imageTag, "data-src"), configuration.baseURL);
    const title = mrAttribute(anchor, "title") || mrTextContent(anchor);
    if (!title) return null;
    return { type: "work", workId: id, title, imageUrl, coverURL: imageUrl, contentRating: "SAFE", mediaKind: "manga" };
  }

  function cards(html) {
    const result = [];
    const seen = new Set();
    for (const { html: anchor } of mrElements(html, "a")) {
      const card = cardFromAnchor(anchor, html);
      if (!card || seen.has(card.workId)) continue;
      seen.add(card.workId);
      result.push(card);
    }
    return result;
  }

  function selectedGenre(input) {
    const selection = (Array.isArray(input?.selections) ? input.selections : [])
      .find(item => item?.fieldID === "genre" && item?.polarity !== "exclude");
    const value = String(selection?.value || "").trim();
    return /^[A-Za-z0-9%._~-]{1,200}$/.test(value) ? value : "";
  }

  function listURL(section, page, query, genre) {
    if (genre) return `${configuration.baseURL}/genre/${genre}?page=${page}`;
    if (query) {
      const slug = query.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
      return `${configuration.baseURL}/search/story/${encodeURIComponent(slug)}?page=${page}`;
    }
    const filter = section === "hot" ? 7 : section === "latest" ? 4 : 1;
    const status = section === "completed" ? 1 : 0;
    return `${configuration.baseURL}/genre/all?filter=${filter + status}&page=${page}`;
  }

  async function list(section, page, query, genre = "") {
    const html = await runtime.request(listURL(section, page, query, genre));
    const items = cards(html);
    const lastPage = mrNumber(html.match(/class\s*=\s*["'][^"']*page_last[^"']*["'][^>]*>[\s\S]{0,80}?Last\s*\((\d+)\)/i)?.[1]);
    const hasNext = lastPage ? page < lastPage : items.length > 0;
    return { items, metadata: hasNext ? { page: page + 1 } : null };
  }

  function detailsFromHTML(id, html) {
    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
    const title = mrTextContent(heading) || id.split("/").pop()?.replace(/[-_]+/g, " ") || configuration.name;
    const coverRegion = html.match(/(?:manga-info-pic|info-image)[\s\S]{0,1200}?(<img\b[^>]*>)/i)?.[1]
      || mrTags(html, "img").find(item => /cover|manga/i.test(item.tag))?.tag || "";
    const imageUrl = mrAbsoluteURL(mrAttribute(coverRegion, "src") || mrAttribute(coverRegion, "data-src"), configuration.baseURL);
    const description = mrTextContent(html.match(/<div\b[^>]*id\s*=\s*["']contentBox["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    const searchFacets = [];
    const seenGenres = new Set();
    for (const { html: anchor } of mrElements(html, "a")) {
      const href = mrAttribute(anchor, "href");
      let pathname;
      try {
        pathname = runtime.url(mrAbsoluteURL(href, configuration.baseURL)).pathname;
      } catch {
        continue;
      }
      const genre = pathname.match(/^\/genre\/([A-Za-z0-9%._~-]+)\/?$/)?.[1];
      const title = mrTextContent(anchor);
      if (!genre || !title || seenGenres.has(genre)) continue;
      seenGenres.add(genre);
      searchFacets.push({
        fieldID: "genre",
        value: genre,
        title,
        groupTitle: "Genres",
        presentation: "tag"
      });
    }
    return {
      workId: id,
      imageUrl,
      coverURL: imageUrl,
      title,
      contentRating: "SAFE",
      mediaKind: "manga",
      workInfo: {
        thumbnailUrl: imageUrl,
        synopsis: description,
        primaryTitle: title,
        secondaryTitles: [],
        searchFacets,
        status: /\bcompleted\b/i.test(html) ? "completed" : /\bongoing\b/i.test(html) ? "ongoing" : "unknown",
        shareUrl: `${configuration.baseURL}${id}`,
        mediaKind: "manga"
      }
    };
  }

  async function chapterList(id, html) {
    const container = html.match(/<[^>]+id\s*=\s*["']chapter-list-container["'][^>]*>/i)?.[0] || "";
    const slug = mrAttribute(container, "data-comic-slug");
    const rawAPI = mrAttribute(container, "data-api-url");
    const rawTemplate = mrAttribute(container, "data-chapter-url-template");
    const results = [];
    if (slug && rawAPI && rawTemplate) {
      const apiURL = mrAbsoluteURL(rawAPI.replaceAll("__SLUG__", slug), configuration.baseURL);
      const template = rawTemplate.replaceAll("__MANGA__", slug);
      let offset = 0;
      for (let requestIndex = 0; requestIndex < 20; requestIndex++) {
        const separator = apiURL.includes("?") ? "&" : "?";
        const payload = await runtime.jsonRequest(`${apiURL}${separator}limit=500&offset=${offset}`);
        const data = payload?.data || payload;
        const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
        for (const chapter of chapters) {
          const slugValue = String(chapter?.chapter_slug || chapter?.slug || "");
          if (!slugValue) continue;
          const chapterURL = mrAbsoluteURL(template.replaceAll("__CHAPTER__", slugValue), configuration.baseURL);
          const chapterPath = runtime.url(chapterURL).pathname;
          const number = Number(chapter?.chapter_num ?? chapter?.number ?? 0);
          results.push({
            installmentId: chapterPath,
            workId: id,
            langCode: "en",
            number: Number.isFinite(number) ? number : 0,
            title: String(chapter?.chapter_name || chapter?.name || "").replace(/^Chapter\s+[0-9.]+\s*/i, "") || undefined,
            publishDate: typeof chapter?.updated_at === "string" ? chapter.updated_at : null,
            format: "imageSequence"
          });
        }
        if (!data?.pagination?.has_more) break;
        offset += 500;
      }
    }
    if (results.length) return results;

    for (const { html: anchor } of mrElements(html, "a")) {
      const href = mrAttribute(anchor, "href");
      if (!/\/chapter[-/]/i.test(href)) continue;
      const chapterURL = mrAbsoluteURL(href, configuration.baseURL);
      const number = mrNumber(mrTextContent(anchor).match(/chapter\s*([0-9.]+)/i)?.[1]) ?? 0;
      results.push({ installmentId: runtime.url(chapterURL).pathname, workId: id, langCode: "en", number, title: mrTextContent(anchor), format: "imageSequence" });
    }
    return results;
  }

  async function pages(installment) {
    const path = String(installment?.installmentId || "");
    if (!path.startsWith("/manga/") || !/\/chapter[-/]/i.test(path)) {
      throw runtime.operationError("InvalidIdentifierError", `${configuration.name} chapter identifier is invalid`, "invalidIdentifier");
    }
    const html = await runtime.request(`${configuration.baseURL}${path}`);
    const rawCDNs = [...mrJavaScriptArray(html, "cdns"), ...mrJavaScriptArray(html, "backupImage")];
    const chapterImages = mrJavaScriptArray(html, "chapterImages");
    let values = [];
    if (rawCDNs.length && chapterImages.length) {
      if (rawCDNs.length > maximumSiteImageBases) throw invalidPageData("declaring too many CDN bases");
      if (chapterImages.length > maximumChapterPages) throw invalidPageData("declaring too many pages");
      const cdns = mrUnique(rawCDNs.map(normalizedSiteBase));
      if (!cdns.length) throw invalidPageData("missing a usable CDN base");
      values = chapterImages.map(item => {
        const reference = normalizedPageReference(item);
        const candidates = mrUnique([
          reference.absolute,
          ...cdns.map(base => new URL(reference.relative, base).href)
        ]);
        if (!candidates.length) throw invalidPageData("missing a usable page URL");
        const [primary, ...alternatives] = candidates;
        rememberPageAlternatives(primary, alternatives);
        return primary;
      });
    } else {
      values = mrTags(html, "img")
        .filter(item => /container-chapter-reader|chapter-reader|reader/i.test(mrWindow(html, item.index, 600, 100)))
        .map(item => mrAbsoluteURL(mrAttribute(item.tag, "src") || mrAttribute(item.tag, "data-src"), configuration.baseURL));
      if (values.length > maximumChapterPages) throw invalidPageData("declaring too many pages");
    }
    values = mrUnique(values).filter(Boolean);
    if (!values.length) throw runtime.operationError("InvalidResponseError", `${configuration.name} chapter contains no page images`, "invalidResponse");
    return { id: path, workId: String(installment?.workId || ""), pages: values };
  }

  async function imagePageContent(input) {
    const requested = runtime.url(String(input?.url || input?.pageURL || ""));
    const siteAlternatives = pageAlternatives.get(requested.href) || [];
    const mirrorAlternatives = imageMirrors.includes(requested.hostname)
      ? imageMirrors.filter(host => host !== requested.hostname).map(host => {
          const candidate = new URL(requested.href);
          candidate.hostname = host;
          return candidate.href;
        })
      : [];
    const alternatives = mrUnique([...siteAlternatives, ...mirrorAlternatives])
      .filter(candidate => candidate !== requested.href);
    return runtime.image(requested.href, alternatives);
  }

  defineContentExtension({
    id: configuration.id,
    apiVersion: "1.0",
    initialize: runtime.initialize,
    settings: () => ({ id: "settings", title: configuration.name, fields: [] }),
    discoverSections: () => [
      { id: "new", title: "New Manga", type: 0 },
      { id: "latest", title: "Latest Updates", type: 0 },
      { id: "hot", title: "Popular", type: 0 },
      { id: "completed", title: "Completed", type: 0 }
    ],
    discover: input => list(input?.sectionId || input?.section?.id || "new", runtime.page(input), ""),
    searchFilters: () => ({
      id: "search",
      title: "Search",
      fields: [{
        id: "genre",
        title: "Genre",
        queryPrefix: "genre:",
        placeholder: "Filter by genre",
        supportsExclusion: false,
        options: []
      }],
      sortOptions: []
    }),
    search: input => list(
      "new",
      runtime.page(input),
      String(input?.query ?? input?.text ?? "").trim(),
      selectedGenre(input)
    ),
    async details(value) {
      const id = workID(value);
      return detailsFromHTML(id, await runtime.request(`${configuration.baseURL}${id}`));
    },
    async installments(work) {
      const id = workID(work?.workId || work?.id);
      const html = await runtime.request(`${configuration.baseURL}${id}`);
      return chapterList(id, html);
    },
    imagePages: pages,
    imagePageContent,
    updates: async () => ({ items: [], metadata: null }),
    managedCollections: async () => []
  });
}

/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

mrDefineMangaBoxSource({
  id: "MangaBat",
  name: "MangaBat",
  baseURL: "https://www.mangabats.com",
  userAgent: "manko MangaBat/1.0.0-alpha.14",
  allowedHosts: ["www.mangabats.com", "img-r1.2xstorage.com", "img-r2.2xstorage.com", "imgs-2.2xstorage.com"]
});
