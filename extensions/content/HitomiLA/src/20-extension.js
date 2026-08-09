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
    const page = hitPage(input);
    const section = input?.sectionId || input?.section?.id || "latest";
    if (section !== "latest" && section !== "popular") throw hitError("InvalidSectionError", "Unknown Hitomi.la discovery section");
    const composed = hitComposedQuery(input);
    if (composed) {
      return this.search({ ...input, query: composed, selections: [], sort: section === "popular" ? "popular-week" : input?.sort });
    }
    const state = section === "popular" ? { language: "english", popular: "week" } : { language: "english", area: "all" };
    const result = await hitNozomiRange(state, page);
    return { items: await hitCards(result.ids), metadata: result.hasNext ? { page: page + 1 } : null };
  },

  searchFilters() {
    return {
      id: "hitomi-search",
      title: "Hitomi.la Search",
      fields: [
        { id: "tag", title: "Tag", queryPrefix: "tag:", placeholder: "Filter by tag", supportsExclusion: true, options: [] },
        { id: "female", title: "Female Tag", queryPrefix: "female:", placeholder: "Filter by female tag", supportsExclusion: true, options: [] },
        { id: "male", title: "Male Tag", queryPrefix: "male:", placeholder: "Filter by male tag", supportsExclusion: true, options: [] },
        { id: "artist", title: "Artist", queryPrefix: "artist:", placeholder: "Filter by artist", supportsExclusion: true, options: [] },
        { id: "group", title: "Group", queryPrefix: "group:", placeholder: "Filter by group", supportsExclusion: true, options: [] },
        { id: "series", title: "Series", queryPrefix: "series:", placeholder: "Filter by series", supportsExclusion: true, options: [] },
        { id: "character", title: "Character", queryPrefix: "character:", placeholder: "Filter by character", supportsExclusion: true, options: [] },
        { id: "language", title: "Language", queryPrefix: "language:", placeholder: "Filter by language", supportsExclusion: false, options: Array.from(HIT_LANGUAGES).map(value => ({ id: value, title: value })) },
        { id: "type", title: "Type", queryPrefix: "type:", placeholder: "Filter by gallery type", supportsExclusion: true, options: [] }
      ],
      sortOptions: [
        { id: "newest", title: "Newest" },
        { id: "popular-week", title: "Popular This Week" }
      ],
      defaultSortID: "newest"
    };
  },

  async searchSuggestions(input) {
    return hitSuggestions(input);
  },

  async search(input) {
    const page = hitPage(input);
    const raw = hitComposedQuery(input);
    if (/^[1-9][0-9]*$/.test(raw)) {
      if (page > 1) return { items: [], metadata: null };
      return { items: await hitCards([Number(hitPositiveInteger(raw))]), metadata: null };
    }
    const query = hitQuery({ query: raw });
    if (!query.positive.length && !query.negative.length) {
      const result = await hitNozomiRange({ language: query.language, area: "all" }, page);
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
