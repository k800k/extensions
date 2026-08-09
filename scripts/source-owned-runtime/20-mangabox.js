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
