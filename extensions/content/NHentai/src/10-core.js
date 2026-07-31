/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

const NH_BASE = "https://nhentai.net";
const NH_API = `${NH_BASE}/api/v2`;
const NH_IMAGE_HOSTS = new Set(["i.nhentai.net"]);
const NH_THUMB_HOSTS = new Set(["t.nhentai.net"]);
const NH_MEDIA_HOSTS = new Set([...NH_IMAGE_HOSTS, ...NH_THUMB_HOSTS]);
const NH_HOSTS = new Set(["nhentai.net", ...NH_IMAGE_HOSTS, ...NH_THUMB_HOSTS]);
const NH_USER_AGENT = "MangaReader NHentai Extension/0.3.1 (+https://github.com/k800k/extensions)";
let nhRuntime;

function nhContext() {
  const context = nhRuntime || globalThis.MangaReader?.context;
  if (!context) throw nhError("ExtensionRuntimeError", "MangaReader runtime context is unavailable");
  return context;
}

function nhError(name, message, type, url) {
  const error = new Error(message);
  error.name = name;
  if (type) error.type = type;
  if (url) error.url = url;
  return error;
}

function nhHeader(headers, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === wanted) return String(value);
  }
  return "";
}

function nhBytes(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new Uint8Array(nhContext().encoding.fromBase64(base64 || ""));
}

function nhText(response, maximumBytes) {
  let base64 = response.dataBase64 || "";
  if (maximumBytes) {
    const maximumCharacters = Math.ceil(maximumBytes / 3) * 4;
    base64 = base64.slice(0, maximumCharacters - (maximumCharacters % 4));
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(nhBytes(base64));
}

function nhValidatedURL(value, hosts = NH_HOSTS) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw nhError("InvalidResponseError", "The service supplied an invalid URL", "invalidResponse");
  }
  if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.username || url.password) {
    throw nhError("HostNotAllowedError", `Host is not declared for NHentai: ${url.hostname || "unknown"}`, "hostNotAllowed");
  }
  return url;
}

function nhIsChallenge(response, text) {
  if (response.status !== 403 && response.status !== 503) return false;
  if (nhHeader(response.headers, "cf-mitigated").trim().toLowerCase() === "challenge") return true;
  const sample = text.slice(0, 8192);
  return /<form\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:challenge-form|managed-challenge)[^"']*["']/i.test(sample)
    || /<title>\s*just a moment(?:\.{3})?\s*<\/title>/i.test(sample);
}

async function nhRequest(url, options = {}) {
  const validated = nhValidatedURL(url);
  const response = await nhContext().http.request({
    url: validated.href,
    method: options.method || "GET",
    headers: {
      Accept: options.accept || "application/json, image/*;q=0.8",
      "User-Agent": NH_USER_AGENT,
      Referer: `${NH_BASE}/`
    }
  });
  if (Array.isArray(response.cookies) && response.cookies.length && typeof nhContext().cookies?.setAll === "function") {
    nhContext().cookies.setAll(response.cookies);
  }
  const text = options.binary
    ? (response.status === 403 || response.status === 503 ? nhText(response, 8192) : "")
    : nhText(response);
  if (nhIsChallenge(response, text)) {
    nhContext().challenge.request(`${NH_BASE}/`);
    throw nhError("ChallengeRequiredError", "nHentai requires a visible Cloudflare challenge", "challengeRequired", `${NH_BASE}/`);
  }
  if (response.status === 429 && !options.retried) {
    const seconds = Math.max(1, Math.min(60, Number.parseInt(nhHeader(response.headers, "retry-after"), 10) || 1));
    await nhContext().rateLimit.sleep(seconds * 1000);
    return nhRequest(validated.href, { ...options, retried: true });
  }
  if (response.status === 404) throw nhError("NotFoundError", "The requested nHentai gallery was not found", "notFound", validated.href);
  if (response.status < 200 || response.status >= 300) {
    throw nhError("ServiceError", `nHentai returned HTTP ${response.status}`, "serviceError", validated.href);
  }
  return options.binary ? response : text;
}

async function nhJSON(url) {
  const text = await nhRequest(url);
  try {
    return JSON.parse(text);
  } catch {
    throw nhError("InvalidResponseError", "nHentai returned malformed JSON", "invalidResponse", url);
  }
}

function nhPositiveInteger(value, label = "gallery id") {
  const text = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw nhError("InvalidIdentifierError", `Invalid ${label}: ${text || "empty"}`, "invalidIdentifier");
  }
  return text;
}

function nhPage(input) {
  const value = input?.metadata?.page ?? input?.cursor?.page ?? 1;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) {
    throw nhError("InvalidCursorError", "The nHentai page cursor is invalid", "invalidCursor");
  }
  return value;
}

function nhMediaURL(path, isCover) {
  const hosts = isCover ? NH_THUMB_HOSTS : NH_IMAGE_HOSTS;
  const base = isCover ? "https://t.nhentai.net" : "https://i.nhentai.net";
  if (typeof path !== "string" || !path || path.length > 2048 || /[\\?#\u0000-\u0020\u007f]/.test(path)) {
    throw nhError("InvalidResponseError", "The nHentai media path is invalid", "invalidResponse");
  }
  if (/^https?:\/\//i.test(path)) return nhValidatedURL(path, hosts).href;
  const relative = path.replace(/^\/+/, "");
  for (const segment of relative.split("/")) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw nhError("InvalidResponseError", "The nHentai media path is malformed", "invalidResponse");
    }
    if (!segment || decoded === "." || decoded === "..") {
      throw nhError("InvalidResponseError", "The nHentai media path is invalid", "invalidResponse");
    }
  }
  return nhValidatedURL(`${base}/${relative}`, hosts).href;
}

function nhTags(gallery) {
  const result = {};
  if (!Array.isArray(gallery?.tags)) return result;
  for (const tag of gallery.tags) {
    if (!tag || typeof tag.name !== "string" || typeof tag.type !== "string") continue;
    if (!result[tag.type]) result[tag.type] = [];
    result[tag.type].push(tag.name);
  }
  return result;
}

function nhLanguage(gallery) {
  const language = Array.isArray(gallery?.tags) && gallery.tags.find(tag => tag?.type === "language" && typeof tag.name === "string");
  return language?.name || "multi";
}

function nhTitles(gallery) {
  const detail = gallery?.title;
  const english = typeof detail?.english === "string" ? detail.english : gallery?.english_title;
  const japanese = typeof detail?.japanese === "string" ? detail.japanese : gallery?.japanese_title;
  const pretty = typeof detail?.pretty === "string" ? detail.pretty : null;
  const selected = [pretty, english, japanese].find(value => typeof value === "string" && value.trim());
  if (!selected) throw nhError("InvalidResponseError", "Gallery title is missing", "invalidResponse");
  return {
    selected: selected.trim(),
    english: typeof english === "string" ? english.trim() : null,
    japanese: typeof japanese === "string" ? japanese.trim() : null,
    pretty: typeof pretty === "string" ? pretty.trim() : null
  };
}

function nhCard(gallery, preferredImage) {
  const id = nhPositiveInteger(gallery?.id);
  const mediaID = nhPositiveInteger(gallery?.media_id, "media id");
  const titles = nhTitles(gallery);
  const source = preferredImage ?? gallery?.thumbnail;
  const path = typeof source === "string" ? source : source?.path;
  const imageUrl = nhMediaURL(path, true);
  const subtitle = titles.japanese && titles.japanese !== titles.selected
    ? titles.japanese
    : Number.isInteger(gallery?.num_pages) ? `${gallery.num_pages} pages` : "";
  return {
    type: "work",
    id,
    workId: id,
    title: titles.selected,
    subtitle,
    imageUrl,
    coverURL: imageUrl,
    contentRating: "ADULT",
    mediaKind: "manga"
  };
}

function nhWork(gallery) {
  const card = nhCard(gallery, gallery?.cover ?? gallery?.thumbnail);
  const tagGroups = nhTags(gallery);
  const titles = nhTitles(gallery);
  const pagePaths = Array.isArray(gallery?.pages) ? gallery.pages.map(page => page?.path) : [];
  if (!pagePaths.length || pagePaths.some(path => typeof path !== "string" || !path)) {
    throw nhError("InvalidResponseError", "Gallery pages are missing or malformed", "invalidResponse");
  }
  const creators = [...(tagGroups.artist || []), ...(tagGroups.group || [])];
  const secondaryTitles = [titles.english, titles.japanese, titles.pretty]
    .filter(value => value && value !== card.title)
    .filter((value, index, values) => values.indexOf(value) === index);
  return {
    ...card,
    mediaId: nhPositiveInteger(gallery.media_id, "media id"),
    pagePaths,
    language: nhLanguage(gallery),
    uploadedAt: Number.isInteger(gallery.upload_date) ? new Date(gallery.upload_date * 1000).toISOString() : null,
    tags: tagGroups,
    workInfo: {
      thumbnailUrl: card.imageUrl,
      synopsis: (tagGroups.tag || []).join(", "),
      primaryTitle: card.title,
      secondaryTitles,
      contentRating: "ADULT",
      status: "completed",
      artist: creators.join(", ") || undefined,
      author: creators.join(", ") || undefined,
      shareUrl: `${NH_BASE}/g/${card.workId}/`
    }
  };
}

function nhListPayload(payload, page) {
  if (!payload || !Array.isArray(payload.result) || !Number.isInteger(payload.num_pages) || payload.num_pages < 0) {
    throw nhError("InvalidResponseError", "nHentai gallery list is malformed", "invalidResponse");
  }
  return {
    items: payload.result.map(gallery => nhCard(gallery)),
    metadata: page < payload.num_pages ? { page: page + 1 } : null
  };
}

async function nhGallery(id) {
  return nhJSON(`${NH_API}/galleries/${nhPositiveInteger(id)}`);
}

async function nhWorkForID(id) {
  return nhWork(await nhGallery(id));
}
