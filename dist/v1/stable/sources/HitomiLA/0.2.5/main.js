/*!
 * Hitomi.la for manko
 * SPDX-License-Identifier: Apache-2.0
 * Source-owned JavaScript port; generated from extensions/content/HitomiLA/src.
 * Algorithm reference: https://github.com/Aidoku-Community/sources
 * Reference commit: 1faa9c5cfbf67af7cd18a302045a8d093e35867f
 * Reference paths: sources/multi.hitomi/src/lib.rs, sources/multi.hitomi/src/gg.rs, sources/multi.hitomi/src/models.rs, sources/multi.hitomi/src/search.rs
 */

/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

function mrSearchNormalized(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function mrSearchDistance(left, right, limit) {
  const a = Array.from(left), b = Array.from(right);
  if (Math.abs(a.length - b.length) > limit || a.length > 100 || b.length > 100) return null;
  let previous = Array.from({length:b.length + 1}, (_, i) => i), before = previous;
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j-1]+1, previous[j]+1, previous[j-1]+(a[i-1] === b[j-1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) current[j] = Math.min(current[j], before[j-2]+1);
    }
    before = previous; previous = current;
  }
  return previous[b.length] <= limit ? previous[b.length] : null;
}

function mrSearchScore(query, candidate) {
  const q = mrSearchNormalized(query), c = mrSearchNormalized(candidate);
  if (!q || q === c) return 0;
  if (c.startsWith(q)) return 100;
  if (c.split(" ").some(word => word.startsWith(q))) return 200;
  if (c.includes(q)) return 300;
  if (q.length < 3 || q.length > 100 || /^\d+$/.test(q)) return null;
  const distances = [c, ...c.split(" ")].map(value => mrSearchDistance(q, value, q.length < 6 ? 1 : 2)).filter(value => value !== null);
  return distances.length ? 400 + Math.min(...distances) : null;
}

function mrRankSuggestions(query, candidates, limit = 30, fieldID) {
  const seen = new Set();
  return candidates.flatMap((candidate, index) => {
    if (!candidate || !candidate.fieldID || !candidate.value || (fieldID && candidate.fieldID !== fieldID)) return [];
    const key = `${candidate.fieldID}\u0000${candidate.value}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const scores = [mrSearchScore(query, candidate.title ?? candidate.value), mrSearchScore(query, candidate.value)].filter(score => score !== null);
    return scores.length ? [{candidate, index, score:Math.min(...scores)}] : [];
  }).sort((a,b) => a.score - b.score || a.index - b.index).slice(0,limit).map(value => value.candidate);
}

// Bounded candidate lookup: one literal request and, only when needed, two
// broadened requests. Every suggested value still comes from the provider.
function mrCreateSuggestionLookup(fetchCandidates) {
  const cache = new Map(), flights = new Map();
  async function loadCandidates(fieldID, query) {
    const key = `${fieldID || "*"}\u0000${query}`;
    const saved = cache.get(key);
    if (saved && Date.now() - saved.time < 300000) return saved.values;
    cache.delete(key);
    if (flights.has(key)) return flights.get(key);
    const task = (async () => {
      const values = await fetchCandidates(fieldID, query);
      if (!Array.isArray(values)) throw new Error("The source returned invalid suggestions.");
      if (values.some(value => !value || typeof value.fieldID !== "string" || !value.fieldID || typeof value.value !== "string"
        || !value.value || value.value.length > 256 || String(value.title ?? value.value).length > 256)) throw new Error("The source returned invalid suggestions.");
      const bounded = values.slice(0,100);
      cache.set(key, {time:Date.now(),values:bounded});
      while (cache.size > 100) cache.delete(cache.keys().next().value);
      return bounded;
    })();
    flights.set(key, task);
    try { return await task; } finally { if (flights.get(key) === task) flights.delete(key); }
  }
  return async input => {
    const field = input?.fieldID || null, query = mrSearchNormalized(input?.query);
    const limit = Math.min(30,Math.max(1,Number(input?.limit) || 20));
    if (!query) return [];
    const direct = await loadCandidates(field,query);
    const cached = [...cache.values()].filter(value => Date.now() - value.time < 300000).flatMap(value => value.values);
    let candidates = [...direct,...cached];
    let ranked = mrRankSuggestions(query,candidates,limit,field);
    if (!ranked.some(value => (mrSearchScore(query,value.title ?? value.value) ?? 1000) < 400) && query.length > 3) {
      const letters = Array.from(query);
      const alternatives = [...new Set([letters.slice(0,3).join(""),letters.slice(-3).join("")])].filter(value => value.trim() && value !== query);
      const results = await Promise.allSettled(alternatives.map(value => loadCandidates(field,value)));
      candidates = candidates.concat(results.flatMap(result => result.status === "fulfilled" ? result.value : []));
      ranked = mrRankSuggestions(query,candidates,limit,field);
      if (!ranked.length) {
        const failure = results.find(result => result.status === "rejected");
        if (failure) throw failure.reason;
      }
    }
    return ranked;
  };
}

function mrValidateSearchSelections(configuration, selections, sort) {
  const fields = new Map((configuration.fields || []).map(field => [field.id,field]));
  const counts = new Map(), seen = new Set();
  if (sort && !(configuration.sortOptions || []).some(option => option.id === sort)) throw new Error("Unsupported source sort order.");
  for (const selection of selections || []) {
    const field = fields.get(selection.fieldID);
    if (!field) throw new Error(`Unsupported source filter: ${selection.fieldID}`);
    if (selection.polarity === "exclude" && !field.supportsExclusion) throw new Error(`${field.title} does not support exclusion.`);
    if (!["include","exclude"].includes(selection.polarity)) throw new Error(`Invalid filter state for ${field.title}.`);
    const value = String(selection.value ?? "").trim();
    if (!value || value.length > 256) throw new Error(`Invalid value for ${field.title}.`);
    const kind = field.inputKind || (field.options?.length ? "choice" : "lookup");
    if (kind === "choice" && !(field.options || []).some(option => option.id === value)) throw new Error(`Choose an available ${field.title.toLowerCase()} value.`);
    if (kind === "number" && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new Error(`${field.title} must be a nonnegative whole number.`);
    const key = `${field.id}\u0000${value}`;
    if (seen.has(key)) throw new Error(`Choose one filter state for ${selection.title || value}.`);
    seen.add(key);
    counts.set(field.id,(counts.get(field.id) || 0)+1);
    if (field.maximumSelections && counts.get(field.id) > field.maximumSelections) throw new Error(`Choose at most ${field.maximumSelections} value(s) for ${field.title}.`);
  }
}

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
    return host === "tagindex.hitomi.la" || host === "hitomi.la"
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
const hitGalleryCache = new Map();
const hitGalleryFlights = new Map();
let hitGalleryCacheBytes = 0;
const HIT_GALLERY_CACHE_MAX_BYTES = 16 * 1024 * 1024;
const HIT_GALLERY_CACHE_MAX_ENTRIES = 100;
const HIT_GALLERY_CACHE_TTL_MS = 5 * 60 * 1000;

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

const hitSuggestionLookup = mrCreateSuggestionLookup(async (fieldID, query) => {
  const field = fieldID || "global";
  if (field !== "global" && !hitSuggestionNamespace(field)) throw hitError("InvalidSearchTermError", "Unknown Hitomi.la suggestion field", "invalidSearchTerm");
  const segments = Array.from(query).map(character => encodeURIComponent(({" ":"_", "/":"slash", ".":"dot"})[character] || character));
  const text = await hitRequest(`https://tagindex.hitomi.la/${field}/${segments.join("/")}.json`, {accept:"application/json", missingOK:true});
  if (text === null) return [];
  if (text.length > 256 * 1024) throw hitError("InvalidResponseError", "Hitomi.la suggestions are too large", "invalidResponse");
  const values = JSON.parse(text);
  if (!Array.isArray(values)) throw hitError("InvalidResponseError", "Hitomi.la suggestions are malformed", "invalidResponse");
  return values.slice(0,100).flatMap(item => {
    const namespace = hitSuggestionNamespace(item?.[2]);
    if (!Array.isArray(item) || typeof item[2] !== "string" || typeof item[0] !== "string" || !item[0].trim()) throw hitError("InvalidResponseError", "Hitomi.la returned a malformed tag candidate", "invalidResponse");
    if (!namespace) return [];
    const count = Number(item[1]);
    return [{fieldID:namespace, value:item[0], title:item[0], subtitle:Number.isFinite(count) && count > 0 ? `${count} galleries` : undefined}];
  });
});

async function hitSuggestions(input) { return hitSuggestionLookup(input); }

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
  const cached = hitGalleryCache.get(galleryID);
  if (cached) {
    hitGalleryCache.delete(galleryID);
    if (Date.now() - cached.loadedAt < HIT_GALLERY_CACHE_TTL_MS) {
      hitGalleryCache.set(galleryID, cached);
      return cached.gallery;
    }
    hitGalleryCacheBytes -= cached.bytes;
  }
  if (hitGalleryFlights.has(galleryID)) return hitGalleryFlights.get(galleryID);
  const flight = hitLoadGallery(galleryID);
  hitGalleryFlights.set(galleryID, flight);
  try { return await flight; }
  finally { if (hitGalleryFlights.get(galleryID) === flight) hitGalleryFlights.delete(galleryID); }
}

async function hitLoadGallery(galleryID) {
  const source = await hitRequest(`${HIT_STATIC}/galleries/${galleryID}.js`);
  const gallery = hitGalleryAssignment(source);
  if (hitPositiveInteger(gallery.id) !== galleryID) throw hitError("InvalidResponseError", "Hitomi.la gallery metadata identifier does not match the request", "invalidResponse");
  if (typeof gallery.title !== "string" || !gallery.title.trim() || !Array.isArray(gallery.files) || !gallery.files.length) {
    throw hitError("InvalidResponseError", "Hitomi.la gallery metadata is incomplete", "invalidResponse");
  }
  gallery.files.forEach(file => {
    if (!file || typeof file.hash !== "string" || !/^[0-9a-f]{64}$/.test(file.hash)) throw hitError("InvalidResponseError", "Hitomi.la gallery contains an invalid file hash", "invalidResponse");
  });
  const bytes = new TextEncoder().encode(JSON.stringify(gallery)).byteLength;
  if (bytes <= HIT_GALLERY_CACHE_MAX_BYTES) {
    hitGalleryCache.set(galleryID, { gallery, bytes, loadedAt: Date.now() });
    hitGalleryCacheBytes += bytes;
    while (hitGalleryCache.size > HIT_GALLERY_CACHE_MAX_ENTRIES || hitGalleryCacheBytes > HIT_GALLERY_CACHE_MAX_BYTES) {
      const oldest = hitGalleryCache.keys().next().value;
      hitGalleryCacheBytes -= hitGalleryCache.get(oldest).bytes;
      hitGalleryCache.delete(oldest);
    }
  }
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

function hitSearchConfiguration() {
    return {
      id: "hitomi-search",
      title: "Hitomi.la Search",
      fields: [
        { id: "tag", title: "Tag", queryPrefix: "tag:", placeholder: "Filter by tag", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "female", title: "Female Tag", queryPrefix: "female:", placeholder: "Filter by female tag", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "male", title: "Male Tag", queryPrefix: "male:", placeholder: "Filter by male tag", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "artist", title: "Artist", queryPrefix: "artist:", placeholder: "Filter by artist", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "group", title: "Group", queryPrefix: "group:", placeholder: "Filter by group", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "series", title: "Series", queryPrefix: "series:", placeholder: "Filter by series", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "character", title: "Character", queryPrefix: "character:", placeholder: "Filter by character", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "language", title: "Language", queryPrefix: "language:", placeholder: "Filter by language", supportsExclusion: false, maximumSelections: 1, options: Array.from(HIT_LANGUAGES).map(value => ({ id: value, title: value })) },
        { id: "type", title: "Type", queryPrefix: "type:", placeholder: "Filter by gallery type", supportsExclusion: true, inputKind: "lookup", options: [] }
      ],
      sortOptions: [
        { id: "newest", title: "Newest" },
        { id: "popular-week", title: "Popular This Week" }
      ],
      defaultSortID: "newest"
    };
}

defineContentExtension({
  id: "HitomiLA",
  apiVersion: "1.0",

  initialize(context) {
    hitRuntime = context || globalThis.manko?.context;
    hitContext();
  },

  settings() {
    return { id: "settings", title: "Hitomi.la", fields: [] };
  },

  discoverSections() {
    return [
      { id: "latest", title: "Latest (English)", type: 0 },
      { id: "popular", title: "Popular This Week (English)", type: 0 }
    ];
  },

  async discover(input) {
    mrValidateSearchSelections(hitSearchConfiguration(), input?.selections, input?.sort);
    const page = hitPage(input);
    const section = input?.sectionId || input?.section?.id || "latest";
    if (section !== "latest" && section !== "popular") throw hitError("InvalidSectionError", "Unknown Hitomi.la discovery section");
    const composed = hitComposedQuery(input);
    if (composed) {
      return this.search({ ...input, query: composed, selections: [], sort: input?.sort || (section === "popular" ? "popular-week" : "newest") });
    }
    const state = (input?.sort || (section === "popular" ? "popular-week" : "newest")) === "popular-week" ? { language: "english", popular: "week" } : { language: "english", area: "all" };
    const result = await hitNozomiRange(state, page);
    return { items: await hitCards(result.ids), metadata: result.hasNext ? { page: page + 1 } : null };
  },

  searchFilters: hitSearchConfiguration,
  async searchSuggestions(input) {
    return hitSuggestions(input);
  },

  async search(input) {
    mrValidateSearchSelections(hitSearchConfiguration(), input?.selections, input?.sort);
    const page = hitPage(input);
    const raw = hitComposedQuery(input);
    if (/^[1-9][0-9]*$/.test(raw)) {
      if (page > 1) return { items: [], metadata: null };
      return { items: await hitCards([Number(hitPositiveInteger(raw))]), metadata: null };
    }
    const query = hitQuery({ query: raw });
    if (!query.positive.length && !query.negative.length) {
      const state = hitSort(input) === "popular-week" ? {language:query.language,popular:"week"} : {language:query.language,area:"all"};
      const result = await hitNozomiRange(state, page);
      return { items: await hitCards(result.ids), metadata: result.hasNext ? { page: page + 1 } : null };
    }
    const ids = await hitSortedSearchIDs(query, hitSort(input));
    const start = (page - 1) * HIT_PAGE_SIZE;
    const selected = ids.slice(start, start + HIT_PAGE_SIZE);
    return { items: await hitCards(selected), metadata: start + HIT_PAGE_SIZE < ids.length ? { page: page + 1 } : null };
  },

  async details(id) {
    return hitWork(await hitGallery(id));
  },

  async installments(work) {
    const id = hitPositiveInteger(work?.workId ?? work?.id);
    const source = Array.isArray(work?.files) ? work : await hitWork(await hitGallery(id));
    return [{
      installmentId: `gallery:${id}`,
      workId: id,
      langCode: source.language || "unknown",
      number: 1,
      volume: 1,
      title: "Gallery",
      publishDate: source.publishedAt,
      files: source.files
    }];
  },

  async imagePages(installment) {
    const id = hitPositiveInteger(installment?.workId ?? String(installment?.installmentId || "").replace(/^gallery:/, ""));
    const files = Array.isArray(installment?.files) ? installment.files : (await hitWork(await hitGallery(id))).files;
    const routing = await hitRouting();
    return { id: `gallery:${id}`, workId: id, pages: files.map(file => hitPageURL(file, routing)) };
  },

  async imagePageContent(input) {
    const supplied = hitParsedURL(String(input?.url || input?.pageURL || ""));
    const coverPath = /^\/avifbigtn\/[0-9a-f]\/[0-9a-f]{2}\/[0-9a-f]{64}\.avif$/;
    const validCover = supplied.hostname === "atn.gold-usergeneratedcontent.net" && coverPath.test(supplied.pathname);
    const url = validCover ? hitURL(supplied.href, HIT_IMAGE_HOSTS) : await hitAuthorizedPageURL(supplied.href);
    const response = await hitRequest(url.href, { binary: true, accept: "image/avif,image/webp,image/gif,image/jpeg,image/png" });
    const mimeType = String(response.mimeType || hitHeader(response.headers, "content-type")).split(";", 1)[0].trim().toLowerCase();
    if (!/^image\/(?:avif|webp|gif|jpeg|png)$/.test(mimeType)) throw hitError("InvalidResponseError", "Hitomi.la image response has an unsupported MIME type", "invalidResponse", url.href);
    return { dataBase64: response.dataBase64, mimeType };
  },

  async updates() {
    return { items: [], metadata: null };
  },

  async managedCollections() {
    return [];
  }
});
