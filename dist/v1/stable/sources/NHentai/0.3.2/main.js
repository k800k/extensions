/*!
 * nHentai for manko
 * SPDX-License-Identifier: Apache-2.0
 * Source-owned JavaScript port; generated from extensions/content/NHentai/src.
 * Algorithm reference: https://github.com/Aidoku-Community/sources
 * Reference commit: 1faa9c5cfbf67af7cd18a302045a8d093e35867f
 * Reference paths: sources/multi.nhentai/src/lib.rs, sources/multi.nhentai/src/models.rs, sources/multi.nhentai/src/home.rs
 */

/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

const NH_BASE = "https://nhentai.net";
const NH_API = `${NH_BASE}/api/v2`;
const NH_IMAGE_HOSTS = new Set(["i.nhentai.net"]);
const NH_THUMB_HOSTS = new Set(["t.nhentai.net"]);
const NH_MEDIA_HOSTS = new Set([...NH_IMAGE_HOSTS, ...NH_THUMB_HOSTS]);
const NH_HOSTS = new Set(["nhentai.net", ...NH_IMAGE_HOSTS, ...NH_THUMB_HOSTS]);
const NH_USER_AGENT = "manko NHentai Extension/0.3.2 (+https://github.com/k800k/extensions)";
let nhRuntime;
const nhKnownSearchValues = new Map();

function nhContext() {
  const context = nhRuntime || globalThis.manko?.context;
  if (!context) throw nhError("ExtensionRuntimeError", "manko runtime context is unavailable");
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

function nhComposedQuery(input) {
  const raw = String(input?.query ?? input?.text ?? "").trim();
  const allowed = new Set(["tag", "artist", "parody", "character", "group", "language", "category", "pages", "favorites", "uploaded", "title", "jtitle"]);
  const terms = [];
  for (const selection of (Array.isArray(input?.selections) ? input.selections : []).slice(0, 24)) {
    const field = String(selection?.fieldID || "").trim().toLowerCase();
    const value = String(selection?.value || "").trim();
    if (!allowed.has(field) || !value || value.length > 200) continue;
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const formatted = /\s/.test(escaped) ? `"${escaped}"` : escaped;
    const excluded = selection?.polarity === "exclude";
    terms.push(`${excluded ? "-" : ""}${field}:${formatted}`);
  }
  return [raw, ...terms].filter(Boolean).join(" ");
}

function nhSort(input, fallback = "date") {
  const value = String(input?.sort || fallback);
  return new Set(["date", "popular-today", "popular-week", "popular"]).has(value) ? value : fallback;
}

function nhRememberSearchValues(tagGroups) {
  for (const [fieldID, values] of Object.entries(tagGroups || {})) {
    if (!nhKnownSearchValues.has(fieldID)) nhKnownSearchValues.set(fieldID, []);
    const known = nhKnownSearchValues.get(fieldID);
    const seen = new Set(known.map(value => value.toLowerCase()));
    for (const rawValue of Array.isArray(values) ? values : []) {
      const value = String(rawValue || "").trim();
      if (!value || value.length > 200 || seen.has(value.toLowerCase()) || known.length >= 1000) continue;
      known.push(value);
      seen.add(value.toLowerCase());
    }
  }
}

function nhSuggestions(input) {
  const fieldID = String(input?.fieldID || "").trim().toLowerCase();
  const query = String(input?.query || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(30, Number(input?.limit) || 20));
  return (nhKnownSearchValues.get(fieldID) || [])
    .filter(value => !query || value.toLowerCase().includes(query))
    .slice(0, limit)
    .map(value => ({ fieldID, value, title: value }));
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
  nhRememberSearchValues(result);
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
  const facetGroups = [
    ["parody", "Parodies", "tag"],
    ["character", "Characters", "tag"],
    ["tag", "Tags", "tag"],
    ["artist", "Artists", "creator"],
    ["group", "Groups", "creator"],
    ["language", "Languages", "tag"],
    ["category", "Categories", "tag"]
  ];
  const searchFacets = facetGroups.flatMap(([fieldID, groupTitle, presentation]) =>
    (tagGroups[fieldID] || []).map(value => ({
      fieldID,
      value,
      title: value,
      groupTitle,
      presentation
    }))
  );
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
      synopsis: "",
      primaryTitle: card.title,
      secondaryTitles,
      contentRating: "ADULT",
      status: "completed",
      artist: (tagGroups.artist || []).join(", ") || undefined,
      author: creators.join(", ") || undefined,
      searchFacets,
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

defineContentExtension({
  id: "NHentai",
  apiVersion: "1.0",

  initialize(context) {
    nhRuntime = context || globalThis.manko?.context;
    nhContext();
  },

  settings() {
    return { id: "settings", title: "nHentai", fields: [] };
  },

  discoverSections() {
    return [
      { id: "latest", title: "Latest", type: 0 },
      { id: "popular", title: "Popular Today", type: 0 }
    ];
  },

  async discover(input) {
    const page = nhPage(input);
    const section = input?.sectionId || input?.section?.id || "latest";
    if (section !== "latest" && section !== "popular") throw nhError("InvalidSectionError", "Unknown nHentai discovery section");
    const composed = nhComposedQuery(input);
    if (composed || input?.sort) {
      return this.search({
        ...input,
        query: composed,
        selections: [],
        sort: input?.sort || (section === "popular" ? "popular-today" : "date")
      });
    }
    if (section === "popular") {
      if (page > 1) return { items: [], metadata: null };
      const payload = await nhJSON(`${NH_API}/galleries/popular`);
      if (!Array.isArray(payload)) throw nhError("InvalidResponseError", "nHentai popular galleries are malformed", "invalidResponse");
      return { items: payload.map(gallery => nhCard(gallery)), metadata: null };
    }
    const payload = await nhJSON(`${NH_API}/galleries?page=${page}`);
    return nhListPayload(payload, page);
  },

  searchFilters() {
    return {
      id: "nhentai-search",
      title: "nHentai Search",
      fields: [
        { id: "tag", title: "Tag", queryPrefix: "tag:", placeholder: "Filter by tag", supportsExclusion: true, options: [] },
        { id: "artist", title: "Artist", queryPrefix: "artist:", placeholder: "Filter by artist", supportsExclusion: true, options: [] },
        { id: "parody", title: "Parody", queryPrefix: "parody:", placeholder: "Filter by parody", supportsExclusion: true, options: [] },
        { id: "character", title: "Character", queryPrefix: "character:", placeholder: "Filter by character", supportsExclusion: true, options: [] },
        { id: "group", title: "Group", queryPrefix: "group:", placeholder: "Filter by group", supportsExclusion: true, options: [] },
        { id: "language", title: "Language", queryPrefix: "language:", placeholder: "Filter by language", supportsExclusion: true, options: [
          { id: "english", title: "English" }, { id: "japanese", title: "Japanese" }, { id: "chinese", title: "Chinese" }
        ] },
        { id: "category", title: "Category", queryPrefix: "category:", placeholder: "Filter by category", supportsExclusion: true, options: [] },
        { id: "pages", title: "Page Count", queryPrefix: "pages:", placeholder: "For example, pages:20", supportsExclusion: false, options: [] },
        { id: "favorites", title: "Favorites", queryPrefix: "favorites:", placeholder: "For example, favorites:100", supportsExclusion: false, options: [] },
        { id: "uploaded", title: "Upload Date", queryPrefix: "uploaded:", placeholder: "For example, uploaded:7d", supportsExclusion: false, options: [] },
        { id: "title", title: "Title", queryPrefix: "title:", placeholder: "Search title text", supportsExclusion: false, options: [] },
        { id: "jtitle", title: "Japanese Title", queryPrefix: "jtitle:", placeholder: "Search Japanese title", supportsExclusion: false, options: [] }
      ],
      sortOptions: [
        { id: "date", title: "Newest" },
        { id: "popular-today", title: "Popular Today" },
        { id: "popular-week", title: "Popular This Week" },
        { id: "popular", title: "Popular All Time" }
      ],
      defaultSortID: "date"
    };
  },

  async searchSuggestions(input) {
    return nhSuggestions(input);
  },

  async search(input) {
    const query = nhComposedQuery(input);
    const sort = nhSort(input);
    const page = nhPage(input);
    if (/^[1-9][0-9]*$/.test(query)) {
      if (page > 1) return { items: [], metadata: null };
      const gallery = await nhGallery(query);
      return { items: [nhCard(gallery, gallery?.cover ?? gallery?.thumbnail)], metadata: null };
    }
    const endpoint = query || sort !== "date"
      ? `${NH_API}/search?query=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}&page=${page}`
      : `${NH_API}/galleries?page=${page}`;
    const payload = await nhJSON(endpoint);
    return nhListPayload(payload, page);
  },

  async details(id) {
    return nhWorkForID(id);
  },

  async installments(work) {
    const id = nhPositiveInteger(work?.workId ?? work?.id);
    const source = Array.isArray(work?.pagePaths) ? work : await nhWorkForID(id);
    return [{
      installmentId: `gallery:${id}`,
      workId: id,
      langCode: source.language || "multi",
      number: 1,
      volume: 1,
      title: "Gallery",
      publishDate: source.uploadedAt,
      mediaId: source.mediaId,
      pagePaths: source.pagePaths
    }];
  },

  async imagePages(installment) {
    const id = nhPositiveInteger(installment?.workId ?? String(installment?.installmentId || "").replace(/^gallery:/, ""));
    let mediaId = installment?.mediaId;
    let pagePaths = installment?.pagePaths;
    if (!Array.isArray(pagePaths) || !pagePaths.length || !mediaId) {
      const work = await nhWorkForID(id);
      mediaId = work.mediaId;
      pagePaths = work.pagePaths;
    }
    return {
      id: `gallery:${id}`,
      workId: id,
      pages: pagePaths.map(path => nhMediaURL(path, false))
    };
  },

  async imagePageContent(input) {
    const url = nhValidatedURL(String(input?.url || input?.pageURL || ""), NH_MEDIA_HOSTS);
    const response = await nhRequest(url.href, { binary: true, accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" });
    const mimeType = String(response.mimeType || nhHeader(response.headers, "content-type"))
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!/^image\/(?:jpeg|png|gif|webp|avif)$/.test(mimeType)) {
      throw nhError("InvalidResponseError", "nHentai page response is not an image", "invalidResponse", url.href);
    }
    return { dataBase64: response.dataBase64, mimeType };
  },

  async updates() {
    return { items: [], metadata: null };
  },

  async managedCollections() {
    return [];
  }
});
