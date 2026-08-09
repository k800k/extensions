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
