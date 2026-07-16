/*
 * Copyright 2026 MangaReader Extension Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const apiVersion = "1.0";

function definition(kind, value) {
  if (!value || typeof value !== "object") throw new TypeError("An extension declaration is required");
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value.id ?? "")) throw new TypeError("Invalid extension id");
  if (value.apiVersion !== apiVersion) throw new TypeError(`Expected MangaReader API ${apiVersion}`);
  return Object.freeze({ ...value, kind });
}

export function defineContentExtension(value) {
  return definition("content", value);
}

export function defineTrackerExtension(value) {
  return definition("tracker", value);
}

export function unavailable(message = "This extension is not approved for activation") {
  const error = new Error(message);
  error.name = "ExtensionUnavailableError";
  throw error;
}
