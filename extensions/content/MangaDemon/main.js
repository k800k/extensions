/*!
 * MangaDemon for MangaReader
 * SPDX-License-Identifier: Apache-2.0
 * Source-owned JavaScript port; generated from extensions/content/MangaDemon/src.
 * Algorithm reference: https://github.com/Aidoku-Community/sources
 * Reference commit: 1faa9c5cfbf67af7cd18a302045a8d093e35867f
 * Reference paths: sources/en.mangademon/src/lib.rs, sources/en.mangademon/src/helpers.rs
 */

/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

function mrCreateRuntime(configuration) {
  const allowedHosts = new Set(configuration.allowedHosts.map(host => host.toLowerCase()));
  const dynamicOrigins = new Set();
  let runtimeContext;

  function context() {
    const value = runtimeContext || globalThis.MangaReader?.context;
    if (!value) throw operationError("ExtensionRuntimeError", "MangaReader runtime context is unavailable");
    return value;
  }

  function initialize(value) {
    runtimeContext = value || globalThis.MangaReader?.context;
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

/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

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

/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

const mdRuntime = mrCreateRuntime({
  name: "MangaDemon",
  baseURL: "https://demonicscans.org",
  challengeURL: "https://demonicscans.org/",
  referer: "https://demonicscans.org/",
  userAgent: "MangaReader MangaDemon/1.0.0-alpha.18",
  allowedHosts: ["demonicscans.org", "demoniclibs.com", "cdn.demoniclibs.com", "librarydm.com", "mangareadon.org", "readermc.org"]
});

function mdMangaID(value) {
  const raw = String(value || "").trim();
  let candidate = raw;
  if (raw.includes("/") || raw.includes(":")) {
    const parsed = mdRuntime.url(raw);
    const match = parsed.pathname.match(/\/(?:manga|title)\/([^/]+)/i);
    candidate = match?.[1] || "";
  }
  if (!candidate || candidate.length > 300 || !/^[A-Za-z0-9%._~-]+$/.test(candidate)) {
    throw mdRuntime.operationError("InvalidIdentifierError", "MangaDemon work identifier is invalid", "invalidIdentifier");
  }
  return candidate;
}

function mdCard(anchor, html) {
  const href = mrAttribute(anchor, "href");
  if (!/\/(?:manga|title)\//i.test(href)) return null;
  let id;
  try {
    id = mdMangaID(mrAbsoluteURL(href, "https://demonicscans.org"));
  } catch {
    return null;
  }
  const nearby = mrWindow(html, html.indexOf(anchor), 1200, 1800);
  const image = mrTags(nearby, "img").find(item => mrAttribute(item.tag, "src") || mrAttribute(item.tag, "data-src"))?.tag || "";
  const imageUrl = mrAbsoluteURL(mrAttribute(image, "src") || mrAttribute(image, "data-src"), "https://demonicscans.org");
  const title = mrAttribute(anchor, "title") || mrTextContent(anchor) || mrAttribute(image, "title") || mrAttribute(image, "alt");
  if (!title) return null;
  return { type: "work", workId: id, title, imageUrl, coverURL: imageUrl, contentRating: "SAFE", mediaKind: "manga" };
}

function mdCards(html) {
  const seen = new Set();
  const result = [];
  for (const { html: anchor } of mrElements(html, "a")) {
    const card = mdCard(anchor, html);
    if (!card || seen.has(card.workId)) continue;
    seen.add(card.workId);
    result.push(card);
  }
  return result;
}

async function mdList(input, query) {
  const page = mdRuntime.page(input);
  const requestURL = query
    ? `https://demonicscans.org/search.php?manga=${encodeURIComponent(query)}`
    : `https://demonicscans.org/advanced.php?list=${page}&orderby=${encodeURIComponent("VIEWS DESC")}`;
  const html = await mdRuntime.request(requestURL);
  const items = mdCards(html);
  const hasNext = !query && (/pagination[\s\S]{0,1200}>\s*Next\s*</i.test(html) || items.length > 0);
  return { items, metadata: hasNext ? { page: page + 1 } : null };
}

async function mdDetails(value) {
  const id = mdMangaID(value);
  const shareURL = `https://demonicscans.org/manga/${id}`;
  const html = await mdRuntime.request(shareURL);
  const title = mrTextContent(html.match(/<h1\b[^>]*class\s*=\s*["'][^"']*big-fat-titles[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")
    || decodeURIComponent(id).replace(/[-_]+/g, " ");
  const coverTag = html.match(/id\s*=\s*["']manga-page["'][\s\S]{0,1000}?(<img\b[^>]*>)/i)?.[1] || "";
  const imageUrl = mrAbsoluteURL(mrAttribute(coverTag, "src") || mrAttribute(coverTag, "data-src"), shareURL);
  const description = mrTextContent(html.match(/manga-info-rightColumn[\s\S]{0,5000}?white-font[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const statusText = mrTextContent(html.match(/Status[\s\S]{0,400}?<li\b[^>]*>([\s\S]*?)<\/li>/i)?.[1] || "");
  return {
    workId: id,
    title,
    imageUrl,
    coverURL: imageUrl,
    contentRating: "SAFE",
    mediaKind: "manga",
    workInfo: {
      thumbnailUrl: imageUrl,
      synopsis: description,
      primaryTitle: title,
      secondaryTitles: [],
      status: /complete/i.test(statusText) ? "completed" : /ongoing/i.test(statusText) ? "ongoing" : "unknown",
      shareUrl: shareURL,
      mediaKind: "manga"
    }
  };
}

async function mdInstallments(work) {
  const id = mdMangaID(work?.workId || work?.id);
  const html = await mdRuntime.request(`https://demonicscans.org/manga/${id}`);
  const result = [];
  const seen = new Set();
  for (const { html: anchor } of mrElements(html, "a")) {
    const href = mrAttribute(anchor, "href");
    if (!href.includes("/chaptered.php")) continue;
    const parsed = mdRuntime.url(mrAbsoluteURL(href, "https://demonicscans.org"));
    const installmentId = `${parsed.pathname}${parsed.search}`;
    if (seen.has(installmentId)) continue;
    seen.add(installmentId);
    const label = mrTextContent(anchor);
    result.push({
      installmentId,
      workId: id,
      langCode: "en",
      number: mrNumber(label.match(/chapter\s*([0-9.]+)/i)?.[1]) ?? 0,
      title: label || undefined,
      format: "imageSequence"
    });
  }
  if (!result.length) throw mdRuntime.operationError("InvalidResponseError", "MangaDemon returned no chapters", "invalidResponse");
  return result;
}

async function mdPages(installment) {
  const id = String(installment?.installmentId || "");
  if (!id.startsWith("/chaptered.php?")) throw mdRuntime.operationError("InvalidIdentifierError", "MangaDemon chapter identifier is invalid", "invalidIdentifier");
  const html = await mdRuntime.request(`https://demonicscans.org${id}`);
  const pages = mrUnique(mrTags(html, "img")
    .filter(item => /\bimgholder\b/i.test(mrAttribute(item.tag, "class")))
    .map(item => mrAbsoluteURL(mrAttribute(item.tag, "src") || mrAttribute(item.tag, "data-src"), "https://demonicscans.org")));
  if (!pages.length) throw mdRuntime.operationError("InvalidResponseError", "MangaDemon chapter contains no page images", "invalidResponse");
  return { id, workId: String(installment?.workId || ""), pages };
}

defineContentExtension({
  id: "MangaDemon",
  apiVersion: "1.0",
  initialize: mdRuntime.initialize,
  settings: () => ({ id: "settings", title: "MangaDemon", fields: [] }),
  discoverSections: () => [{ id: "popular", title: "Popular", type: 0 }, { id: "latest", title: "Latest", type: 0 }],
  discover: input => mdList(input, ""),
  searchFilters: () => ({ id: "search", title: "Search", fields: [] }),
  search: input => mdList(input, String(input?.query ?? input?.text ?? "").trim()),
  details: mdDetails,
  installments: mdInstallments,
  imagePages: mdPages,
  imagePageContent: input => mdRuntime.image(String(input?.url || input?.pageURL || "")),
  updates: async () => ({ items: [], metadata: null }),
  managedCollections: async () => []
});
