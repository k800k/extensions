/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertTrackerExtension } from "../../../../packages/cli/lib/contracts.mjs";
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("AniList is a valid tracker extension package", async () => { await assertTrackerExtension(directory, "AniList"); });
