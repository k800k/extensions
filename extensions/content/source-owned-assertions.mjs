/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertContentExtension } from "../../packages/cli/lib/contracts.mjs";

const AIDOKU_COMMIT = "1faa9c5cfbf67af7cd18a302045a8d093e35867f";

export async function assertSourceOwnedContent(directory, id, apiVersion = "1.0") {
  const metadata = await assertContentExtension(directory, id);
  const configuration = JSON.parse(await readFile(join(directory, "source-owned.json"), "utf8"));
  const provenance = JSON.parse(await readFile(join(directory, "provenance.json"), "utf8"));
  const notice = await readFile(join(directory, "NOTICE"), "utf8");
  const license = await readFile(join(directory, "LICENSE"), "utf8");
  assert.equal(metadata.apiVersion, apiVersion);
  assert.equal(metadata.availability, "approvalRequired");
  assert.equal(metadata.license, "Apache-2.0");
  assert.equal(configuration.id, id);
  assert.equal(configuration.upstreamCommit, AIDOKU_COMMIT);
  assert.equal(provenance.sourceOwned, true);
  assert.equal(provenance.id, id);
  assert.equal(provenance.releaseVersion, metadata.version);
  assert.equal(provenance.upstream.commit, AIDOKU_COMMIT);
  assert.match(notice, /Aidoku Community Sources/);
  assert.match(license, /Apache License/);
  return metadata;
}
