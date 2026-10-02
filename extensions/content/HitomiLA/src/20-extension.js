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
        { id: "newest", title: "Newest (Date Added)" },
        { id: "date-published", title: "Date Published" },
        { id: "popular-today", title: "Popular Today" },
        { id: "popular-week", title: "Popular This Week" },
        { id: "popular-month", title: "Popular This Month" },
        { id: "popular-year", title: "Popular This Year" },
        { id: "random", title: "Random" }
      ],
      defaultSortID: "newest"
    };
}

defineContentExtension({
  id: "HitomiLA",
  apiVersion: "1.0",
  cachePolicy: "metadata",
  imageRequestMode: "independent",

  initialize(context) {
    hitRuntime = context || globalThis.manko?.context;
    hitContext();
  },

  invalidateCache() {
    hitGalleryGeneration++;
    hitMetadataCache.clear();
    hitGalleryCache.clear();
    hitGalleryFlights.clear();
    hitGalleryCacheBytes = 0;
    hitRoutingCache = undefined;
    hitRoutingPromise = undefined;
    hitIndexCache = undefined;
  },

  settings() {
    return { id: "settings", title: "Hitomi.la", fields: [] };
  },

  discoverSections() {
    return [
      { id: "latest", title: "Catalog (English)", type: 3 }
    ];
  },

  async discover(input) {
    mrValidateSearchSelections(hitSearchConfiguration(), input?.selections, input?.sort);
    const section = input?.sectionId || input?.section?.id || "latest";
    if (section !== "latest" && section !== "popular") throw hitError("InvalidSectionError", "Unknown Hitomi.la discovery section");
    return this.search({ ...input, sort: input?.sort || (section === "popular" ? "popular-week" : "newest") });
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
    const sort = hitSort(input);
    if (sort !== "random" && !query.positive.length && !query.negative.length) {
      const result = await hitNozomiRange(hitSortState(query.language, sort), page);
      return { items: await hitCards(result.ids), metadata: result.hasNext ? { page: page + 1 } : null };
    }
    const randomSeed = sort === "random" ? hitRandomSeed(input, page) : undefined;
    const ordered = await hitSortedSearchIDs(query, sort);
    const ids = sort === "random" ? hitShuffledIDs(ordered, randomSeed) : ordered;
    const start = (page - 1) * HIT_PAGE_SIZE;
    const selected = ids.slice(start, start + HIT_PAGE_SIZE);
    return {
      items: await hitCards(selected),
      metadata: start + HIT_PAGE_SIZE < ids.length ? { page: page + 1, ...(sort === "random" ? { randomSeed } : {}) } : null
    };
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
    const http = input?.http || hitContext().http;
    const supplied = hitParsedURL(String(input?.url || input?.pageURL || ""));
    const coverPath = /^\/avifbigtn\/[0-9a-f]\/[0-9a-f]{2}\/[0-9a-f]{64}\.avif$/;
    const validCover = supplied.hostname === "atn.gold-usergeneratedcontent.net" && coverPath.test(supplied.pathname);
    const url = validCover ? hitURL(supplied.href, HIT_IMAGE_HOSTS) : await hitAuthorizedPageURL(supplied.href, http, input?.cache);
    const response = await hitRequest(url.href, { http, binary: true, imageResource: true, accept: "image/avif,image/webp,image/gif,image/jpeg,image/png" });
    const mimeType = String(response.mimeType || hitHeader(response.headers, "content-type")).split(";", 1)[0].trim().toLowerCase();
    if (!/^image\/(?:avif|webp|gif|jpeg|png)$/.test(mimeType)) throw hitError("InvalidResponseError", "Hitomi.la image response has an unsupported MIME type", "invalidResponse", url.href);
    return response.resourceID ? { resourceID: response.resourceID, mimeType } : { dataBase64: response.dataBase64, mimeType };
  },

  async updates() {
    return { items: [], metadata: null };
  },

  async managedCollections() {
    return [];
  }
});
