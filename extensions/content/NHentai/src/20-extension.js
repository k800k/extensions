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
      { id: "popular", title: "Popular Today", type: 0 }
    ];
  },

  async discover(input) {
    const page = nhPage(input);
    const section = input?.sectionId || input?.section?.id || "latest";
    if (section !== "latest" && section !== "popular") throw nhError("InvalidSectionError", "Unknown nHentai discovery section");
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
    return { id: "search", title: "Search", fields: [] };
  },

  async search(input) {
    const query = String(input?.query ?? input?.text ?? "").trim();
    const page = nhPage(input);
    if (/^[1-9][0-9]*$/.test(query)) {
      if (page > 1) return { items: [], metadata: null };
      const gallery = await nhGallery(query);
      return { items: [nhCard(gallery, gallery?.cover ?? gallery?.thumbnail)], metadata: null };
    }
    const endpoint = query
      ? `${NH_API}/search?query=${encodeURIComponent(query)}&sort=date&page=${page}`
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
