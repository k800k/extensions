/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
let context;
const API = "https://api.myanimelist.net/v2";

function decode(response) {
  if (response.status === 401 || response.status === 403) throw new Error("Tracker authentication required");
  if (response.status < 200 || response.status >= 300) throw new Error(`MyAnimeList request failed (${response.status})`);
  const bytes = new Uint8Array(context.encoding.fromBase64(response.dataBase64));
  const text = new TextDecoder().decode(bytes);
  let value;
  try { value = text ? JSON.parse(text) : {}; } catch { throw new Error("MyAnimeList returned malformed JSON"); }
  return value;
}

async function request(path, { method = "GET", query, form } = {}) {
  const token = context.secureState.get("oauth_access_token");
  if (!token) throw new Error("Tracker authentication required");
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(query || {})) if (value != null) url.searchParams.set(key, String(value));
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
  let body;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(Object.entries(form).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])).toString();
  }
  return context.http.request({ url: url.href, method, headers, body });
}

function mediaKind(mediaType, requested = "manga") {
  return mediaType === "novel" || mediaType === "light_novel" ? "lightNovel" : requested === "comic" ? "comic" : "manga";
}

function match(node, requested) {
  return {
    id: String(node.id),
    title: String(node.title || `MyAnimeList ${node.id}`),
    coverURL: node.main_picture && (node.main_picture.large || node.main_picture.medium) || null,
    mediaKind: mediaKind(node.media_type, requested)
  };
}

function canonicalStatus(status, rereading) {
  if (rereading) return "REPEATING";
  return ({ reading: "CURRENT", plan_to_read: "PLANNING", completed: "COMPLETED", dropped: "DROPPED", on_hold: "PAUSED" })[status] || null;
}

function nativeStatus(status) {
  const canonical = String(status || "").toUpperCase();
  if (canonical === "REPEATING") return { status: "reading", is_rereading: "true" };
  const value = ({ CURRENT: "reading", PLANNING: "plan_to_read", COMPLETED: "completed", DROPPED: "dropped", PAUSED: "on_hold" })[canonical];
  if (!value) return {};
  return { status: value, is_rereading: "false" };
}

function nonnegativeInteger(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

defineTrackerExtension({
  id: "MyAnimeList",
  apiVersion: "1.1",
  initialize(runtimeContext) { context = runtimeContext; },
  authentication() {
    return {
      mode: "oauth2PKCE",
      authorizationURL: "https://myanimelist.net/v1/oauth2/authorize",
      tokenURL: "https://myanimelist.net/v1/oauth2/token",
      callbackScheme: "manko",
      callbackURL: "manko://oauth/myanimelist",
      clientIDInfoPlistKey: "MR_MYANIMELIST_OAUTH_CLIENT_ID",
      responseType: "code",
      scopes: [],
      pkceMethod: "plain"
    };
  },
  async search({ title, kind }) {
    const query = String(title || "").trim();
    if (!query) return [];
    const response = await request("/manga", { query: { q: query, limit: 20, fields: "media_type" } });
    return (decode(response).data || []).map(edge => match(edge.node, kind));
  },
  async progress(remoteWorkID) {
    const mangaID = Number(remoteWorkID);
    if (!Number.isInteger(mangaID) || mangaID <= 0) throw new Error("Invalid MyAnimeList manga ID");
    const response = await request(`/manga/${mangaID}`, { query: { fields: "my_list_status" } });
    if (response.status === 404) return null;
    const manga = decode(response);
    const status = manga.my_list_status;
    if (!status) return null;
    return {
      remoteWorkID: String(mangaID),
      chapter: Number(status.num_chapters_read || 0),
      volume: Number(status.num_volumes_read || 0),
      status: canonicalStatus(status.status, status.is_rereading),
      score: Number(status.score || 0) * 10,
      modifiedAt: status.updated_at || context.clock.now()
    };
  },
  async update(progress) {
    const mangaID = Number(progress.remoteWorkID);
    if (!Number.isInteger(mangaID) || mangaID <= 0) throw new Error("Invalid MyAnimeList manga ID");
    const form = nativeStatus(progress.status);
    const chapter = nonnegativeInteger(progress.chapter); if (chapter !== undefined) form.num_chapters_read = chapter;
    const volume = nonnegativeInteger(progress.volume); if (volume !== undefined) form.num_volumes_read = volume;
    if (typeof progress.score === "number" && Number.isFinite(progress.score)) form.score = Math.max(0, Math.min(10, Math.round(progress.score / 10)));
    if (!Object.keys(form).length) throw new Error("No MyAnimeList progress fields were supplied");
    decode(await request(`/manga/${mangaID}/my_list_status`, { method: "PUT", form }));
  },
  async collections({ cursor } = {}) {
    const offset = Number(cursor && cursor.offset || 0);
    const response = await request("/users/@me/mangalist", {
      query: { limit: 100, offset, fields: "media_type,list_status" }
    });
    const payload = decode(response);
    const groups = new Map();
    for (const edge of payload.data || []) {
      const status = edge.list_status && edge.list_status.status || "unknown";
      if (!groups.has(status)) groups.set(status, []);
      groups.get(status).push(match(edge.node, "manga"));
    }
    const labels = { reading: "Reading", plan_to_read: "Plan to Read", completed: "Completed", dropped: "Dropped", on_hold: "On Hold" };
    const hasNext = Boolean(payload.paging && payload.paging.next);
    return {
      items: [...groups.entries()].map(([status, items]) => ({ id: `mal-${status}`, title: labels[status] || status, items })),
      nextPage: null,
      totalCount: null,
      nextCursor: hasNext ? { value: JSON.stringify({ offset: offset + 100 }) } : null
    };
  }
});
