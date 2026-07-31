/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MINIMAL_PNG_BYTES,
  loadContentExtension,
  makeTextDocument,
  runtimeResponse
} from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.js");

test("AllPornComic retries with a cookie saved by visible verification", async () => {
  const challenged = await loadContentExtension(mainPath, request => runtimeResponse({
    url: request.url,
    status: 403,
    headers: { "cf-mitigated": "challenge", "content-type": "text/html" },
    text: "<title>Just a moment...</title>"
  }), { document: makeTextDocument() });

  await assert.rejects(
    () => challenged.extension.imagePageContent({ url: "https://allporncomic.com/page.png" }),
    error => error?.name === "ChallengeRequiredError"
      && error?.type === "challengeRequired"
      && error?.url === "https://allporncomic.com"
  );
  assert.deepEqual(challenged.challenges, ["https://allporncomic.com"]);

  const clearance = {
    name: "cf_clearance",
    value: "saved-after-visible-verification",
    domain: "allporncomic.com",
    path: "/",
    expires: "2099-01-01T00:00:00.000Z"
  };
  const recovered = await loadContentExtension(mainPath, request => {
    assert.equal(request.cookies?.cf_clearance, clearance.value, "fresh runtime sends the saved verification cookie");
    return runtimeResponse({
      url: request.url,
      mimeType: "image/png",
      headers: { "content-type": "image/png" },
      bytes: MINIMAL_PNG_BYTES
    });
  }, {
    document: makeTextDocument(),
    initialState: { cookie_store_cookies: [clearance] }
  });

  const image = await recovered.extension.imagePageContent({ url: "https://allporncomic.com/page.png" });
  assert.equal(image.mimeType, "image/png");
  assert.equal(image.dataBase64, Buffer.from(MINIMAL_PNG_BYTES).toString("base64"));
  assert.deepEqual(recovered.challenges, []);
});
