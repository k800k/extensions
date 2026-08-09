/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertMangaBoxBehavior,
  assertMangaBoxImageDataBounds,
  assertMangaBoxVerificationCookieRetry
} from "../../mangabox-behavior.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
test("MangaKakalot parses real-shape cover, details, chapter API, pages, and images", () => {
  return assertMangaBoxBehavior(mainPath, "www.mangakakalot.gg");
});
test("MangaKakalot fails closed on malformed or oversized site image data", () => {
  return assertMangaBoxImageDataBounds(mainPath, "www.mangakakalot.gg");
});
test("MangaKakalot retries with a cookie saved by visible verification", () => {
  return assertMangaBoxVerificationCookieRetry(mainPath, "www.mangakakalot.gg");
});
