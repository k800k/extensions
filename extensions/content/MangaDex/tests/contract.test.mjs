/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { assertContentExtension } from "../../../../packages/cli/lib/contracts.mjs";
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("MangaDex is a provenance-pinned Paperback compatibility port", async () => {
  const metadata = await assertContentExtension(directory, "MangaDex");
  if (metadata.apiVersion !== "1.0") throw new Error("unexpected API version");
  if (metadata.availability !== "approvalRequired") throw new Error("imported package did not retain approvalRequired metadata");
  const license = await readFile(join(directory, "LICENSE"), "utf8");
  if (!license.includes("GNU GENERAL PUBLIC LICENSE")) throw new Error("GPL package license is missing");
});
