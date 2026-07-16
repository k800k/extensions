/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
const APP_LINK = "https://kayvenchen.github.io/mangareader/repository";
const MAX_SELECTION = 100;
const MAX_LINK_BYTES = 8192;
const elements = Object.fromEntries(["search", "language", "rating", "kind", "status", "capability", "catalog", "selected-count", "visible-count", "select-visible", "clear", "share", "install-selected", "install-all", "add-repository", "notice", "card-template"].map(id => [id, document.getElementById(id)]));
const selection = new Set(new URL(location.href).searchParams.getAll("source"));
let sources = [];
let repositoryURL = "";

const bytes = value => new TextEncoder().encode(value).length;
const installLink = ids => {
  if (!ids.length || ids.length > MAX_SELECTION) throw new Error(`Choose between 1 and ${MAX_SELECTION} entries.`);
  const url = new URL(`${APP_LINK}/install`);
  url.searchParams.set("url", repositoryURL);
  ids.forEach(id => url.searchParams.append("source", id));
  if (bytes(url.href) > MAX_LINK_BYTES) throw new Error("This selection exceeds MangaReader's 8 KiB link limit.");
  return url.href;
};

function filtered() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  return sources.filter(source => (!query || `${source.name} ${source.id}`.toLocaleLowerCase().includes(query))
    && (!elements.language.value || source.languages.includes(elements.language.value))
    && (!elements.rating.value || source.contentRating === elements.rating.value)
    && (!elements.kind.value || source.kind === elements.kind.value)
    && (!elements.status.value || source.availability === elements.status.value)
    && (!elements.capability.value || source.inventoryCapabilities.map(String).includes(elements.capability.value)));
}

function updateLinks() {
  const ids = [...selection].filter(id => sources.some(source => source.id === id));
  elements["selected-count"].textContent = `${ids.length} selected`;
  elements["visible-count"].textContent = `${filtered().length} visible`;
  if (ids.length) {
    try { elements["install-selected"].href = installLink(ids); elements["install-selected"].ariaDisabled = "false"; elements.notice.textContent = "MangaReader will show a per-entry review. Approval-required entries remain disabled metadata and are never downloaded or executed."; }
    catch (error) { elements["install-selected"].removeAttribute("href"); elements["install-selected"].ariaDisabled = "true"; elements.notice.textContent = error.message; }
  } else {
    elements["install-selected"].removeAttribute("href"); elements["install-selected"].ariaDisabled = "true";
  }
  const share = new URL(location.href); share.search = ""; ids.forEach(id => share.searchParams.append("source", id)); history.replaceState(null, "", share);
}

function render() {
  elements.catalog.replaceChildren();
  for (const source of filtered()) {
    const card = document.importNode(elements["card-template"].content, true);
    const article = card.querySelector("article");
    const checkbox = card.querySelector("input");
    checkbox.checked = selection.has(source.id);
    checkbox.setAttribute("aria-label", `Select ${source.name}`);
    checkbox.addEventListener("change", () => { checkbox.checked ? selection.add(source.id) : selection.delete(source.id); updateLinks(); });
    const image = card.querySelector("img"); image.src = `dist/v1/stable/${source.icon}`; image.alt = `${source.name} generated placeholder`;
    card.querySelector("h2").textContent = source.name;
    card.querySelector(".status").textContent = source.availability.replace(/([A-Z])/g, " $1");
    card.querySelector(".meta").textContent = `${source.kind === "tracker" ? "Tracker" : "Content"} · ${source.languages.join(", ")} · ${source.contentRating}`;
    card.querySelector(".description").textContent = source.description;
    const details = [["ID", source.id], ["API", source.mangaReaderExtension.apiVersion], ["Registry categories", source.inventoryCapabilities.join(", ") || "None"], ["Permissions", source.permissions.values.join(", ")], ["Hosts", source.mangaReaderExtension.allowedHTTPSHosts.join(", ")], ["Package SHA-256", source.packageSHA256]];
    const dl = card.querySelector("dl");
    for (const [term, value] of details) { const dt = document.createElement("dt"); dt.textContent = term; const dd = document.createElement("dd"); dd.textContent = value; dl.append(dt, dd); }
    article.dataset.id = source.id;
    elements.catalog.append(card);
  }
  updateLinks();
}

const response = await fetch("dist/v1/stable/catalog.json", { cache: "no-store" });
if (!response.ok) throw new Error("Catalog metadata is unavailable.");
({ sources, repositoryURL } = await response.json());
const languages = [...new Set(sources.flatMap(source => source.languages))].sort();
for (const language of languages) elements.language.add(new Option(language, language));
const capabilities = [...new Set(sources.flatMap(source => source.inventoryCapabilities.map(String)))].sort((a, b) => Number(a) - Number(b));
for (const capability of capabilities) elements.capability.add(new Option(`Registry category ${capability}`, capability));
elements["add-repository"].href = `${APP_LINK}/add?url=${encodeURIComponent(repositoryURL)}`;
elements["install-all"].href = installLink(sources.map(source => source.id));
for (const id of ["search", "language", "rating", "kind", "status", "capability"]) elements[id].addEventListener("input", render);
elements["select-visible"].addEventListener("click", () => { filtered().forEach(source => selection.add(source.id)); render(); });
elements.clear.addEventListener("click", () => { selection.clear(); render(); });
elements.share.addEventListener("click", async () => { await navigator.clipboard.writeText(location.href); elements.notice.textContent = "Selection link is ready."; });
render();
