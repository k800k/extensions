/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

const mdRuntime = mrCreateRuntime({
  name: "MangaDemon",
  baseURL: "https://demonicscans.org",
  challengeURL: "https://demonicscans.org/",
  referer: "https://demonicscans.org/",
  userAgent: "MangaReader MangaDemon/1.0.0-alpha.18",
  allowedHosts: ["demonicscans.org", "demoniclibs.com", "cdn.demoniclibs.com", "librarydm.com", "mangareadon.org", "readermc.org"]
});

function mdMangaID(value) {
  const raw = String(value || "").trim();
  let candidate = raw;
  if (raw.includes("/") || raw.includes(":")) {
    const parsed = mdRuntime.url(raw);
    const match = parsed.pathname.match(/\/(?:manga|title)\/([^/]+)/i);
    candidate = match?.[1] || "";
  }
  if (!candidate || candidate.length > 300 || !/^[A-Za-z0-9%._~-]+$/.test(candidate)) {
    throw mdRuntime.operationError("InvalidIdentifierError", "MangaDemon work identifier is invalid", "invalidIdentifier");
  }
  return candidate;
}

function mdCard(anchor, html) {
  const href = mrAttribute(anchor, "href");
  if (!/\/(?:manga|title)\//i.test(href)) return null;
  let id;
  try {
    id = mdMangaID(mrAbsoluteURL(href, "https://demonicscans.org"));
  } catch {
    return null;
  }
  const nearby = mrWindow(html, html.indexOf(anchor), 1200, 1800);
  const image = mrTags(nearby, "img").find(item => mrAttribute(item.tag, "src") || mrAttribute(item.tag, "data-src"))?.tag || "";
  const imageUrl = mrAbsoluteURL(mrAttribute(image, "src") || mrAttribute(image, "data-src"), "https://demonicscans.org");
  const title = mrAttribute(anchor, "title") || mrTextContent(anchor) || mrAttribute(image, "title") || mrAttribute(image, "alt");
  if (!title) return null;
  return { type: "work", workId: id, title, imageUrl, coverURL: imageUrl, contentRating: "SAFE", mediaKind: "manga" };
}

function mdCards(html) {
  const seen = new Set();
  const result = [];
  for (const { html: anchor } of mrElements(html, "a")) {
    const card = mdCard(anchor, html);
    if (!card || seen.has(card.workId)) continue;
    seen.add(card.workId);
    result.push(card);
  }
  return result;
}

async function mdList(input, query) {
  const page = mdRuntime.page(input);
  const requestURL = query
    ? `https://demonicscans.org/search.php?manga=${encodeURIComponent(query)}`
    : `https://demonicscans.org/advanced.php?list=${page}&orderby=${encodeURIComponent("VIEWS DESC")}`;
  const html = await mdRuntime.request(requestURL);
  const items = mdCards(html);
  const hasNext = !query && (/pagination[\s\S]{0,1200}>\s*Next\s*</i.test(html) || items.length > 0);
  return { items, metadata: hasNext ? { page: page + 1 } : null };
}

async function mdDetails(value) {
  const id = mdMangaID(value);
  const shareURL = `https://demonicscans.org/manga/${id}`;
  const html = await mdRuntime.request(shareURL);
  const title = mrTextContent(html.match(/<h1\b[^>]*class\s*=\s*["'][^"']*big-fat-titles[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")
    || decodeURIComponent(id).replace(/[-_]+/g, " ");
  const coverTag = html.match(/id\s*=\s*["']manga-page["'][\s\S]{0,1000}?(<img\b[^>]*>)/i)?.[1] || "";
  const imageUrl = mrAbsoluteURL(mrAttribute(coverTag, "src") || mrAttribute(coverTag, "data-src"), shareURL);
  const description = mrTextContent(html.match(/manga-info-rightColumn[\s\S]{0,5000}?white-font[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const statusText = mrTextContent(html.match(/Status[\s\S]{0,400}?<li\b[^>]*>([\s\S]*?)<\/li>/i)?.[1] || "");
  return {
    workId: id,
    title,
    imageUrl,
    coverURL: imageUrl,
    contentRating: "SAFE",
    mediaKind: "manga",
    workInfo: {
      thumbnailUrl: imageUrl,
      synopsis: description,
      primaryTitle: title,
      secondaryTitles: [],
      status: /complete/i.test(statusText) ? "completed" : /ongoing/i.test(statusText) ? "ongoing" : "unknown",
      shareUrl: shareURL,
      mediaKind: "manga"
    }
  };
}

async function mdInstallments(work) {
  const id = mdMangaID(work?.workId || work?.id);
  const html = await mdRuntime.request(`https://demonicscans.org/manga/${id}`);
  const result = [];
  const seen = new Set();
  for (const { html: anchor } of mrElements(html, "a")) {
    const href = mrAttribute(anchor, "href");
    if (!href.includes("/chaptered.php")) continue;
    const parsed = mdRuntime.url(mrAbsoluteURL(href, "https://demonicscans.org"));
    const installmentId = `${parsed.pathname}${parsed.search}`;
    if (seen.has(installmentId)) continue;
    seen.add(installmentId);
    const label = mrTextContent(anchor);
    result.push({
      installmentId,
      workId: id,
      langCode: "en",
      number: mrNumber(label.match(/chapter\s*([0-9.]+)/i)?.[1]) ?? 0,
      title: label || undefined,
      format: "imageSequence"
    });
  }
  if (!result.length) throw mdRuntime.operationError("InvalidResponseError", "MangaDemon returned no chapters", "invalidResponse");
  return result;
}

async function mdPages(installment) {
  const id = String(installment?.installmentId || "");
  if (!id.startsWith("/chaptered.php?")) throw mdRuntime.operationError("InvalidIdentifierError", "MangaDemon chapter identifier is invalid", "invalidIdentifier");
  const html = await mdRuntime.request(`https://demonicscans.org${id}`);
  const pages = mrUnique(mrTags(html, "img")
    .filter(item => /\bimgholder\b/i.test(mrAttribute(item.tag, "class")))
    .map(item => mrAbsoluteURL(mrAttribute(item.tag, "src") || mrAttribute(item.tag, "data-src"), "https://demonicscans.org")));
  if (!pages.length) throw mdRuntime.operationError("InvalidResponseError", "MangaDemon chapter contains no page images", "invalidResponse");
  return { id, workId: String(installment?.workId || ""), pages };
}

defineContentExtension({
  id: "MangaDemon",
  apiVersion: "1.0",
  initialize: mdRuntime.initialize,
  settings: () => ({ id: "settings", title: "MangaDemon", fields: [] }),
  discoverSections: () => [{ id: "popular", title: "Popular", type: 0 }, { id: "latest", title: "Latest", type: 0 }],
  discover: input => mdList(input, ""),
  searchFilters: () => ({ id: "search", title: "Search", fields: [] }),
  search: input => mdList(input, String(input?.query ?? input?.text ?? "").trim()),
  details: mdDetails,
  installments: mdInstallments,
  imagePages: mdPages,
  imagePageContent: input => mdRuntime.image(String(input?.url || input?.pageURL || "")),
  updates: async () => ({ items: [], metadata: null }),
  managedCollections: async () => []
});
