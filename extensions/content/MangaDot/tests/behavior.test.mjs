/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MINIMAL_WEBP_BYTES,
  loadContentExtension,
  runtimeResponse
} from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
const origin = "https://mangadot.net";

const manga = {
  id: 7,
  title: "Fixture Manga",
  photo: "/covers/fixture.webp",
  banner_image: "/covers/banner.webp",
  description: "A MangaDot behavioral fixture.",
  alt_titles: ["Fixture Alternate"],
  authors: ["Fixture Author"],
  artists: ["Fixture Artist"],
  avg_rating: 8,
  status: "ongoing",
  content_rating: "safe",
  genres: ["Adventure"]
};

function json(request, value) {
  return runtimeResponse({
    url: request.url,
    headers: { "content-type": "application/json" },
    text: JSON.stringify(value)
  });
}

test("MangaDot parses discovery, details, chapters, pages, and image bytes", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/search") {
      assert.equal(url.searchParams.get("sortBy"), "views");
      assert.equal(url.searchParams.get("sortOrder"), "desc");
      return json(request, {
        manga_list: [{ ...manga, chapter_count: 12, last_chapter_date: "2026-01-02 03:04:05" }],
        pagination: { total_pages: 1 }
      });
    }
    if (url.pathname === "/api/manga/genres") {
      return json(request, ["Adventure", "Shounen"]);
    }
    if (url.pathname === "/api/manga/7") return json(request, { manga });
    if (url.pathname === "/api/manga/7/volumes") {
      return json(request, [{ cover_url: "/covers/volume.webp" }]);
    }
    if (url.pathname === "/api/manga/7/chapters/list") {
      return json(request, [{
        id: 70,
        language: "en",
        chapter_number: 12,
        chapter_title: "Fixture Chapter",
        group_name: "Fixture Group",
        volume_number: 2,
        date_added: "2026-01-02 03:04:05",
        uploader_upload_status: "ordinary"
      }]);
    }
    if (url.pathname === "/api/chapters/70/images") {
      assert.equal(request.headers.referer, `${origin}/manga/7`);
      return json(request, { images: [{ url: "/pages/one.webp" }] });
    }
    if (url.pathname === "/pages/one.webp") {
      return runtimeResponse({
        url: request.url,
        mimeType: "image/webp",
        bytes: MINIMAL_WEBP_BYTES
      });
    }
    throw new Error(`Unexpected MangaDot fixture request ${request.url}`);
  });

  const sections = await loaded.extension.discoverSections();
  const mostViewed = sections.find(section => section.id === "most_viewed");
  assert.ok(mostViewed, "MangaDot exposes its Most Viewed discovery section");

  const discovery = await loaded.extension.discover({ section: mostViewed });
  assert.equal(discovery.items.length, 1);
  assert.equal(discovery.items[0].workId, "7");
  assert.equal(discovery.items[0].title, manga.title);

  const work = await loaded.extension.details("7");
  assert.equal(work.workId, "7");
  assert.equal(work.workInfo.primaryTitle, manga.title);
  assert.equal(work.workInfo.author, "Fixture Author");

  const installments = await loaded.extension.installments(work);
  assert.equal(installments.length, 1);
  assert.equal(installments[0].installmentId, "70");
  assert.equal(installments[0].number, 12);

  const sequence = await loaded.extension.imagePages(installments[0]);
  assert.deepEqual(Array.from(sequence.pages), [`${origin}/pages/one.webp`]);

  const image = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(image.mimeType, "image/webp");
  assert.deepEqual(Array.from(Buffer.from(image.dataBase64, "base64")), MINIMAL_WEBP_BYTES);
});

test("MangaDot converts a managed challenge into the visible handoff contract", async () => {
  const loaded = await loadContentExtension(mainPath, request => runtimeResponse({
    url: request.url,
    status: 403,
    headers: { "cf-mitigated": "challenge", "content-type": "text/html" },
    text: "<!doctype html><title>Just a moment…</title>"
  }));

  await assert.rejects(
    loaded.extension.discover({ section: { id: "most_viewed", title: "Most Viewed" } }),
    error => error?.name === "ChallengeRequiredError"
      && /Cloudflare (verification|bypass)/i.test(error.message)
  );
  assert.deepEqual(loaded.challenges, [`${origin}/`]);
});
