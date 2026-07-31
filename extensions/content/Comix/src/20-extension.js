/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

const COMIX_BASE = "https://comix.to";
const COMIX_API = `${COMIX_BASE}/api/v1`;
const COMIX_MAX_IMAGE_BASE64_LENGTH = Math.ceil((16 * 1024 * 1024) / 3) * 4;
const COMIX_MAX_PROTECTED_JSON_BYTES = 256 * 1024;
const COMIX_USER_AGENT = "MangaReader Comix/1.0.0-alpha.52";
const comixRuntime = mrCreateRuntime({
  name: "Comix",
  baseURL: COMIX_BASE,
  challengeURL: `${COMIX_BASE}/`,
  referer: `${COMIX_BASE}/`,
  userAgent: COMIX_USER_AGENT,
  allowedHosts: [
    "comix.to",
    "static.comix.to",
    "*.wowpic1.store",
    "*.wowpic2.store",
    "*.wowpic3.store",
    "*.wowpic4.store",
    "*.wowpic5.store",
    "*.wowpic6.store",
    "*.wowpic7.store",
    "*.wowpic8.store",
    "*.wowpic9.store"
  ]
});
let comixBootstrapCache;
let comixBootstrapPromise;

function comixInitialize(context) {
  comixRuntime.initialize(context);
  comixBootstrapCache = undefined;
  comixBootstrapPromise = undefined;
}

function comixFingerprint(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

async function comixBootstrap() {
  const now = Date.parse(comixRuntime.context().clock?.now?.() || "") || Date.now();
  if (comixBootstrapCache && now < comixBootstrapCache.expiresAt) return comixBootstrapCache;
  if (!comixBootstrapPromise) {
    comixBootstrapPromise = (async () => {
      const html = await comixRuntime.request(`${COMIX_BASE}/`);
      const moduleTag = mrTags(html, "script").find(item => {
        return mrAttribute(item.tag, "type").toLowerCase() === "module" && /main/i.test(mrAttribute(item.tag, "src"));
      })?.tag;
      if (!moduleTag) throw comixRuntime.operationError("ServiceError", "Comix frontend bootstrap module is missing", "serviceError", `${COMIX_BASE}/`);
      const moduleURL = comixRuntime.url(mrAttribute(moduleTag, "src"), `${COMIX_BASE}/`).href;
      const moduleSource = await comixRuntime.request(moduleURL, { accept: "text/javascript,application/javascript" });
      if (moduleSource.length > 2 * 1024 * 1024) throw comixRuntime.operationError("InvalidResponseError", "Comix frontend module is unexpectedly large", "invalidResponse", moduleURL);
      const securePath = moduleSource.match(/(?:^|["'`](?:\.\/)?)(secure-[A-Za-z0-9_-]+\.js)(?:["'`]|$)/m)?.[1];
      if (!securePath) throw comixRuntime.operationError("ServiceError", "Comix secure frontend module was not discovered", "serviceError", moduleURL);
      const secureModuleURL = comixRuntime.url(securePath, moduleURL).href;
      const secureModuleSource = await comixRuntime.request(secureModuleURL, { accept: "text/javascript,application/javascript" });
      if (new TextEncoder().encode(secureModuleSource).byteLength > 384 * 1024) {
        throw comixRuntime.operationError("InvalidResponseError", "Comix secure frontend module is unexpectedly large", "invalidResponse", secureModuleURL);
      }
      if (/\bimport\b\s*(?:\(|["'{*]|[A-Za-z_$])/.test(secureModuleSource) || /\bimport\.meta\b/.test(secureModuleSource)) {
        throw comixRuntime.operationError("ServiceError", "Comix secure frontend module is no longer self-contained", "serviceError", secureModuleURL);
      }
      const value = Object.freeze({
        html,
        moduleURL,
        secureModuleURL,
        secureModuleSource,
        moduleFingerprint: comixFingerprint(secureModuleSource),
        expiresAt: now + 5 * 60 * 1000
      });
      comixBootstrapCache = value;
      return value;
    })().finally(() => { comixBootstrapPromise = undefined; });
  }
  return comixBootstrapPromise;
}

function comixID(value, label = "title") {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw comixRuntime.operationError("InvalidIdentifierError", `Comix ${label} identifier is invalid`, "invalidIdentifier");
  }
  return id;
}

function comixContentRating(value) {
  if (value === "suggestive") return "MATURE";
  if (value === "erotica" || value === "pornographic") return "ADULT";
  return "SAFE";
}

function comixStatus(value) {
  if (value === "releasing") return "ongoing";
  if (value === "on_hiatus") return "hiatus";
  if (value === "finished") return "completed";
  if (value === "discontinued") return "cancelled";
  return "unknown";
}

function comixImageURL(item) {
  const value = item?.poster?.large || item?.poster?.medium || `${COMIX_BASE}/images/no-poster.png`;
  return comixRuntime.url(value).href;
}

function comixCard(item) {
  const workId = comixID(item?.hid);
  const title = String(item?.title || "").trim();
  if (!title) throw comixRuntime.operationError("InvalidResponseError", "Comix returned a title without a name", "invalidResponse");
  const imageUrl = comixImageURL(item);
  const latest = Number(item?.latestChapter ?? item?.latest_chapter ?? item?.finalChapter);
  return {
    type: "work",
    id: workId,
    workId,
    title,
    subtitle: Number.isFinite(latest) ? `Chapter ${latest}` : "",
    imageUrl,
    coverURL: imageUrl,
    contentRating: comixContentRating(item?.contentRating ?? item?.content_rating),
    mediaKind: item?.type === "manhwa" || item?.type === "manhua" ? "comic" : "manga"
  };
}

function comixProtectedScript(targetURL, bootstrap) {
  return String.raw`
const targetURL = new URL(${JSON.stringify(targetURL)});
const secureModuleURL = ${JSON.stringify(bootstrap.secureModuleURL)};
const secureModuleSource = ${JSON.stringify(bootstrap.secureModuleSource)};
const moduleFingerprint = ${JSON.stringify(bootstrap.moduleFingerprint)};
function failure(code, message, status) {
  return { ok: false, error: { code, message: String(message || "").slice(0, 512), status: Number(status) || 0 } };
}
function axiosParams(url) {
  const result = {};
  for (const [key, rawValue] of url.searchParams) {
    const value = /^\d+$/.test(rawValue) ? Number(rawValue) : rawValue;
    const parts = key.replace(/\]/g, "").split("[");
    let current = result;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      const last = index === parts.length - 1;
      if (last) {
        if (part === "") current.push(value);
        else if (current[part] === undefined) current[part] = value;
        else if (Array.isArray(current[part])) current[part].push(value);
        else current[part] = [current[part], value];
      } else {
        const next = parts[index + 1];
        if (current[part] === undefined) current[part] = next === "" ? [] : {};
        current = current[part];
      }
    }
  }
  return result;
}
function appendParams(search, key, value) {
  if (value === null || value === undefined) { search.append(key, ""); return; }
  if (Array.isArray(value)) { for (const item of value) appendParams(search, key + "[]", item); return; }
  if (typeof value === "object") { for (const child of Object.keys(value)) appendParams(search, key + "[" + child + "]", value[child]); return; }
  search.append(key, String(value));
}
try {
  if (targetURL.protocol !== "https:" || targetURL.hostname !== "comix.to" || !targetURL.pathname.startsWith("/api/v1/")) {
    return failure("invalidTarget", "Comix protected target is not allowed");
  }
  const moduleBlobURL = URL.createObjectURL(new Blob([secureModuleSource], { type: "text/javascript" }));
  let secureModule;
  try { secureModule = await import(moduleBlobURL); }
  finally { URL.revokeObjectURL(moduleBlobURL); }
  let requestInterceptor;
  let responseInterceptor;
  for (const key of Object.keys(secureModule)) {
    const candidate = secureModule[key];
    if (typeof candidate !== "function") continue;
    let detected = false;
    try {
      candidate({ interceptors: {
        request: { use: function () { detected = true; } },
        response: { use: function () { detected = true; } }
      } });
    } catch (_) {}
    if (!detected) continue;
    try {
      candidate({ interceptors: {
        request: { use: function (fn) { requestInterceptor = fn; } },
        response: { use: function (fn) { responseInterceptor = fn; } }
      } });
    } catch (_) {}
    if (typeof requestInterceptor === "function" && typeof responseInterceptor === "function") break;
  }
  if (typeof requestInterceptor !== "function" || typeof responseInterceptor !== "function") {
    return failure("signerUnavailable", "Comix secure request/response interceptors were not found");
  }
  let signed;
  try {
    signed = await requestInterceptor({
      url: targetURL.origin + targetURL.pathname,
      method: "GET",
      params: axiosParams(targetURL)
    });
  } catch (error) {
    return failure("signingFailed", error && error.message || "Comix request signing failed");
  }
  const signedURL = new URL(String(signed && signed.url || targetURL.origin + targetURL.pathname));
  signedURL.search = "";
  const signedParams = signed && signed.params;
  if (signedParams && typeof signedParams === "object") {
    for (const key of Object.keys(signedParams)) appendParams(signedURL.searchParams, key, signedParams[key]);
  }
  if (signedURL.protocol !== "https:" || signedURL.hostname !== "comix.to" || !signedURL.pathname.startsWith("/api/v1/")) {
    return failure("invalidSignedTarget", "Comix signer returned an unapproved target");
  }
  const headers = {};
  for (const [rawName, rawValue] of Object.entries(signed && signed.headers || {})) {
    const name = String(rawName).trim();
    const lower = name.toLowerCase();
    const value = String(rawValue);
    if (!/^[A-Za-z0-9-]{1,128}$/.test(name) || value.length > 4096
      || ["cookie", "host", "connection", "content-length", "transfer-encoding", "proxy-authorization"].includes(lower)) continue;
    headers[name] = value;
  }
  return { ok: true, url: signedURL.href, headers, moduleFingerprint };
} catch (error) {
  return failure("secureExecutionFailed", error && error.message || "Comix secure module execution failed");
}`;
}

function comixDecoderScript(dataBase64, bootstrap) {
  return String.raw`
const encodedDataBase64 = ${JSON.stringify(dataBase64)};
const secureModuleURL = ${JSON.stringify(bootstrap.secureModuleURL)};
const secureModuleSource = ${JSON.stringify(bootstrap.secureModuleSource)};
const moduleFingerprint = ${JSON.stringify(bootstrap.moduleFingerprint)};
function failure(code, message) { return { ok: false, error: { code, message: String(message || "").slice(0, 512) } }; }
try {
  const binary = atob(encodedDataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  let encoded;
  try { encoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch (_) { return failure("invalidJSON", "Comix returned malformed protected JSON"); }
  const moduleBlobURL = URL.createObjectURL(new Blob([secureModuleSource], { type: "text/javascript" }));
  let secureModule;
  try { secureModule = await import(moduleBlobURL); }
  finally { URL.revokeObjectURL(moduleBlobURL); }
  let responseInterceptor;
  for (const key of Object.keys(secureModule)) {
    const candidate = secureModule[key];
    if (typeof candidate !== "function") continue;
    let detected = false;
    try {
      candidate({ interceptors: {
        request: { use: function () { detected = true; } },
        response: { use: function () { detected = true; } }
      } });
    } catch (_) {}
    if (!detected) continue;
    try {
      candidate({ interceptors: {
        request: { use: function () {} },
        response: { use: function (fn) { responseInterceptor = fn; } }
      } });
    } catch (_) {}
    if (typeof responseInterceptor === "function") break;
  }
  if (typeof responseInterceptor !== "function") return failure("decoderUnavailable", "Comix secure response interceptor was not found");
  try {
    const decoded = await responseInterceptor({ data: encoded, status: 200, headers: { "x-enc": "1" } });
    if (!decoded || decoded.data === undefined) return failure("decodeFailed", "Comix protected response decoder returned no data");
    return { ok: true, value: decoded.data, moduleFingerprint };
  } catch (error) {
    return failure("decodeFailed", error && error.message || "Comix protected response decoding failed");
  }
} catch (error) {
  return failure("secureExecutionFailed", error && error.message || "Comix secure response execution failed");
}`;
}

async function comixProtectedJSON(value) {
  const url = comixRuntime.url(value);
  if (!url.pathname.startsWith("/api/v1/")) {
    throw comixRuntime.operationError("HostNotAllowedError", "Comix protected API path is invalid", "hostNotAllowed", url.href);
  }
  const bootstrap = await comixBootstrap();
  const web = comixRuntime.context().web;
  if (!web?.execute) {
    throw comixRuntime.operationError("WebExecutionRequiredError", "Comix requires MangaReader API 1.1 web execution", "serviceError", url.href);
  }
  // API 1.1 web executions are isolated one-shot WKWebViews. Cache only the
  // validated secure-module identity; each signer/decoder session imports that
  // exact module, while all API response bytes remain on the native HTTP broker.
  const signedResult = await web.execute({
    html: "<!doctype html><html><head></head><body></body></html>",
    baseURL: `${COMIX_BASE}/`,
    script: comixProtectedScript(url.href, bootstrap),
    userAgent: COMIX_USER_AGENT,
    loadCSS: false,
    loadImages: false,
    cookies: comixRuntime.context().cookies?.getAll?.() || []
  });
  comixRuntime.persistCookies(signedResult?.cookies);
  const signed = signedResult?.result;
  if (!signed || typeof signed !== "object") {
    throw comixRuntime.operationError("ServiceError", "Comix protected signer returned no result", "serviceError", url.href);
  }
  if (signed.ok !== true) {
    const code = String(signed?.error?.code || "secureExecutionFailed");
    const message = String(signed?.error?.message || "Comix protected signer failed").slice(0, 512);
    const invalid = code === "invalidJSON" || code === "decodeFailed" || code === "invalidSignedTarget" || code === "invalidTarget";
    throw comixRuntime.operationError(invalid ? "InvalidResponseError" : "ServiceError", message, invalid ? "invalidResponse" : "serviceError", url.href);
  }
  if (signed.moduleFingerprint !== bootstrap.moduleFingerprint) {
    throw comixRuntime.operationError("InvalidResponseError", "Comix signer module identity changed during execution", "invalidResponse", url.href);
  }
  const signedURL = comixRuntime.url(signed.url);
  if (!signedURL.pathname.startsWith("/api/v1/")) {
    throw comixRuntime.operationError("InvalidResponseError", "Comix signer returned an invalid API path", "invalidResponse", signedURL.href);
  }
  const response = await comixRuntime.request(signedURL.href, {
    accept: "application/json",
    headers: signed.headers && typeof signed.headers === "object" ? signed.headers : {},
    returnResponse: true
  });
  const encrypted = comixRuntime.header(response.headers, "x-enc").trim() === "1";
  if (!encrypted) {
    try { return JSON.parse(comixRuntime.text(response)); }
    catch { throw comixRuntime.operationError("InvalidResponseError", "Comix returned malformed JSON", "invalidResponse", signedURL.href); }
  }
  if (comixRuntime.bytes(response.dataBase64).byteLength > COMIX_MAX_PROTECTED_JSON_BYTES) {
    throw comixRuntime.operationError("InvalidResponseError", "Comix protected JSON exceeds the bounded decoder input", "invalidResponse", signedURL.href);
  }
  const decodedResult = await web.execute({
    html: "<!doctype html><html><head></head><body></body></html>",
    baseURL: `${COMIX_BASE}/`,
    script: comixDecoderScript(response.dataBase64, bootstrap),
    userAgent: COMIX_USER_AGENT,
    loadCSS: false,
    loadImages: false,
    cookies: comixRuntime.context().cookies?.getAll?.() || []
  });
  comixRuntime.persistCookies(decodedResult?.cookies);
  const decoded = decodedResult?.result;
  if (!decoded || decoded.ok !== true) {
    const message = String(decoded?.error?.message || "Comix protected response decoding failed").slice(0, 512);
    throw comixRuntime.operationError("InvalidResponseError", message, "invalidResponse", signedURL.href);
  }
  if (decoded.moduleFingerprint !== bootstrap.moduleFingerprint) {
    throw comixRuntime.operationError("InvalidResponseError", "Comix decoder module identity changed during execution", "invalidResponse", signedURL.href);
  }
  let decodedValue = decoded.value;
  if (typeof decodedValue === "string") {
    try { decodedValue = JSON.parse(decodedValue); }
    catch { throw comixRuntime.operationError("InvalidResponseError", "Comix decoded malformed JSON", "invalidResponse", signedURL.href); }
  }
  if (!decodedValue || typeof decodedValue !== "object") {
    throw comixRuntime.operationError("InvalidResponseError", "Comix decoded an invalid JSON value", "invalidResponse", signedURL.href);
  }
  return decodedValue;
}

async function comixList(input, order, query) {
  const page = comixRuntime.page(input);
  const parameters = new URLSearchParams({ page: String(page), [`order[${order}]`]: "desc" });
  if (query) parameters.set("keyword", query);
  const response = await comixProtectedJSON(`${COMIX_API}/manga?${parameters}`);
  const payload = response?.result;
  if (!payload || !Array.isArray(payload.items)) {
    throw comixRuntime.operationError("InvalidResponseError", "Comix returned malformed browse data", "invalidResponse");
  }
  const items = payload.items.map(comixCard);
  const meta = payload.meta || {};
  const current = Number(meta.page || page);
  const last = Number(meta.lastPage ?? meta.last_page ?? current);
  const hasNext = meta.hasNext === true || (Number.isFinite(last) && current < last);
  return { items, metadata: hasNext ? { page: page + 1 } : null };
}

async function comixDetails(value) {
  const workId = comixID(value);
  const shareUrl = `${COMIX_BASE}/title/${workId}`;
  const parameters = new URLSearchParams();
  for (const include of ["demographic", "genre", "theme", "author", "artist", "publisher"]) parameters.append("includes[]", include);
  const detail = (await comixProtectedJSON(`${COMIX_API}/manga/${workId}?${parameters}`))?.result;
  if (!detail || comixID(detail.hid) !== workId) {
    throw comixRuntime.operationError("InvalidResponseError", "Comix title metadata is missing", "invalidResponse", shareUrl);
  }
  const card = comixCard(detail);
  const terms = values => Array.isArray(values) ? values.map(value => String(value?.title || "").trim()).filter(Boolean) : [];
  const artists = terms(detail.artists);
  const authors = terms(detail.authors);
  return {
    ...card,
    workInfo: {
      thumbnailUrl: card.imageUrl,
      synopsis: String(detail.synopsis || "").trim(),
      primaryTitle: card.title,
      secondaryTitles: Array.isArray(detail.altTitles) ? detail.altTitles.map(String).filter(Boolean) : [],
      contentRating: card.contentRating,
      status: comixStatus(detail.status),
      artist: artists.join(", ") || undefined,
      author: authors.join(", ") || undefined,
      tags: [...terms(detail.demographics), ...terms(detail.genres), ...terms(detail.tags)],
      shareUrl,
      mediaKind: card.mediaKind
    }
  };
}

async function comixInstallments(work) {
  const workId = comixID(work?.workId ?? work?.id);
  const values = [];
  for (let page = 1; page <= 1000; page++) {
    const parameters = new URLSearchParams({ limit: "100", page: String(page), "order[number]": "desc" });
    const response = await comixProtectedJSON(`${COMIX_API}/manga/${workId}/chapters?${parameters}`);
    let payload = response?.result ?? response?.data?.result ?? response;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch (_) {}
    }
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.chapters)
          ? payload.chapters
          : Array.isArray(payload?.data)
            ? payload.data
            : null;
    if (!items) {
      const responseKeys = response && typeof response === "object" ? Object.keys(response).slice(0, 8).join(",") : typeof response;
      const resultKeys = payload && typeof payload === "object" ? Object.keys(payload).slice(0, 8).join(",") : typeof payload;
      throw comixRuntime.operationError(
        "InvalidResponseError",
        `Comix returned malformed chapter data (response: ${responseKeys || "none"}; result: ${resultKeys || "none"})`,
        "invalidResponse"
      );
    }
    values.push(...items);
    const meta = payload?.meta ?? response?.meta ?? response?.data?.meta;
    const current = Number(meta?.page || page);
    const last = Number(meta?.lastPage ?? meta?.last_page ?? current);
    if (!Number.isFinite(last) || current >= last) break;
    if (page === 1000) throw comixRuntime.operationError("InvalidResponseError", "Comix chapter pagination exceeded its safety limit", "invalidResponse");
  }
  const seen = new Set();
  const result = [];
  for (const chapter of values) {
    const installmentId = comixID(chapter?.id, "chapter");
    if (seen.has(installmentId)) continue;
    const chapterURL = comixRuntime.url(chapter?.url, COMIX_BASE).href;
    seen.add(installmentId);
    result.push({
      installmentId,
      workId,
      langCode: String(chapter?.language || "en"),
      number: Number(chapter?.number) || 0,
      volume: Number(chapter?.volume) || undefined,
      title: String(chapter?.name || "").trim() || undefined,
      publishDate: undefined,
      chapterURL,
      format: "imageSequence"
    });
  }
  return result;
}

async function comixPages(installment) {
  const installmentId = comixID(installment?.installmentId, "chapter");
  const chapterURL = comixRuntime.url(installment?.chapterURL || installment?.url, COMIX_BASE).href;
  const payload = await comixProtectedJSON(`${COMIX_API}/chapters/${installmentId}`);
  const pages = payload?.result?.pages ?? payload?.pages ?? payload?.result ?? payload;
  if (!pages || !Array.isArray(pages.items) || typeof pages.baseUrl !== "string") {
    throw comixRuntime.operationError("InvalidResponseError", "Comix returned malformed page data", "invalidResponse", chapterURL);
  }
  const base = pages.baseUrl.replace(/\/+$/, "");
  const urls = pages.items.map(page => {
    const value = String(page?.url || "");
    const url = comixRuntime.url(/^https:\/\//i.test(value) ? value : `${base}/${value.replace(/^\/+/, "")}`);
    if (page?.s !== null && page?.s !== undefined) {
      const s = Number(page.s);
      const width = Number(page.width);
      const height = Number(page.height);
      if (!Number.isSafeInteger(s) || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 20_000 || height > 20_000) {
        throw comixRuntime.operationError("InvalidResponseError", "Comix returned invalid descrambler page context", "invalidResponse", chapterURL);
      }
      url.hash = `mr-comix=${s},${Math.floor(width)},${Math.floor(height)}`;
    }
    return url.href;
  });
  if (!urls.length) throw comixRuntime.operationError("InvalidResponseError", "Comix chapter contains no page images", "invalidResponse", chapterURL);
  return { id: installmentId, workId: String(installment?.workId || ""), pages: urls };
}

function comixPageContext(url) {
  const match = /^#mr-comix=(-?[0-9]+),([0-9]+),([0-9]+)$/.exec(url.hash);
  if (!match) return null;
  const descriptor = { s: Number(match[1]), width: Number(match[2]), height: Number(match[3]) };
  if (!Number.isSafeInteger(descriptor.s) || descriptor.width < 1 || descriptor.height < 1 || descriptor.width > 20_000 || descriptor.height > 20_000) {
    throw comixRuntime.operationError("InvalidResponseError", "Comix image descrambler context is invalid", "invalidResponse", url.href);
  }
  url.hash = "";
  return descriptor;
}

function comixDescrambleScript(imageURL, descriptor, bootstrap) {
  return String.raw`
const imageURL = ${JSON.stringify(imageURL)};
const pageContext = ${JSON.stringify(descriptor)};
const secureModuleURL = ${JSON.stringify(bootstrap.secureModuleURL)};
const secureModuleSource = ${JSON.stringify(bootstrap.secureModuleSource)};
const moduleFingerprint = ${JSON.stringify(bootstrap.moduleFingerprint)};
const maximumImageBase64Length = ${JSON.stringify(COMIX_MAX_IMAGE_BASE64_LENGTH)};
function failure(code, message) { return { ok: false, error: { code, message: String(message || "").slice(0, 512) } }; }
function isPromise(value) { return value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function"; }
function imageFromBlob(blob) {
  return new Promise(function (resolve, reject) {
    const objectURL = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = function () { URL.revokeObjectURL(objectURL); resolve(image); };
    image.onerror = function () { URL.revokeObjectURL(objectURL); reject(new Error("Comix descrambler returned an undecodable blob")); };
    image.src = objectURL;
  });
}
try {
  const parsedImageURL = new URL(imageURL);
  const allowedImageHost = parsedImageURL.hostname === "comix.to"
    || parsedImageURL.hostname === "static.comix.to"
    || /^[^.]+\.wowpic[1-9]\.store$/i.test(parsedImageURL.hostname);
  if (parsedImageURL.protocol !== "https:" || !allowedImageHost) {
    return failure("invalidImageTarget", "Comix descrambler target is not allowed");
  }
  const payloadBase64 = String(globalThis.__mangaReaderPayloadBase64 || "");
  const payloadMimeType = String(globalThis.__mangaReaderPayloadMimeType || "");
  if (!payloadBase64 || payloadBase64.length > maximumImageBase64Length || !/^image\/(?:avif|gif|jpeg|png|webp)$/.test(payloadMimeType)) {
    return failure("invalidImagePayload", "Comix brokered image payload is invalid");
  }
  const payloadBinary = atob(payloadBase64);
  const payloadBytes = new Uint8Array(payloadBinary.length);
  for (let index = 0; index < payloadBinary.length; index++) payloadBytes[index] = payloadBinary.charCodeAt(index);
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = function (input, init) {
    let requested;
    try { requested = new URL(typeof input === "string" ? input : input && input.url, parsedImageURL).href; }
    catch (_) { return originalFetch(input, init); }
    if (requested === parsedImageURL.href) {
      return Promise.resolve(new Response(payloadBytes.slice().buffer, {
        status: 200,
        headers: { "Content-Type": payloadMimeType }
      }));
    }
    if (/^https?:/i.test(requested)) return Promise.reject(new Error("Comix descrambler attempted an unbrokered HTTP request"));
    return originalFetch(input, init);
  };
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const moduleBlobURL = URL.createObjectURL(new Blob([secureModuleSource], { type: "text/javascript" }));
  let secureModule;
  try { secureModule = await import(moduleBlobURL); }
  finally { URL.revokeObjectURL(moduleBlobURL); }
  const probeController = new AbortController();
  const probeCanvas = document.createElement("canvas");
  let blobDescrambler;
  let canvasDescrambler;
  for (const key of Object.keys(secureModule)) {
    const candidate = secureModule[key];
    if (typeof candidate !== "function") continue;
    try {
      if (!canvasDescrambler && candidate.length === 3) {
        const probe = candidate("about:blank", probeCanvas, probeController.signal);
        if (isPromise(probe)) { canvasDescrambler = candidate; probe.catch(function () {}); }
      }
      if (!blobDescrambler && candidate.length === 2) {
        const probe = candidate("about:blank", probeController.signal);
        if (isPromise(probe)) { blobDescrambler = candidate; probe.catch(function () {}); }
      }
    } catch (_) {}
  }
  probeController.abort();
  if (!blobDescrambler && !canvasDescrambler) return failure("descramblerUnavailable", "Comix secure image descrambler was not found");
  const controller = new AbortController();
  const timeout = setTimeout(function () { controller.abort(); }, 25000);
  const canvas = document.createElement("canvas");
  canvas.width = pageContext.width;
  canvas.height = pageContext.height;
  async function drawBlob(value) {
    const blob = value && value.blob ? value.blob : value;
    const image = await imageFromBlob(blob);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Comix image canvas is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  try {
    if (blobDescrambler) {
      const value = await blobDescrambler(parsedImageURL.href, controller.signal);
      if (value && value.mode === "canvas" && typeof value.apply === "function") value.apply(canvas);
      else if (value && typeof value.apply === "function") value.apply(canvas);
      else await drawBlob(value && value.mode === "blob" ? value.blob : value);
    } else {
      await canvasDescrambler(parsedImageURL.href, canvas, controller.signal);
    }
  } catch (firstError) {
    if (!canvasDescrambler) throw firstError;
    await canvasDescrambler(parsedImageURL.href, canvas, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
  const dataURL = originalToDataURL.call(canvas, "image/png");
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataURL);
  if (!match) return failure("descrambleFailed", "Comix secure descrambler returned malformed image data");
  if (match[2].length > maximumImageBase64Length) return failure("decodedImageTooLarge", "Comix decoded image exceeds the 16 MiB resource limit");
  return { ok: true, dataBase64: match[2], mimeType: match[1].toLowerCase(), moduleFingerprint };
} catch (error) {
  return failure("descrambleFailed", error && error.message || "Comix secure image descrambling failed");
}`;
}

async function comixSiteImage(url, descriptor, response) {
  const bootstrap = await comixBootstrap();
  const web = comixRuntime.context().web;
  if (!web?.execute) throw comixRuntime.operationError("WebExecutionRequiredError", "Comix protected images require MangaReader API 1.1 web execution", "serviceError", url.href);
  const result = await web.execute({
    html: "<!doctype html><html><head></head><body></body></html>",
    baseURL: `${COMIX_BASE}/`,
    script: comixDescrambleScript(url.href, descriptor, bootstrap),
    userAgent: COMIX_USER_AGENT,
    loadCSS: false,
    loadImages: true,
    cookies: comixRuntime.context().cookies?.getAll?.() || [],
    payloadBase64: response.dataBase64,
    payloadMimeType: response.mimeType
  });
  comixRuntime.persistCookies(result?.cookies);
  const envelope = result?.result;
  const declaredMime = String(envelope?.mimeType || "");
  if (!envelope || envelope.ok !== true || typeof envelope.dataBase64 !== "string" || !envelope.dataBase64
    || envelope.dataBase64.length > COMIX_MAX_IMAGE_BASE64_LENGTH || !/^image\/(?:avif|gif|jpeg|png|webp)$/.test(declaredMime)) {
    const message = envelope?.dataBase64?.length > COMIX_MAX_IMAGE_BASE64_LENGTH
      ? "Comix decoded image exceeds the 16 MiB resource limit"
      : String(envelope?.error?.message || "Comix secure image descrambling failed").slice(0, 512);
    throw comixRuntime.operationError("InvalidResponseError", message, "invalidResponse", url.href);
  }
  if (envelope.moduleFingerprint !== bootstrap.moduleFingerprint) {
    throw comixRuntime.operationError("InvalidResponseError", "Comix secure image module identity changed during execution", "invalidResponse", url.href);
  }
  return { dataBase64: envelope.dataBase64, mimeType: declaredMime };
}

function comixImageMime(response, suppliedBytes) {
  const declared = String(response.mimeType || comixRuntime.header(response.headers, "content-type")).split(";", 1)[0].trim().toLowerCase();
  if (/^image\/(?:avif|gif|jpeg|png|webp)$/.test(declared)) return declared;
  const bytes = suppliedBytes || comixRuntime.bytes(response.dataBase64);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return declared;
}

async function comixImage(input) {
  const url = comixRuntime.url(String(input?.url || input?.pageURL || ""));
  const descriptor = comixPageContext(url);
  const response = await comixRuntime.request(url.href, { binary: true });
  const bytes = comixRuntime.bytes(response.dataBase64);
  const mimeType = comixImageMime(response, bytes);
  if (!bytes.length || !/^image\/(?:avif|gif|jpeg|png|webp)$/.test(mimeType)) {
    throw comixRuntime.operationError("InvalidResponseError", "Comix returned a non-image resource", "invalidResponse", url.href);
  }
  response.mimeType = mimeType;
  if (descriptor) return comixSiteImage(url, descriptor, response);
  return { dataBase64: response.dataBase64, mimeType };
}

defineContentExtension({
  id: "Comix",
  apiVersion: "1.1",
  initialize: comixInitialize,
  settings: () => ({ id: "settings", title: "Comix", fields: [] }),
  discoverSections: () => [
    { id: "popular", title: "Popular", type: 0 },
    { id: "latest", title: "Latest Updates", type: 0 },
    { id: "recent", title: "Recently Added", type: 0 }
  ],
  discover(input) {
    const section = input?.sectionId || input?.section?.id || "popular";
    const order = section === "popular" ? "score" : section === "recent" ? "created_at" : section === "latest" ? "chapter_updated_at" : null;
    if (!order) throw comixRuntime.operationError("InvalidSectionError", "Unknown Comix discovery section", "invalidSection");
    return comixList(input, order, "");
  },
  searchFilters: () => ({ id: "search", title: "Search", fields: [] }),
  search(input) {
    const query = String(input?.query ?? input?.text ?? "").trim();
    return comixList(input, query ? "relevance" : "chapter_updated_at", query);
  },
  details: comixDetails,
  installments: comixInstallments,
  imagePages: comixPages,
  imagePageContent: comixImage,
  updates: async () => ({ items: [], metadata: null }),
  managedCollections: async () => []
});
