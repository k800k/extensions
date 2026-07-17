/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

const NH_BASE = "https://nhentai.net";
const NH_HOSTS = new Set(["nhentai.net", "t.nhentai.net", "i.nhentai.net"]);
const NH_IMAGE_TYPES = Object.freeze({ j: "jpg", p: "png", g: "gif", w: "webp" });
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

function nhText(response) {
  return new TextDecoder("utf-8", { fatal: false }).decode(nhBytes(response.dataBase64));
}

function nhValidatedURL(value, hosts = NH_HOSTS) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw nhError("InvalidResponseError", "The service supplied an invalid URL");
  }
  if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.username || url.password) {
    throw nhError("HostNotAllowedError", `Host is not declared for NHentai: ${url.hostname || "unknown"}`);
  }
  return url;
}

function nhIsChallenge(response, text) {
  if (response.status !== 403 && response.status !== 503) return false;
  const marker = `${nhHeader(response.headers, "cf-mitigated")} ${nhHeader(response.headers, "server")} ${text.slice(0, 512)}`.toLowerCase();
  return marker.includes("challenge") || marker.includes("cloudflare") || marker.includes("cf-ray");
}

async function nhRequest(url, options = {}) {
  const validated = nhValidatedURL(url);
  const response = await nhContext().http.request({
    url: validated.href,
    method: options.method || "GET",
    headers: { Accept: options.accept || "application/json, image/*;q=0.8" }
  });
  const text = options.binary ? "" : nhText(response);
  if (nhIsChallenge(response, text)) {
    nhContext().challenge.request(NH_BASE + "/");
    throw nhError("ChallengeRequiredError", "nHentai requires a visible Cloudflare challenge", "challengeRequired", NH_BASE + "/");
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
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) {
    throw nhError("InvalidCursorError", "The nHentai page cursor is invalid", "invalidCursor");
  }
  return value;
}

function nhImageExtension(image) {
  const extension = NH_IMAGE_TYPES[image?.t];
  if (!extension) throw nhError("InvalidResponseError", `Unknown nHentai image type: ${String(image?.t)}`, "invalidResponse");
  return extension;
}

function nhImageURL(gallery, image, index, role) {
  const mediaID = nhPositiveInteger(gallery?.media_id, "media id");
  const extension = nhImageExtension(image);
  const filename = role === "cover" ? `cover.${extension}` : role === "thumbnail" ? `thumb.${extension}` : `${index + 1}.${extension}`;
  const host = role === "page" ? "i.nhentai.net" : "t.nhentai.net";
  return `https://${host}/galleries/${mediaID}/${filename}`;
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

function nhTitle(gallery) {
  const title = gallery?.title;
  const selected = title?.pretty || title?.english || title?.japanese;
  if (typeof selected !== "string" || !selected.trim()) throw nhError("InvalidResponseError", "Gallery title is missing", "invalidResponse");
  return selected.trim();
}

function nhCard(gallery) {
  const id = nhPositiveInteger(gallery?.id);
  return {
    id,
    workId: id,
    title: nhTitle(gallery),
    subtitle: nhLanguage(gallery),
    imageUrl: nhImageURL(gallery, gallery?.images?.cover, 0, "cover"),
    coverURL: nhImageURL(gallery, gallery?.images?.cover, 0, "cover"),
    contentRating: "ADULT",
    mediaKind: "manga"
  };
}

function nhWork(gallery) {
  const card = nhCard(gallery);
  const tagGroups = nhTags(gallery);
  const secondaryTitles = [gallery?.title?.english, gallery?.title?.japanese, gallery?.title?.pretty]
    .filter(value => typeof value === "string" && value.trim() && value.trim() !== card.title)
    .filter((value, index, values) => values.indexOf(value) === index);
  const pageTypes = Array.isArray(gallery?.images?.pages) ? gallery.images.pages.map(image => image?.t) : [];
  if (!pageTypes.length || pageTypes.some(type => !NH_IMAGE_TYPES[type])) {
    throw nhError("InvalidResponseError", "Gallery pages are missing or contain an unknown image type", "invalidResponse");
  }
  const creators = [...(tagGroups.artist || []), ...(tagGroups.group || [])];
  return {
    ...card,
    mediaId: nhPositiveInteger(gallery.media_id, "media id"),
    pageTypes,
    uploadedAt: Number.isFinite(gallery.upload_date) ? new Date(gallery.upload_date * 1000).toISOString() : null,
    tags: tagGroups,
    workInfo: {
      thumbnailUrl: card.imageUrl,
      synopsis: (tagGroups.tag || []).join(", "),
      primaryTitle: card.title,
      secondaryTitles,
      contentRating: "ADULT",
      status: "completed",
      artist: creators,
      author: creators,
      shareUrl: `${NH_BASE}/g/${card.workId}/`
    }
  };
}

function nhListPayload(payload, page) {
  if (!payload || !Array.isArray(payload.result)) throw nhError("InvalidResponseError", "nHentai gallery list is malformed", "invalidResponse");
  const totalPages = Number(payload.num_pages);
  const hasNext = Number.isInteger(totalPages) ? page < totalPages : payload.result.length > 0;
  return { items: payload.result.map(nhCard), metadata: hasNext ? { page: page + 1 } : null };
}

async function nhGallery(id) {
  return nhJSON(`${NH_BASE}/api/gallery/${nhPositiveInteger(id)}`);
}

defineContentExtension({
  id: "NHentai",
  apiVersion: "1.0",

  initialize(context) {
    nhRuntime = context || globalThis.MangaReader?.context;
    nhContext();
  },

  settings() {
    return { id: "settings", title: "nHentai", fields: [] };
  },

  discoverSections() {
    return [
      { id: "latest", title: "Latest", type: 0 },
      { id: "popular", title: "Popular", type: 0 }
    ];
  },

  async discover(input) {
    const page = nhPage(input);
    const section = input?.sectionId || input?.section?.id || "latest";
    if (section !== "latest" && section !== "popular") throw nhError("InvalidSectionError", "Unknown nHentai discovery section");
    const endpoint = section === "popular"
      ? `${NH_BASE}/api/galleries/search?query=&sort=popular&page=${page}`
      : `${NH_BASE}/api/galleries/all?page=${page}`;
    return nhListPayload(await nhJSON(endpoint), page);
  },

  searchFilters() {
    return { id: "search", title: "Search", fields: [] };
  },

  async search(input) {
    const query = String(input?.query ?? input?.text ?? "").trim();
    const page = nhPage(input);
    if (/^[1-9][0-9]*$/.test(query)) {
      if (page > 1) return { items: [], metadata: null };
      return { items: [nhCard(await nhGallery(query))], metadata: null };
    }
    const endpoint = `${NH_BASE}/api/galleries/search?query=${encodeURIComponent(query)}&page=${page}`;
    return nhListPayload(await nhJSON(endpoint), page);
  },

  async details(id) {
    return nhWork(await nhGallery(id));
  },

  async installments(work) {
    const id = nhPositiveInteger(work?.workId ?? work?.id);
    const source = Array.isArray(work?.pageTypes) ? work : nhWork(await nhGallery(id));
    return [{
      installmentId: `gallery:${id}`,
      workId: id,
      langCode: nhLanguage({ tags: Object.entries(source.tags || {}).flatMap(([type, names]) => (names || []).map(name => ({ type, name }))) }),
      number: 1,
      volume: 1,
      title: "Gallery",
      publishDate: source.uploadedAt,
      mediaId: source.mediaId,
      pageTypes: source.pageTypes
    }];
  },

  async imagePages(installment) {
    const id = nhPositiveInteger(installment?.workId ?? String(installment?.installmentId || "").replace(/^gallery:/, ""));
    let mediaId = installment?.mediaId;
    let pageTypes = installment?.pageTypes;
    if (!Array.isArray(pageTypes) || !mediaId) {
      const work = nhWork(await nhGallery(id));
      mediaId = work.mediaId;
      pageTypes = work.pageTypes;
    }
    const gallery = { media_id: mediaId };
    return {
      id: `gallery:${id}`,
      workId: id,
      pages: pageTypes.map((type, index) => nhImageURL(gallery, { t: type }, index, "page"))
    };
  },

  async imagePageContent(input) {
    const url = nhValidatedURL(String(input?.url || input?.pageURL || ""), new Set(["i.nhentai.net", "t.nhentai.net"]));
    const response = await nhRequest(url.href, { binary: true, accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" });
    const mimeType = response.mimeType || nhHeader(response.headers, "content-type").split(";", 1)[0];
    if (!/^image\/(?:jpeg|png|gif|webp|avif)$/.test(mimeType)) throw nhError("InvalidResponseError", "nHentai page response is not an image", "invalidResponse", url.href);
    return { dataBase64: response.dataBase64, mimeType };
  },

  async updates() {
    return { items: [], metadata: null };
  },

  async managedCollections() {
    return [];
  }
});
