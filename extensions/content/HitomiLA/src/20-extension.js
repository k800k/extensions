defineContentExtension({
  id: "HitomiLA",
  apiVersion: "1.0",

  initialize(context) {
    hitRuntime = context || globalThis.MangaReader?.context;
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
    const state = section === "popular" ? { language: "english", popular: "week" } : { language: "english", area: "all" };
    const result = await hitNozomiRange(state, page);
    return { items: await hitCards(result.ids), metadata: result.hasNext ? { page: page + 1 } : null };
  },

  searchFilters() {
    return { id: "search", title: "Search", fields: [] };
  },

  async search(input) {
    const page = hitPage(input);
    const raw = String(input?.query ?? input?.text ?? "").trim();
    if (/^[1-9][0-9]*$/.test(raw)) {
      if (page > 1) return { items: [], metadata: null };
      return { items: await hitCards([Number(hitPositiveInteger(raw))]), metadata: null };
    }
    const query = hitQuery(input);
    if (!query.positive.length && !query.negative.length) {
      const result = await hitNozomiRange({ language: query.language, area: "all" }, page);
      return { items: await hitCards(result.ids), metadata: result.hasNext ? { page: page + 1 } : null };
    }
    const ids = await hitSearchIDs(query);
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
