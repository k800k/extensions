/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

import { createHash } from "node:crypto";

const sha256 = value => createHash("sha256").update(value).digest("hex");

function replaceExactlyOnce(source, before, after, patchID) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${patchID} expected its target exactly once`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

const PATCHES = new Map([
  ["LNori", [{
    id: "lnori-live-catalog-selectors-v1",
    expectedBeforeSHA256: "cb18ab61cbe6829337ac00a3e2fc591dba9628139aa42f42ef00f4749e834a1a",
    expectedAfterSHA256: "12b8dde69c8a2ebb633abf40c3937e3cc2ab211c92c4beb059bcbe18015447e2",
    apply(bundle) {
      let result = replaceExactlyOnce(
        bundle,
        "#hero-stack article.hero-card",
        "#hero-stack .hero-carousel-card",
        this.id
      );
      result = replaceExactlyOnce(
        result,
        "n(`#${t}`).first().closest(`header`).next(`ul`).find(`li`)",
        "(t===`seasonal`?n(`[id$='-heading']`).filter((e,t)=>/^(?:winter|spring|summer|fall|autumn)-heading$/.test(n(t).attr(`id`)??``)).first().closest(`section`).find(`.catalog-grid > div`):n(`#library .catalog-grid .library-item`))",
        this.id
      );
      return replaceExactlyOnce(
        result,
        "this.parser.extractSection(t,`winter-heading`)",
        "this.parser.extractSection(t,`seasonal`)",
        this.id
      );
    }
  }]]
]);

export function applyCompatibilityPatches(sourceID, bundle) {
  let patched = bundle;
  const records = [];
  for (const patch of PATCHES.get(sourceID) ?? []) {
    const beforeSHA256 = sha256(patched);
    if (beforeSHA256 !== patch.expectedBeforeSHA256) {
      throw new Error(`${patch.id} refused unexpected input SHA-256 ${beforeSHA256}`);
    }
    patched = patch.apply(patched);
    const afterSHA256 = sha256(patched);
    if (afterSHA256 !== patch.expectedAfterSHA256) {
      throw new Error(`${patch.id} produced unexpected output SHA-256 ${afterSHA256}`);
    }
    records.push({ id: patch.id, beforeSHA256, afterSHA256 });
  }
  return { bundle: patched, records };
}
