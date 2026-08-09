/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

const wcRuntime = mrCreateRuntime({
  name: "WeebCentral",
  baseURL: "https://weebcentral.com",
  challengeURL: "https://weebcentral.com/",
  referer: "https://weebcentral.com/",
  userAgent: "manko WeebCentral/1.0.0-alpha.26",
  allowedHosts: ["weebcentral.com", "temp.compsci88.com"]
});

function wcWorkID(value) {
  const parsed = wcRuntime.url(String(value || ""), "https://weebcentral.com");
  const match = parsed.pathname.match(/^\/series\/([A-Za-z0-9]+)(?:\/[^/?#]+)?\/?$/);
  if (!match) throw wcRuntime.operationError("InvalidIdentifierError", "WeebCentral work identifier is invalid", "invalidIdentifier");
  const slug = parsed.pathname.split("/").filter(Boolean)[2];
  return `/series/${match[1]}${slug ? `/${slug}` : ""}`;
}

function wcCards(html) {
  const result = [];
  const seen = new Set();
  for (const { html: anchor } of mrElements(html, "a")) {
    const href = mrAttribute(anchor, "href");
    if (!href.includes("/series/")) continue;
    let id;
    try {
      id = wcWorkID(mrAbsoluteURL(href, "https://weebcentral.com"));
    } catch {
      continue;
    }
    if (seen.has(id)) continue;
    const nearby = mrWindow(html, html.indexOf(anchor), 1200, 1800);
    const image = mrTags(nearby, "img").find(item => mrAttribute(item.tag, "src") || mrAttribute(item.tag, "data-src"))?.tag || "";
    const title = (mrTextContent(anchor) || mrAttribute(image, "alt")).replace(/^Official\s+/i, "").trim();
    const imageUrl = mrAbsoluteURL(mrAttribute(image, "src") || mrAttribute(image, "data-src"), "https://weebcentral.com");
    if (!title) continue;
    seen.add(id);
    result.push({ type: "work", workId: id, title, imageUrl, coverURL: imageUrl, contentRating: "SAFE", mediaKind: "manga" });
  }
  return result;
}

async function wcList(input, query, section) {
  const page = wcRuntime.page(input);
  if (section === "hot" && !query) {
    if (page > 1) return { items: [], metadata: null };
    const items = wcCards(await wcRuntime.request("https://weebcentral.com/hot-updates"));
    return { items, metadata: null };
  }
  const parameters = new URLSearchParams({
    limit: "24",
    offset: String((page - 1) * 24),
    display_mode: "Full Display",
    sort: "Latest Updates",
    order: "Descending",
    official: "Any"
  });
  if (query) parameters.set("text", query.replace(/[!#:\[\]()]/g, " ").replace(/\s+/g, " ").trim());
  const items = wcCards(await wcRuntime.request(`https://weebcentral.com/search/data?${parameters}`));
  return { items, metadata: items.length ? { page: page + 1 } : null };
}

async function wcDetails(value) {
  const id = wcWorkID(value);
  const shareURL = `https://weebcentral.com${id}`;
  const html = await wcRuntime.request(shareURL);
  const title = mrTextContent(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")
    || id.split("/").pop()?.replace(/[-_]+/g, " ") || "WeebCentral title";
  const image = mrTags(html, "img").find(item => /cover|poster|series/i.test(`${mrAttribute(item.tag, "alt")} ${mrAttribute(item.tag, "class")}`))?.tag
    || mrTags(html, "img")[0]?.tag || "";
  const imageUrl = mrAbsoluteURL(mrAttribute(image, "src") || mrAttribute(image, "data-src"), shareURL);
  const description = mrTextContent(html.match(/Description[\s\S]{0,800}?<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
  const status = mrTextContent(html.match(/Status[\s\S]{0,500}?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
  return {
    workId: id,
    title,
    imageUrl,
    coverURL: imageUrl,
    contentRating: /\b(?:adult|hentai|mature)\b/i.test(html) ? "ADULT" : "SAFE",
    mediaKind: "manga",
    workInfo: {
      thumbnailUrl: imageUrl,
      synopsis: description,
      primaryTitle: title,
      secondaryTitles: [],
      status: /complete/i.test(status) ? "completed" : /ongoing/i.test(status) ? "ongoing" : /hiatus/i.test(status) ? "hiatus" : "unknown",
      shareUrl: shareURL,
      mediaKind: "manga"
    }
  };
}

async function wcInstallments(work) {
  const id = wcWorkID(work?.workId || work?.id);
  const segments = id.split("/").filter(Boolean);
  const listURL = `https://weebcentral.com/series/${segments[1]}/full-chapter-list`;
  const html = await wcRuntime.request(listURL);
  const result = [];
  const seen = new Set();
  for (const { html: anchor } of mrElements(html, "a")) {
    const href = mrAttribute(anchor, "href");
    if (!href.includes("/chapters/")) continue;
    const parsed = wcRuntime.url(mrAbsoluteURL(href, "https://weebcentral.com"));
    const chapterID = parsed.pathname.replace(/\/$/, "");
    if (seen.has(chapterID)) continue;
    seen.add(chapterID);
    const label = mrTextContent(anchor);
    const number = mrNumber(label.match(/(?:chapter|ch\.?)[^0-9]*([0-9.]+)/i)?.[1]) ?? 0;
    result.push({ installmentId: chapterID, workId: id, langCode: "en", number, title: label || undefined, format: "imageSequence" });
  }
  if (!result.length) throw wcRuntime.operationError("InvalidResponseError", "WeebCentral returned no chapters", "invalidResponse");
  return result;
}

async function wcPages(installment) {
  const chapterID = String(installment?.installmentId || "").replace(/\/$/, "");
  if (!/^\/chapters\/[A-Za-z0-9]+$/.test(chapterID)) {
    throw wcRuntime.operationError("InvalidIdentifierError", "WeebCentral chapter identifier is invalid", "invalidIdentifier");
  }
  const html = await wcRuntime.request(`https://weebcentral.com${chapterID}/images?is_prev=False&reading_style=long_strip`);
  const pages = wcScrollSectionImages(html);
  if (!pages.length) throw wcRuntime.operationError("InvalidResponseError", "WeebCentral chapter contains no page images", "invalidResponse");
  return { id: chapterID, workId: String(installment?.workId || ""), pages };
}

function wcScrollSectionImages(html) {
  const source = String(html || "");
  const sectionTokens = [...source.matchAll(/<\/?section\b[^>]*>/gi)];
  const urls = [];
  for (let index = 0; index < sectionTokens.length; index++) {
    const token = sectionTokens[index];
    if (/^<\//.test(token[0]) || !/scroll/i.test(mrAttribute(token[0], "x-data"))) continue;
    let depth = 1;
    let closing;
    for (let inner = index + 1; inner < sectionTokens.length; inner++) {
      depth += /^<\//.test(sectionTokens[inner][0]) ? -1 : 1;
      if (depth === 0) {
        closing = sectionTokens[inner];
        break;
      }
    }
    if (!closing) continue;
    const contentStart = token.index + token[0].length;
    const content = source.slice(contentStart, closing.index);
    let childDepth = 0;
    const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    for (const child of content.matchAll(/<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi)) {
      const name = child[1].toLowerCase();
      const closingTag = /^<\//.test(child[0]);
      if (closingTag) {
        childDepth = Math.max(0, childDepth - 1);
        continue;
      }
      if (name === "img" && childDepth === 0) {
        const src = mrAttribute(child[0], "src");
        if (src) urls.push(mrAbsoluteURL(src, "https://weebcentral.com"));
      }
      if (!voidTags.has(name) && !/\/\s*>$/.test(child[0])) childDepth++;
    }
  }
  return mrUnique(urls);
}

defineContentExtension({
  id: "WeebCentral",
  apiVersion: "1.0",
  initialize: wcRuntime.initialize,
  settings: () => ({ id: "settings", title: "WeebCentral", fields: [] }),
  discoverSections: () => [{ id: "latest", title: "Latest Updates", type: 0 }, { id: "hot", title: "Hot Updates", type: 0 }],
  discover: input => wcList(input, "", input?.sectionId || input?.section?.id || "latest"),
  searchFilters: () => ({ id: "search", title: "Search", fields: [] }),
  search: input => wcList(input, String(input?.query ?? input?.text ?? "").trim(), "latest"),
  details: wcDetails,
  installments: wcInstallments,
  imagePages: wcPages,
  imagePageContent: input => wcRuntime.image(String(input?.url || input?.pageURL || "")),
  updates: async () => ({ items: [], metadata: null }),
  managedCollections: async () => []
});
