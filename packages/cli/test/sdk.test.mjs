/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import * as sdk from "../../sdk/index.js";

test("SDK owns a manko-native API 1.1 declaration with 1.0 compatibility", () => {
  assert.equal(sdk.apiVersion, "1.1");
  assert.deepEqual(sdk.supportedAPIVersions, ["1.0", "1.1"]);
  assert.equal(sdk.defineContentExtension({ id: "demo", apiVersion: sdk.apiVersion, search() {} }).kind, "content");
  assert.equal(sdk.defineTrackerExtension({ id: "tracker", apiVersion: sdk.apiVersion }).kind, "tracker");
  assert.equal("defineThemeExtension" in sdk, false);
  assert.throws(() => sdk.defineContentExtension({ id: "bad id", apiVersion: sdk.apiVersion }));
});
