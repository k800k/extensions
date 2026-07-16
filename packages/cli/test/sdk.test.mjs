/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { apiVersion, defineContentExtension, defineTrackerExtension } from "../../sdk/index.js";

test("SDK owns a MangaReader-native API v1 declaration", () => {
  assert.equal(apiVersion, "1.0");
  assert.equal(defineContentExtension({ id: "demo", apiVersion, search() {} }).kind, "content");
  assert.equal(defineTrackerExtension({ id: "tracker", apiVersion, search() {} }).kind, "tracker");
  assert.throws(() => defineContentExtension({ id: "bad id", apiVersion }));
});
