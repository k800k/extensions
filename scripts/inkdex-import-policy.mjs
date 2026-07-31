/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import { SOURCE_OWNED_CONTENT_IDS, sourceOwnedContentIDs } from "./source-owned.mjs";

// Legacy export retained for importer consumers. These packages now all have
// deterministic repository-owned source and must never be replaced by InkDex.
export const HAND_AUTHORED_SOURCE_IDS = SOURCE_OWNED_CONTENT_IDS;
const handAuthoredSources = sourceOwnedContentIDs;

export function assertNoHandAuthoredMappings(mappings) {
  const overlap = mappings.map(source => source.id).filter(id => handAuthoredSources.has(id));
  if (overlap.length) {
    throw new Error(`InkDex mapping must not include hand-authored sources: ${overlap.join(", ")}`);
  }
}

export function assertGeneratedImportRequest(requestedIDs) {
  const overlap = (requestedIDs ?? []).filter(id => handAuthoredSources.has(id));
  if (overlap.length) {
    throw new Error(`InkDex importer cannot overwrite hand-authored sources: ${overlap.join(", ")}`);
  }
}
