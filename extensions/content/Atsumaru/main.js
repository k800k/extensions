/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
const unavailable = () => { const error = new Error("Atsumaru is awaiting review"); error.name = "ExtensionUnavailableError"; throw error; };
defineContentExtension({
  id: "Atsumaru",
  apiVersion: "1.0",
  initialize: unavailable,
  settings: () => ({ id: "settings", title: "Atsumaru", fields: [] }),
  discoverSections: unavailable,
  discover: unavailable,
  searchFilters: () => ({ id: "search", title: "Search", fields: [] }),
  search: unavailable,
  details: unavailable,
  installments: unavailable,
  imagePages: unavailable,
  imagePageContent: unavailable,
  updates: unavailable,
  managedCollections: unavailable
});
