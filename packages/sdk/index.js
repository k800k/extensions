/*
 * Copyright 2026 MangaReader Extension Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const apiVersion = "1.1";
export const supportedAPIVersions = Object.freeze(["1.0", "1.1"]);

function definition(kind, value) {
  if (!value || typeof value !== "object") throw new TypeError("An extension declaration is required");
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value.id ?? "")) throw new TypeError("Invalid extension id");
  if (!supportedAPIVersions.includes(value.apiVersion)) {
    throw new TypeError(`Expected a supported MangaReader API version (${supportedAPIVersions.join(", ")})`);
  }
  return Object.freeze({ ...value, kind });
}

export function defineContentExtension(value) {
  return definition("content", value);
}

export function defineTrackerExtension(value) {
  return definition("tracker", value);
}

export function unavailable(message = "This extension is unavailable") {
  const error = new Error(message);
  error.name = "ExtensionUnavailableError";
  throw error;
}
