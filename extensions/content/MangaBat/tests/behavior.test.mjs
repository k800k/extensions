/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertMangaBoxBehavior, assertMangaBoxImageDataBounds } from "../../mangabox-behavior.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");
test("MangaBat parses real-shape cover, details, chapter API, pages, and images", () => {
  return assertMangaBoxBehavior(mainPath, "www.mangabats.com");
});
test("MangaBat fails closed on malformed or oversized site image data", () => {
  return assertMangaBoxImageDataBounds(mainPath, "www.mangabats.com");
});
