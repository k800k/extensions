/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

const HIT_STATIC = "https://ltn.gold-usergeneratedcontent.net";
const HIT_SITE = "https://hitomi.la";
const HIT_MAX_ROUTE_OFFSET = 999;
const HIT_MAX_DYNAMIC_IMAGE_ORIGINS = 16;
const HIT_PAGE_HOST = /^a(?:[1-9][0-9]{0,2}|1000)\.gold-usergeneratedcontent\.net$/;
const hitDynamicImageOrigins = new Set();
const HIT_IMAGE_HOSTS = {
  has(host, origin) { return host === "atn.gold-usergeneratedcontent.net" || hitDynamicImageOrigins.has(origin); }
};
const HIT_HOSTS = {
  has(host, origin) {
    return host === "hitomi.la"
      || host === "ltn.gold-usergeneratedcontent.net"
      || HIT_IMAGE_HOSTS.has(host, origin);
  }
};
const HIT_LANGUAGES = new Set([
  "english", "japanese", "chinese", "spanish", "french", "german", "korean", "russian",
  "italian", "portuguese", "polish", "dutch", "vietnamese", "indonesian", "thai", "czech",
  "hungarian", "arabic", "turkish", "ukrainian"
]);
const HIT_PAGE_SIZE = 25;
let hitRuntime;
let hitRoutingCache;
let hitRoutingPromise;
let hitIndexCache;
let hitSuggestionCatalog;
let hitSuggestionCatalogPromise;

function hitContext() {
  const context = hitRuntime || globalThis.manko?.context;
  if (!context) throw hitError("ExtensionRuntimeError", "manko runtime context is unavailable");
  return context;
}

function hitError(name, message, type, url) {
  const error = new Error(message);
  error.name = name;
  if (type) error.type = type;
  if (url) error.url = url;
  return error;
}

function hitHeader(headers, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === wanted) return String(value);
  }
  return "";
}

function hitBytes(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new Uint8Array(hitContext().encoding.fromBase64(base64 || ""));
}

function hitText(response) {
  return new TextDecoder("utf-8", { fatal: false }).decode(hitBytes(response.dataBase64));
}

function hitParsedURL(value) {
  let url;
  try {
    url = new URL(value, HIT_SITE);
  } catch {
    throw hitError("InvalidResponseError", "Hitomi.la supplied an invalid URL", "invalidResponse");
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw hitError("InvalidResponseError", "Hitomi.la supplied an invalid HTTPS URL", "invalidResponse");
  }
  return url;
}

function hitURL(value, hosts = HIT_HOSTS) {
  const url = hitParsedURL(value);
  if (!hosts.has(url.hostname, url.origin)) {
    throw hitError("HostNotAllowedError", `Host is not declared for HitomiLA: ${url.hostname || "unknown"}`, "hostNotAllowed");
  }
  return url;
}

function hitPageOrigin(route) {
  if (!Number.isInteger(route) || route < 0 || route > HIT_MAX_ROUTE_OFFSET) {
    throw hitError("InvalidResponseError", "Hitomi.la routing result is out of range", "invalidResponse");
  }
  const origin = `https://a${route + 1}.gold-usergeneratedcontent.net`;
  if (!HIT_PAGE_HOST.test(new URL(origin).hostname)) {
    throw hitError("InvalidResponseError", "Hitomi.la routing destination is malformed", "invalidResponse");
  }
  return origin;
}

function hitRegisterPageOrigin(route) {
  const origin = hitPageOrigin(route);
  if (!hitDynamicImageOrigins.has(origin)) {
    if (hitDynamicImageOrigins.size >= HIT_MAX_DYNAMIC_IMAGE_ORIGINS) {
      throw hitError("InvalidResponseError", "Hitomi.la supplied too many image destinations", "invalidResponse");
    }
    hitDynamicImageOrigins.add(origin);
  }
  return origin;
}

async function hitRequest(url, options = {}) {
  const validated = hitURL(url);
  const response = await hitContext().http.request({
    url: validated.href,
    method: "GET",
    headers: {
      Accept: options.accept || (options.binary ? "application/octet-stream" : "text/plain,application/javascript;q=0.9"),
      Referer: `${HIT_SITE}/`,
      ...(options.range ? {
        Range: `bytes=${options.range[0]}-${options.range[1]}`,
        "Accept-Encoding": "identity"
      } : {})
    }
  });
  if (response.status === 404 && options.missingOK) return null;
  if (response.status !== 200 && response.status !== 206) {
    throw hitError(response.status === 404 ? "NotFoundError" : "ServiceError", `Hitomi.la returned HTTP ${response.status}`, response.status === 404 ? "notFound" : "serviceError", validated.href);
  }
  return options.binary ? response : hitText(response);
}

function hitPositiveInteger(value, label = "gallery id") {
  const id = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw hitError("InvalidIdentifierError", `Invalid Hitomi.la ${label}: ${id || "empty"}`, "invalidIdentifier");
  }
  return id;
}

function hitPage(input) {
  const page = input?.metadata?.page ?? input?.cursor?.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw hitError("InvalidCursorError", "The Hitomi.la page cursor is invalid", "invalidCursor");
  return page;
}

function hitReadInt32(bytes, offset) {
  if (!(bytes instanceof Uint8Array) || offset < 0 || offset + 4 > bytes.byteLength) throw hitError("InvalidResponseError", "Hitomi.la binary data ended unexpectedly", "invalidResponse");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, false);
}

function hitReadUint32(bytes, offset) {
  if (!(bytes instanceof Uint8Array) || offset < 0 || offset + 4 > bytes.byteLength) throw hitError("InvalidResponseError", "Hitomi.la binary data ended unexpectedly", "invalidResponse");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function hitReadUint64(bytes, offset) {
  const value = hitReadUint32(bytes, offset) * 4294967296 + hitReadUint32(bytes, offset + 4);
  if (!Number.isSafeInteger(value)) throw hitError("InvalidResponseError", "Hitomi.la binary offset exceeds the safe integer range", "invalidResponse");
  return value;
}

function hitDecodeNozomi(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength % 4 !== 0) throw hitError("InvalidResponseError", "Hitomi.la Nozomi data is not aligned to 32-bit identifiers", "invalidResponse");
  const ids = [];
  for (let offset = 0; offset < bytes.byteLength; offset += 4) {
    const id = hitReadInt32(bytes, offset);
    if (id <= 0) throw hitError("InvalidResponseError", "Hitomi.la Nozomi data contains an invalid gallery identifier", "invalidResponse");
    ids.push(id);
  }
  return ids;
}

function hitSegment(value, label, allowColon = false) {
  const text = String(value || "").replace(/_/g, " ").trim().toLowerCase();
  const valid = allowColon ? /^[a-z0-9 .+:'-]+$/.test(text) : /^[a-z0-9 .+'-]+$/.test(text);
  if (!text || text.length > 100 || !valid || text.includes("..")) {
    throw hitError("InvalidSearchTermError", `Invalid Hitomi.la ${label}`, "invalidSearchTerm");
  }
  return encodeURIComponent(text).replace(/%3A/gi, ":");
}

function hitNozomiURL(state) {
  const language = hitSegment(state.language, "language");
  if (state.popular) return `${HIT_STATIC}/n/popular/${hitSegment(state.popular, "popularity period")}-${language}.nozomi`;
  if (!state.area || state.area === "all") return `${HIT_STATIC}/n/index-${language}.nozomi`;
  const area = hitSegment(state.area, "namespace");
  const tag = hitSegment(state.tag, "tag", true);
  return `${HIT_STATIC}/n/${area}/${tag}-${language}.nozomi`;
}

async function hitNozomiRange(state, page) {
  const start = (page - 1) * HIT_PAGE_SIZE * 4;
  const end = start + HIT_PAGE_SIZE * 4 - 1;
  const response = await hitRequest(hitNozomiURL(state), { binary: true, range: [start, end], missingOK: true });
  if (!response) return { ids: [], hasNext: false };
  const mimeType = String(response.mimeType || hitHeader(response.headers, "content-type"))
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mimeType && mimeType !== "application/x-nozomi" && mimeType !== "application/octet-stream") {
    throw hitError("InvalidResponseError", "Hitomi.la returned an invalid Nozomi media type", "invalidResponse");
  }
  const contentEncoding = hitHeader(response.headers, "content-encoding").trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    throw hitError("InvalidResponseError", "Hitomi.la returned a compressed Nozomi byte range", "invalidResponse");
  }
  const received = hitBytes(response.dataBase64);
  if (response.status === 200) {
    if (received.byteLength % 4 !== 0 || start > received.byteLength) {
      throw hitError("InvalidResponseError", "Hitomi.la returned an invalid complete Nozomi representation", "invalidResponse");
    }
    const bytes = received.slice(start, end + 1);
    return {
      ids: hitDecodeNozomi(bytes),
      hasNext: end + 1 < received.byteLength
    };
  }
  const range = hitHeader(response.headers, "content-range").match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
  if (!range) throw hitError("InvalidResponseError", "Hitomi.la returned an invalid Nozomi content range", "invalidResponse");
  const rangeStart = Number(range[1]);
  const rangeEnd = Number(range[2]);
  const total = Number(range[3]);
  if (!Number.isSafeInteger(rangeStart)
    || !Number.isSafeInteger(rangeEnd)
    || !Number.isSafeInteger(total)
    || rangeStart !== start
    || rangeEnd < rangeStart
    || rangeEnd > end
    || total <= rangeEnd
    || total % 4 !== 0
    || received.byteLength !== rangeEnd - rangeStart + 1
    || received.byteLength % 4 !== 0) {
    throw hitError("InvalidResponseError", "Hitomi.la returned an inconsistent Nozomi content range", "invalidResponse");
  }
  const bytes = received;
  const ids = hitDecodeNozomi(bytes);
  return { ids, hasNext: rangeEnd + 1 < total };
}

async function hitNozomiAll(state) {
  const response = await hitRequest(hitNozomiURL(state), { binary: true, missingOK: true });
  return response ? hitDecodeNozomi(hitBytes(response.dataBase64)) : [];
}

function hitRotate(value, count) {
  return (value >>> count) | (value << (32 - count));
}

function hitSHA256(value) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const source = new TextEncoder().encode(String(value));
  const length = Math.ceil((source.byteLength + 9) / 64) * 64;
  const bytes = new Uint8Array(length);
  bytes.set(source);
  bytes[source.byteLength] = 0x80;
  const view = new DataView(bytes.buffer);
  const bitLength = source.byteLength * 8;
  view.setUint32(length - 8, Math.floor(bitLength / 4294967296), false);
  view.setUint32(length - 4, bitLength >>> 0, false);
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  for (let chunk = 0; chunk < length; chunk += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(chunk + index * 4, false);
    for (let index = 16; index < 64; index++) {
      const left = words[index - 15];
      const right = words[index - 2];
      const s0 = hitRotate(left, 7) ^ hitRotate(left, 18) ^ (left >>> 3);
      const s1 = hitRotate(right, 17) ^ hitRotate(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const s1 = hitRotate(e, 6) ^ hitRotate(e, 11) ^ hitRotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + s1 + choice + constants[index] + words[index]) >>> 0;
      const s0 = hitRotate(a, 2) ^ hitRotate(a, 13) ^ hitRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temporary1) >>> 0;
      d = c; c = b; b = a; a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  const result = new Uint8Array(32);
  const output = new DataView(result.buffer);
  hash.forEach((word, index) => output.setUint32(index * 4, word, false));
  return result;
}

function hitDecodeNode(bytes) {
  let offset = 0;
  const numberOfKeys = hitReadInt32(bytes, offset); offset += 4;
  if (numberOfKeys < 0 || numberOfKeys > 16) throw hitError("InvalidResponseError", "Hitomi.la B-tree key count is invalid", "invalidResponse");
  const keys = [];
  for (let index = 0; index < numberOfKeys; index++) {
    const size = hitReadInt32(bytes, offset); offset += 4;
    if (size < 1 || size > 32 || offset + size > bytes.byteLength) throw hitError("InvalidResponseError", "Hitomi.la B-tree key is malformed", "invalidResponse");
    keys.push(bytes.slice(offset, offset + size));
    offset += size;
  }
  const numberOfData = hitReadInt32(bytes, offset); offset += 4;
  if (numberOfData !== numberOfKeys) throw hitError("InvalidResponseError", "Hitomi.la B-tree data count does not match its keys", "invalidResponse");
  const data = [];
  for (let index = 0; index < numberOfData; index++) {
    const address = hitReadUint64(bytes, offset); offset += 8;
    const length = hitReadInt32(bytes, offset); offset += 4;
    if (length <= 0 || length > 100000000) throw hitError("InvalidResponseError", "Hitomi.la B-tree data length is invalid", "invalidResponse");
    data.push([address, length]);
  }
  const children = [];
  for (let index = 0; index < 17; index++) {
    children.push(hitReadUint64(bytes, offset));
    offset += 8;
  }
  return { keys, data, children };
}

function hitCompareBytes(left, right) {
  const length = Math.min(left.byteLength, right.byteLength);
  for (let index = 0; index < length; index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return left.byteLength === right.byteLength ? 0 : left.byteLength < right.byteLength ? -1 : 1;
}

function hitNow() {
  const runtimeTime = Date.parse(hitContext().clock?.now?.() || "");
  return Number.isFinite(runtimeTime) ? runtimeTime : Date.now();
}

async function hitIndexVersion() {
  const now = hitNow();
  if (hitIndexCache && now - hitIndexCache.loadedAt < 1800000) return hitIndexCache.value;
  const value = String(await hitRequest(`${HIT_STATIC}/galleriesindex/version`)).trim();
  if (!/^[0-9]{1,20}$/.test(value)) throw hitError("InvalidResponseError", "Hitomi.la galleries-index version is invalid", "invalidResponse");
  hitIndexCache = { value, loadedAt: now };
  return value;
}

async function hitIndexBytes(version, suffix, range) {
  const response = await hitRequest(`${HIT_STATIC}/galleriesindex/galleries.${version}.${suffix}`, { binary: true, range });
  return hitBytes(response.dataBase64);
}

async function hitTitleIDs(term) {
  const key = hitSHA256(term).slice(0, 4);
  const version = await hitIndexVersion();
  let address = 0;
  for (let depth = 0; depth < 64; depth++) {
    const node = hitDecodeNode(await hitIndexBytes(version, "index", [address, address + 463]));
    let position = 0;
    while (position < node.keys.length && hitCompareBytes(key, node.keys[position]) > 0) position++;
    if (position < node.keys.length && hitCompareBytes(key, node.keys[position]) === 0) {
      const [dataAddress, length] = node.data[position];
      const bytes = await hitIndexBytes(version, "data", [dataAddress, dataAddress + length - 1]);
      const count = hitReadInt32(bytes, 0);
      if (count <= 0 || count > 10000000 || bytes.byteLength !== count * 4 + 4) throw hitError("InvalidResponseError", "Hitomi.la title-index gallery data is malformed", "invalidResponse");
      const ids = [];
      for (let index = 0; index < count; index++) {
        const id = hitReadInt32(bytes, 4 + index * 4);
        if (id <= 0) throw hitError("InvalidResponseError", "Hitomi.la title-index contains an invalid gallery identifier", "invalidResponse");
        ids.push(id);
      }
      return ids;
    }
    if (node.children.every(child => child === 0)) return [];
    address = node.children[position];
    if (!address) throw hitError("InvalidResponseError", "Hitomi.la B-tree contains an invalid child address", "invalidResponse");
  }
  throw hitError("InvalidResponseError", "Hitomi.la B-tree traversal exceeded its depth limit", "invalidResponse");
}

function hitQuery(input) {
  const raw = String(input?.query ?? input?.text ?? "").trim().toLowerCase();
  const terms = raw ? raw.split(/\s+/).filter(Boolean) : [];
  let language = "english";
  const positive = [];
  const negative = [];
  for (const rawTerm of terms) {
    const excluded = rawTerm.startsWith("-");
    const term = excluded ? rawTerm.slice(1) : rawTerm;
    if (!term) throw hitError("InvalidSearchTermError", "Hitomi.la search contains an empty negative term", "invalidSearchTerm");
    if (!excluded && term.startsWith("language:")) {
      const value = term.slice("language:".length).replace(/_/g, " ");
      if (!HIT_LANGUAGES.has(value)) throw hitError("InvalidSearchTermError", `Unsupported Hitomi.la language: ${value}`, "invalidSearchTerm");
      language = value;
      continue;
    }
    (excluded ? negative : positive).push(term);
  }
  return { language, positive, negative };
}

function hitComposedQuery(input) {
  const raw = String(input?.query ?? input?.text ?? "").trim();
  const allowed = new Set(["tag", "female", "male", "artist", "group", "series", "character", "language", "type"]);
  const selections = Array.isArray(input?.selections) ? input.selections : [];
  const terms = [];
  for (const selection of selections.slice(0, 24)) {
    const field = String(selection?.fieldID || "").trim().toLowerCase();
    const value = String(selection?.value || "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!allowed.has(field) || !value || value.length > 100) continue;
    const excluded = selection?.polarity === "exclude" && field !== "language";
    terms.push(`${excluded ? "-" : ""}${field}:${value}`);
  }
  return [raw, ...terms].filter(Boolean).join(" ");
}

function hitSort(input) {
  const value = String(input?.sort || "newest");
  return value === "popular-week" ? value : "newest";
}

async function hitSortedSearchIDs(query, sort) {
  const ids = await hitSearchIDs(query);
  if (sort !== "popular-week") return ids;
  const allowed = new Set(ids);
  const popular = await hitNozomiAll({ language: query.language, popular: "week" });
  return popular.filter(id => allowed.has(id));
}

function hitSuggestionNamespace(key) {
  const normalized = String(key || "").toLowerCase();
  if (["tag", "tags"].includes(normalized)) return "tag";
  if (["artist", "artists"].includes(normalized)) return "artist";
  if (["group", "groups"].includes(normalized)) return "group";
  if (["series", "parody", "parodys"].includes(normalized)) return "series";
  if (["character", "characters"].includes(normalized)) return "character";
  if (["language", "languages"].includes(normalized)) return "language";
  if (["type", "types"].includes(normalized)) return "type";
  if (normalized === "female" || normalized === "male") return normalized;
  return null;
}

async function hitSuggestions(input) {
  const fieldID = String(input?.fieldID || "").toLowerCase();
  const query = String(input?.query || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(30, Number(input?.limit) || 20));
  const catalog = await hitLoadSuggestionCatalog();
  const values = catalog.get(fieldID) || [];
  return values
    .filter(item => !query || item.value.toLowerCase().includes(query))
    .slice(0, limit)
    .map(item => ({ fieldID, value: item.value, title: item.value, subtitle: item.count ? `${item.count} galleries` : undefined }));
}

async function hitLoadSuggestionCatalog() {
  if (hitSuggestionCatalog) return hitSuggestionCatalog;
  if (hitSuggestionCatalogPromise) return hitSuggestionCatalogPromise;
  hitSuggestionCatalogPromise = (async () => {
    const catalog = new Map();
    const seen = new Map();
    const add = (field, rawValue, rawCount) => {
      const value = String(rawValue || "").trim();
      if (!field || !value || value.length > 100) return;
      if (!catalog.has(field)) {
        catalog.set(field, []);
        seen.set(field, new Set());
      }
      const key = value.toLowerCase();
      if (seen.get(field).has(key) || catalog.get(field).length >= 5000) return;
      seen.get(field).add(key);
      const count = Number(rawCount);
      catalog.get(field).push({ value, count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0 });
    };
    const visit = (value, namespace, depth = 0) => {
      if (depth > 8 || value == null) return;
      if (typeof value === "string") {
        add(namespace, value, 0);
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value.slice(0, 25000)) visit(item, namespace, depth + 1);
        return;
      }
      if (typeof value !== "object") return;
      if (typeof value.tag === "string") {
        add(value.female ? "female" : value.male ? "male" : namespace || "tag", value.tag, value.count);
      }
      if (typeof value.name === "string" && namespace) add(namespace, value.name, value.count);
      for (const [key, child] of Object.entries(value)) {
        const nextNamespace = hitSuggestionNamespace(key) || namespace;
        if (typeof child === "string" && hitSuggestionNamespace(key)) add(nextNamespace, child, value.count);
        else visit(child, nextNamespace, depth + 1);
      }
    };
    try {
      const text = await hitRequest(`${HIT_STATIC}/tags.json`, { accept: "application/json" });
      if (text.length > 8 * 1024 * 1024) throw hitError("InvalidResponseError", "Hitomi.la suggestion catalog is too large", "invalidResponse");
      visit(JSON.parse(text), null);
    } catch {
      return catalog;
    }
    for (const values of catalog.values()) values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    hitSuggestionCatalog = catalog;
    return catalog;
  })();
  return hitSuggestionCatalogPromise;
}

async function hitIDsForTerm(term, language) {
  const separator = term.indexOf(":");
  if (separator < 0) return hitTitleIDs(term.replace(/_/g, " "));
  const namespace = term.slice(0, separator);
  const value = term.slice(separator + 1);
  if (!namespace || !value || value.includes(":") || namespace === "language") throw hitError("InvalidSearchTermError", "Invalid Hitomi.la namespaced term", "invalidSearchTerm");
  const state = namespace === "female" || namespace === "male"
    ? { language, area: "tag", tag: `${namespace}:${value}` }
    : { language, area: namespace, tag: value };
  return hitNozomiAll(state);
}

async function hitSearchIDs(query) {
  const lists = [];
  for (const term of query.positive) lists.push(await hitIDsForTerm(term, query.language));
  if (!lists.length) lists.push(await hitNozomiAll({ language: query.language, area: "all" }));
  let ids = lists[0];
  for (const list of lists.slice(1)) {
    const allowed = new Set(list);
    ids = ids.filter(id => allowed.has(id));
  }
  for (const term of query.negative) {
    const blocked = new Set(await hitIDsForTerm(term, query.language));
    ids = ids.filter(id => !blocked.has(id));
  }
  return ids;
}

function hitGalleryAssignment(source) {
  const prefix = /^\s*(?:"use strict";\s*)?var\s+galleryinfo\s*=\s*/.exec(String(source || ""));
  if (!prefix) throw hitError("InvalidResponseError", "Hitomi.la gallery metadata assignment is malformed", "invalidResponse");
  const payload = String(source).slice(prefix[0].length).trim().replace(/;\s*$/, "");
  let value;
  try {
    value = JSON.parse(payload);
  } catch {
    throw hitError("InvalidResponseError", "Hitomi.la gallery metadata JSON is malformed", "invalidResponse");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw hitError("InvalidResponseError", "Hitomi.la gallery metadata is not an object", "invalidResponse");
  return value;
}

async function hitGallery(id) {
  const galleryID = hitPositiveInteger(id);
  const source = await hitRequest(`${HIT_STATIC}/galleries/${galleryID}.js`);
  const gallery = hitGalleryAssignment(source);
  if (hitPositiveInteger(gallery.id) !== galleryID) throw hitError("InvalidResponseError", "Hitomi.la gallery metadata identifier does not match the request", "invalidResponse");
  if (typeof gallery.title !== "string" || !gallery.title.trim() || !Array.isArray(gallery.files) || !gallery.files.length) {
    throw hitError("InvalidResponseError", "Hitomi.la gallery metadata is incomplete", "invalidResponse");
  }
  gallery.files.forEach(file => {
    if (!file || typeof file.hash !== "string" || !/^[0-9a-f]{64}$/.test(file.hash)) throw hitError("InvalidResponseError", "Hitomi.la gallery contains an invalid file hash", "invalidResponse");
  });
  return gallery;
}

function hitRoutingAssignment(source) {
  const text = String(source || "");
  if (!/\bgg\s*=\s*\{/.test(text)) throw hitError("InvalidResponseError", "Hitomi.la routing configuration assignment is missing", "invalidResponse");
  const path = text.match(/\bb\s*:\s*["']([A-Za-z0-9._/-]+)["']/)?.[1];
  const defaultRoute = Number(text.match(/\bvar\s+o\s*=\s*([0-9]{1,3})\s*;/)?.[1]);
  if (!path || path.length > 256 || path.includes("..") || path.includes("//") || !Number.isInteger(defaultRoute) || defaultRoute < 0 || defaultRoute > HIT_MAX_ROUTE_OFFSET) {
    throw hitError("InvalidResponseError", "Hitomi.la routing configuration is malformed", "invalidResponse");
  }
  const overrides = new Map();
  const switchBody = text.match(/\bswitch\s*\(\s*g\s*\)\s*\{([\s\S]*?)\}\s*return\s+o\s*;/)?.[1] || "";
  for (const assignment of switchBody.matchAll(/\bo\s*=\s*([0-9]+)\s*;\s*break\s*;/g)) {
    const route = assignment[1].length <= 10 ? Number(assignment[1]) : NaN;
    if (!Number.isInteger(route) || route < 0 || route > HIT_MAX_ROUTE_OFFSET) {
      throw hitError("InvalidResponseError", "Hitomi.la routing result is out of range", "invalidResponse");
    }
  }
  const groups = switchBody.matchAll(/((?:\s*case\s+[0-9]+\s*:\s*)+)\s*o\s*=\s*([0-9]{1,10})\s*;\s*break\s*;/g);
  for (const group of groups) {
    const route = Number(group[2]);
    if (!Number.isInteger(route) || route < 0 || route > HIT_MAX_ROUTE_OFFSET) throw hitError("InvalidResponseError", "Hitomi.la routing result is out of range", "invalidResponse");
    for (const match of group[1].matchAll(/case\s+([0-9]+)\s*:/g)) {
      const key = Number(match[1]);
      if (!Number.isInteger(key) || key < 0 || key > 4095) throw hitError("InvalidResponseError", "Hitomi.la routing key is out of range", "invalidResponse");
      overrides.set(key, route);
    }
  }
  return { path, defaultRoute, overrides };
}

async function hitRouting() {
  const now = hitNow();
  if (hitRoutingCache && now - hitRoutingCache.loadedAt < 60000) return hitRoutingCache.value;
  if (!hitRoutingPromise) {
    hitRoutingPromise = hitRequest(`${HIT_STATIC}/gg.js`)
      .then(hitRoutingAssignment)
      .then(value => {
        hitDynamicImageOrigins.clear();
        hitRoutingCache = { value, loadedAt: hitNow() };
        return value;
      })
      .finally(() => { hitRoutingPromise = null; });
  }
  return hitRoutingPromise;
}

function hitPageURL(file, routing) {
  const hash = file?.hash;
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) throw hitError("InvalidResponseError", "Hitomi.la file hash is invalid", "invalidResponse");
  const number = Number.parseInt(hash.slice(-1) + hash.slice(-3, -1), 16);
  const route = routing.overrides.has(number) ? routing.overrides.get(number) : routing.defaultRoute;
  if (!Number.isInteger(route) || route < 0 || route > HIT_MAX_ROUTE_OFFSET) throw hitError("InvalidResponseError", "Hitomi.la routing result is invalid", "invalidResponse");
  let extension;
  if (Number(file?.hasavif) === 1) extension = "avif";
  else if (/\.gif$/i.test(String(file?.name || ""))) extension = "gif";
  else if (Number(file?.haswebp) === 1) extension = "webp";
  else {
    const original = String(file?.name || "").match(/\.((?:jpe?g|png|gif))$/i)?.[1]?.toLowerCase();
    if (!original) throw hitError("InvalidResponseError", "Hitomi.la file has no supported image representation", "invalidResponse");
    extension = original;
  }
  const path = routing.path.replace(/^\/+|\/+$/g, "");
  const url = `${hitRegisterPageOrigin(route)}/${path}/${number}/${hash}.${extension}`;
  return hitURL(url, HIT_IMAGE_HOSTS).href;
}

async function hitAuthorizedPageURL(value) {
  const url = hitParsedURL(value);
  const match = /^\/([A-Za-z0-9._/-]+)\/([0-9]+)\/([0-9a-f]{64})\.(avif|webp|gif|jpe?g|png)$/.exec(url.pathname);
  if (!match || !HIT_PAGE_HOST.test(url.hostname)) {
    throw hitError("InvalidIdentifierError", "Invalid Hitomi.la image URL", "invalidIdentifier");
  }
  const hash = match[3];
  const number = Number.parseInt(hash.slice(-1) + hash.slice(-3, -1), 16);
  if (match[2] !== String(number)) {
    throw hitError("InvalidIdentifierError", "Invalid Hitomi.la image URL", "invalidIdentifier");
  }
  if (hitDynamicImageOrigins.has(url.origin)) return url;

  const routing = await hitRouting();
  const route = routing.overrides.has(number) ? routing.overrides.get(number) : routing.defaultRoute;
  const expectedOrigin = hitPageOrigin(route);
  const expectedPath = routing.path.replace(/^\/+|\/+$/g, "");
  if (url.origin !== expectedOrigin || match[1] !== expectedPath) {
    throw hitError("InvalidIdentifierError", "Invalid Hitomi.la image URL", "invalidIdentifier");
  }
  hitRegisterPageOrigin(route);
  return hitURL(url.href, HIT_IMAGE_HOSTS);
}

function hitCoverURL(hash) {
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) throw hitError("InvalidResponseError", "Hitomi.la file hash is invalid", "invalidResponse");
  const last = hash.slice(-1);
  const previous = hash.slice(-3, -1);
  return hitURL(`https://atn.gold-usergeneratedcontent.net/avifbigtn/${last}/${previous}/${hash}.avif`, HIT_IMAGE_HOSTS).href;
}

function hitValues(value, key) {
  return Array.isArray(value) ? value.map(item => item?.[key]).filter(item => typeof item === "string" && item.trim()).map(item => item.trim()) : [];
}

function hitTagGroups(gallery) {
  const groups = {};
  for (const item of Array.isArray(gallery.tags) ? gallery.tags : []) {
    if (!item || typeof item.tag !== "string" || !item.tag.trim()) continue;
    const namespace = item.female ? "female" : item.male ? "male" : "tag";
    if (!groups[namespace]) groups[namespace] = [];
    groups[namespace].push(item.tag.trim());
  }
  return groups;
}

async function hitWork(gallery) {
  const id = hitPositiveInteger(gallery.id);
  const cover = hitCoverURL(gallery.files[0].hash);
  const artists = hitValues(gallery.artists, "artist");
  const groups = hitValues(gallery.groups, "group");
  const series = hitValues(gallery.parodys, "parody");
  const characters = hitValues(gallery.characters, "character");
  const tags = hitTagGroups(gallery);
  const tagNamespaces = [
    ["female", "Female"],
    ["male", "Male"],
    ["tag", "Tags"]
  ];
  const searchFacets = [
    ...artists.map(value => ({ fieldID: "artist", value, title: value, groupTitle: "Artists", presentation: "creator" })),
    ...groups.map(value => ({ fieldID: "group", value, title: value, groupTitle: "Groups", presentation: "creator" })),
    ...series.map(value => ({ fieldID: "series", value, title: value, groupTitle: "Series", presentation: "tag" })),
    ...characters.map(value => ({ fieldID: "character", value, title: value, groupTitle: "Characters", presentation: "tag" })),
    ...tagNamespaces.flatMap(([namespace, groupTitle]) => (tags[namespace] || []).map(value => ({
      fieldID: namespace,
      value,
      title: value,
      groupTitle,
      presentation: "tag"
    })))
  ];
  if (gallery.language) searchFacets.push({ fieldID: "language", value: gallery.language, title: gallery.language_localname || gallery.language, groupTitle: "Language", presentation: "tag" });
  if (typeof gallery.type === "string" && gallery.type.trim()) {
    searchFacets.push({ fieldID: "type", value: gallery.type.trim(), title: gallery.type.trim(), groupTitle: "Type", presentation: "tag" });
  }
  const alternate = typeof gallery.japanese_title === "string" && gallery.japanese_title.trim() && gallery.japanese_title.trim() !== gallery.title.trim() ? [gallery.japanese_title.trim()] : [];
  let shareUrl = `${HIT_SITE}/galleries/${id}.html`;
  if (typeof gallery.galleryurl === "string" && gallery.galleryurl.startsWith("/")) shareUrl = hitURL(gallery.galleryurl, new Set(["hitomi.la"])).href;
  return {
    id,
    workId: id,
    title: gallery.title.trim(),
    subtitle: gallery.language_localname || gallery.language || "Unknown language",
    imageUrl: cover,
    coverURL: cover,
    contentRating: "ADULT",
    mediaKind: "manga",
    language: gallery.language || "unknown",
    files: gallery.files.map(file => ({
      hash: file.hash,
      name: typeof file.name === "string" ? file.name : "",
      width: Number(file.width) || 0,
      height: Number(file.height) || 0,
      haswebp: Number(file.haswebp) || 0,
      hasavif: Number(file.hasavif) || 0
    })),
    tags,
    publishedAt: typeof gallery.date === "string" ? gallery.date : null,
    workInfo: {
      thumbnailUrl: cover,
      synopsis: "",
      primaryTitle: gallery.title.trim(),
      secondaryTitles: alternate,
      contentRating: "ADULT",
      status: "completed",
      artist: artists.join(", ") || undefined,
      author: [...artists, ...groups].join(", ") || undefined,
      searchFacets,
      shareUrl
    }
  };
}

async function hitMapLimit(values, limit, operation) {
  const result = new Array(values.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      result[index] = await operation(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return result;
}

async function hitCards(ids) {
  const works = await hitMapLimit(ids, 4, async id => hitWork(await hitGallery(id)));
  return works.map(work => ({
    type: "work",
    id: work.id,
    workId: work.workId,
    title: work.title,
    subtitle: work.subtitle,
    imageUrl: work.imageUrl,
    coverURL: work.coverURL,
    contentRating: "ADULT",
    mediaKind: "manga"
  }));
}
