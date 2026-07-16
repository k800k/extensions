/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
const unavailable = () => { const error = new Error("MangaUpdates is awaiting review"); error.name = "ExtensionUnavailableError"; throw error; };
defineTrackerExtension({
  id: "MangaUpdates",
  apiVersion: "1.0",
  initialize: unavailable,
  settings: () => ({ id: "settings", title: "MangaUpdates", fields: [] }),
  authentication: () => ({ mode: "none" }),
  search: unavailable,
  progress: unavailable,
  update: unavailable,
  collections: unavailable
});
