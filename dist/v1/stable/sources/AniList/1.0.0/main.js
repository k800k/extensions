/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
let context;

const SEARCH_QUERY = `query ($search: String, $format: MediaFormat) {
  Page(page: 1, perPage: 20) {
    media(search: $search, type: MANGA, format: $format) {
      id format title { userPreferred english romaji native } coverImage { large }
    }
  }
}`;
const PROGRESS_QUERY = `query ($mediaID: Int) {
  Media(id: $mediaID, type: MANGA) {
    mediaListEntry { mediaId status score progress progressVolumes updatedAt }
  }
}`;
const UPDATE_MUTATION = `mutation ($mediaID: Int, $status: MediaListStatus, $progress: Int, $progressVolumes: Int, $score: Float) {
  SaveMediaListEntry(mediaId: $mediaID, status: $status, progress: $progress, progressVolumes: $progressVolumes, score: $score) {
    mediaId status score progress progressVolumes updatedAt
  }
}`;
const COLLECTIONS_QUERY = `query {
  MediaListCollection(type: MANGA, chunk: 1, perChunk: 500) {
    lists {
      name entries {
        mediaId
        media { id format title { userPreferred english romaji native } coverImage { large } }
      }
    }
  }
}`;

function decode(response) {
  if (response.status === 401 || response.status === 403) throw new Error("Tracker authentication required");
  if (response.status < 200 || response.status >= 300) throw new Error(`AniList request failed (${response.status})`);
  const bytes = new Uint8Array(context.encoding.fromBase64(response.dataBase64));
  const text = new TextDecoder().decode(bytes);
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("AniList returned malformed JSON"); }
  if (Array.isArray(value.errors) && value.errors.length) {
    throw new Error(`AniList request failed (${value.errors[0].status || "GraphQL"})`);
  }
  if (!value.data) throw new Error("AniList returned no data");
  return value.data;
}

async function graphql(query, variables, authenticated = false) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (authenticated) {
    const token = context.secureState.get("oauth_access_token");
    if (!token) throw new Error("Tracker authentication required");
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await context.http.request({
    url: "https://graphql.anilist.co",
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables })
  });
  return decode(response);
}

function titleOf(media) {
  const title = media && media.title || {};
  return title.userPreferred || title.english || title.romaji || title.native || `AniList ${media.id}`;
}

function mediaKind(media, requested = "manga") {
  return media && media.format === "NOVEL" ? "lightNovel" : requested === "comic" ? "comic" : "manga";
}

function match(media, requested) {
  return {
    id: String(media.id),
    title: titleOf(media),
    coverURL: media.coverImage && media.coverImage.large || null,
    mediaKind: mediaKind(media, requested)
  };
}

function integer(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

defineTrackerExtension({
  id: "AniList",
  apiVersion: "1.1",
  initialize(runtimeContext) { context = runtimeContext; },
  authentication() {
    return {
      mode: "oauth2Implicit",
      authorizationURL: "https://anilist.co/api/v2/oauth/authorize",
      callbackScheme: "manko",
      callbackURL: "manko://oauth/anilist",
      clientIDInfoPlistKey: "MR_ANILIST_OAUTH_CLIENT_ID",
      responseType: "token",
      scopes: []
    };
  },
  async search({ title, kind }) {
    const query = String(title || "").trim();
    if (!query) return [];
    const format = kind === "lightNovel" || kind === "book" ? "NOVEL" : null;
    const data = await graphql(SEARCH_QUERY, { search: query, format });
    return (data.Page && data.Page.media || []).map(media => match(media, kind));
  },
  async progress(remoteWorkID) {
    const mediaID = Number(remoteWorkID);
    if (!Number.isInteger(mediaID) || mediaID <= 0) throw new Error("Invalid AniList media ID");
    const data = await graphql(PROGRESS_QUERY, { mediaID }, true);
    const entry = data.Media && data.Media.mediaListEntry;
    if (!entry) return null;
    return {
      remoteWorkID: String(entry.mediaId || mediaID),
      chapter: entry.progress == null ? null : Number(entry.progress),
      volume: entry.progressVolumes == null ? null : Number(entry.progressVolumes),
      status: entry.status || null,
      score: entry.score == null ? null : Number(entry.score),
      modifiedAt: entry.updatedAt ? new Date(entry.updatedAt * 1000).toISOString() : context.clock.now()
    };
  },
  async update(progress) {
    const mediaID = Number(progress.remoteWorkID);
    if (!Number.isInteger(mediaID) || mediaID <= 0) throw new Error("Invalid AniList media ID");
    const variables = { mediaID };
    if (progress.status) variables.status = String(progress.status).toUpperCase();
    const chapter = integer(progress.chapter); if (chapter !== undefined) variables.progress = chapter;
    const volume = integer(progress.volume); if (volume !== undefined) variables.progressVolumes = volume;
    if (typeof progress.score === "number" && Number.isFinite(progress.score)) variables.score = Math.max(0, Math.min(100, progress.score));
    await graphql(UPDATE_MUTATION, variables, true);
  },
  async collections() {
    const data = await graphql(COLLECTIONS_QUERY, {}, true);
    const lists = data.MediaListCollection && data.MediaListCollection.lists || [];
    return {
      items: lists.map((list, index) => ({
        id: `anilist-${index}-${String(list.name || "list").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: list.name || "AniList",
        items: (list.entries || []).filter(entry => entry.media).map(entry => match(entry.media, "manga"))
      })),
      nextPage: null,
      totalCount: lists.length,
      nextCursor: null
    };
  }
});
