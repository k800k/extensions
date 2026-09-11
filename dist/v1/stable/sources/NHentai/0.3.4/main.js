/*!
 * nHentai for manko
 * SPDX-License-Identifier: Apache-2.0
 * Source-owned JavaScript port; generated from extensions/content/NHentai/src.
 * Algorithm reference: https://github.com/Aidoku-Community/sources
 * Reference commit: 1faa9c5cfbf67af7cd18a302045a8d093e35867f
 * Reference paths: sources/multi.nhentai/src/lib.rs, sources/multi.nhentai/src/models.rs, sources/multi.nhentai/src/home.rs
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

const NH_BASE = "https://nhentai.net";
const NH_API = `${NH_BASE}/api/v2`;
const NH_IMAGE_HOSTS = new Set(["i.nhentai.net"]);
const NH_THUMB_HOSTS = new Set(["t.nhentai.net"]);
const NH_MEDIA_HOSTS = new Set([...NH_IMAGE_HOSTS, ...NH_THUMB_HOSTS]);
const NH_HOSTS = new Set(["nhentai.net", ...NH_IMAGE_HOSTS, ...NH_THUMB_HOSTS]);
const NH_USER_AGENT = "manko NHentai Extension/0.3.4 (+https://github.com/k800k/extensions)";
const NH_SUGGESTION_FIELDS = new Set(["tag", "artist", "parody", "character", "group", "language", "category"]);
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
      Referer: `${NH_BASE}/`,
      ...(options.headers || {})
    },
    body: options.body
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

async function nhJSON(url, options) {
  const text = await nhRequest(url, options);
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

function nhObservedSuggestions(fieldID, query) {
  const fields = fieldID ? [fieldID] : Array.from(NH_SUGGESTION_FIELDS);
  return mrRankSuggestions(query, fields.flatMap(current => (nhKnownSearchValues.get(current) || [])
    .map(value => ({fieldID:current,value,title:value}))), 30, fieldID || null);
}

const nhSuggestionLookup = mrCreateSuggestionLookup(async (fieldID, query) => {
  if (fieldID && !NH_SUGGESTION_FIELDS.has(fieldID)) throw nhError("InvalidSearchTermError", "Unknown nHentai suggestion field", "invalidSearchTerm");
  const payload = await nhJSON(`${NH_API}/tags/search`, {
    method:"POST", headers:{"Content-Type":"application/json"}, body:{type:fieldID || null,query,limit:30}
  });
  if (!Array.isArray(payload)) throw nhError("InvalidResponseError", "nHentai tag suggestions are malformed", "invalidResponse");
  if (payload.some(item => typeof item?.type !== "string"
    || typeof item?.name !== "string" || !item.name.trim() || item.name.length > 200)) throw nhError("InvalidResponseError", "nHentai returned a malformed tag candidate", "invalidResponse");
  return payload.filter(item => NH_SUGGESTION_FIELDS.has(item.type.toLowerCase())).map(item => ({
      fieldID:String(item.type).toLowerCase(), value:item.name.trim(), title:item.name.trim(),
      subtitle:Number(item.count) > 0 ? `${Math.floor(Number(item.count))} galleries` : undefined
    }));
});

async function nhSuggestions(input) {
  const observed = nhObservedSuggestions(input?.fieldID, input?.query);
  if (!String(input?.query || "").trim()) return observed.slice(0,input?.limit || 20);
  try {
    return mrRankSuggestions(input.query, [...await nhSuggestionLookup(input), ...observed], input.limit || 20, input.fieldID);
  } catch (error) {
    if (observed.length) return observed.slice(0,input?.limit || 20);
    throw error;
  }
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

function nhSearchConfiguration() {
    return {
      id: "nhentai-search",
      title: "nHentai Search",
      fields: [
        { id: "tag", title: "Tag", queryPrefix: "tag:", placeholder: "Filter by tag", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "artist", title: "Artist", queryPrefix: "artist:", placeholder: "Filter by artist", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "parody", title: "Parody", queryPrefix: "parody:", placeholder: "Filter by parody", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "character", title: "Character", queryPrefix: "character:", placeholder: "Filter by character", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "group", title: "Group", queryPrefix: "group:", placeholder: "Filter by group", supportsExclusion: true, inputKind: "lookup", options: [] },
        { id: "language", title: "Language", queryPrefix: "language:", placeholder: "Filter by language", supportsExclusion: true, options: [
          { id: "english", title: "English" }, { id: "japanese", title: "Japanese" }, { id: "chinese", title: "Chinese" }
        ] },
        { id: "category", title: "Category", queryPrefix: "category:", placeholder: "Filter by category", supportsExclusion: true, inputKind: "lookup", options: [] },
        { inputKind: "number", maximumSelections: 1, id: "pages", title: "Page Count", queryPrefix: "pages:", placeholder: "For example, pages:20", supportsExclusion: false, options: [] },
        { inputKind: "number", maximumSelections: 1, id: "favorites", title: "Favorites", queryPrefix: "favorites:", placeholder: "For example, favorites:100", supportsExclusion: false, options: [] },
        { inputKind: "text", maximumSelections: 1, id: "uploaded", title: "Upload Date", queryPrefix: "uploaded:", placeholder: "For example, uploaded:7d", supportsExclusion: false, options: [] },
        { inputKind: "text", maximumSelections: 1, id: "title", title: "Title", queryPrefix: "title:", placeholder: "Search title text", supportsExclusion: false, options: [] },
        { inputKind: "text", maximumSelections: 1, id: "jtitle", title: "Japanese Title", queryPrefix: "jtitle:", placeholder: "Search Japanese title", supportsExclusion: false, options: [] }
      ],
      sortOptions: [
        { id: "date", title: "Newest" },
        { id: "popular-today", title: "Popular Today" },
        { id: "popular-week", title: "Popular This Week" },
        { id: "popular", title: "Popular All Time" }
      ],
      defaultSortID: "date"
    };
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
    mrValidateSearchSelections(nhSearchConfiguration(), input?.selections, input?.sort);
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

  searchFilters: nhSearchConfiguration,
  async searchSuggestions(input) {
    return nhSuggestions(input);
  },

  async search(input) {
    mrValidateSearchSelections(nhSearchConfiguration(), input?.selections, input?.sort);
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
