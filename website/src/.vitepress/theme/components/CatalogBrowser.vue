<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 manko Extension Contributors -->

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  buildInstallLink,
  catalogURLForRepository,
  DEFAULT_CATALOG,
  formatBytes,
  formatLabel,
  normalizeCatalog,
  normalizeRepositoryURL,
  type CatalogSource,
  type Repository,
} from "../lib/catalog";

type FilterDimension = "kinds" | "ratings" | "languages" | "repositories";
type FilterState = Record<FilterDimension, { include: Set<string>; exclude: Set<string> }>;

interface FilterOption {
  value: string;
  label: string;
}

interface FilterGroup {
  dimension: FilterDimension;
  title: string;
  options: FilterOption[];
}

interface InstallGroup {
  repository: Repository;
  sources: CatalogSource[];
  href: string;
}

const STORAGE_KEY = "manko-custom-catalogs-v1";
const FILTER_QUERY: Record<FilterDimension, { include: string; exclude: string }> = {
  kinds: { include: "type", exclude: "excludeType" },
  ratings: { include: "rating", exclude: "excludeRating" },
  languages: { include: "language", exclude: "excludeLanguage" },
  repositories: { include: "repository", exclude: "excludeRepository" },
};
const KNOWN_STATE_PARAMS = [
  "q",
  "catalog",
  "source",
  "selectedOnly",
  "details",
  ...Object.values(FILTER_QUERY).flatMap((names) => [names.include, names.exclude]),
];

function createFilters(useSafeDefault = false): FilterState {
  return {
    kinds: { include: new Set(), exclude: new Set() },
    ratings: {
      include: new Set(useSafeDefault ? ["safe"] : []),
      exclude: new Set(),
    },
    languages: { include: new Set(), exclude: new Set() },
    repositories: { include: new Set(), exclude: new Set() },
  };
}

const repositories = ref<Repository[]>([DEFAULT_CATALOG.repository]);
const sources = ref<CatalogSource[]>([...DEFAULT_CATALOG.sources]);
const customRepositoryURLs = ref<string[]>([]);
const loadingRepositoryURLs = ref<Set<string>>(new Set());
const repositoryInput = ref("");
const repositoryMessage = ref("");

const searchQuery = ref("");
const filters = ref<FilterState>(createFilters(true));
const selectedKeys = ref<Set<string>>(new Set());
const showOnlySelected = ref(false);
const detailsKey = ref<string | null>(null);
const filtersExpanded = ref(false);
const repositoriesExpanded = ref(false);
const installOptionsExpanded = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
const hydrated = ref(false);

const notification = ref<{ type: "success" | "error"; title: string; message: string } | null>(
  null,
);
let notificationTimer: number | undefined;

function showNotification(type: "success" | "error", title: string, message: string) {
  notification.value = { type, title, message };
  if (notificationTimer) window.clearTimeout(notificationTimer);
  notificationTimer = window.setTimeout(() => {
    notification.value = null;
  }, type === "error" ? 7000 : 4000);
}

function normalizedValue(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueOptions(values: Iterable<string>): FilterOption[] {
  return [...new Set([...values].map(normalizedValue).filter(Boolean))]
    .sort((left, right) => formatLabel(left).localeCompare(formatLabel(right)))
    .map((value) => ({ value, label: formatLabel(value) }));
}

const filterGroups = computed<FilterGroup[]>(() => {
  const presentRatings = new Set(sources.value.map((source) => normalizedValue(source.contentRating)));
  const ratingOrder = ["safe", "mature", "adult", "unknown"].filter((rating) =>
    presentRatings.has(rating),
  );
  return [
    {
      dimension: "kinds",
      title: "Type",
      options: uniqueOptions(sources.value.map((source) => source.kind)),
    },
    {
      dimension: "ratings",
      title: "Content rating",
      options: ratingOrder.map((value) => ({ value, label: formatLabel(value) })),
    },
    {
      dimension: "languages",
      title: "Languages",
      options: uniqueOptions(sources.value.flatMap((source) => source.languages)),
    },
  ];
});

function sourceValues(source: CatalogSource, dimension: FilterDimension): string[] {
  switch (dimension) {
    case "kinds":
      return [normalizedValue(source.kind)];
    case "ratings":
      return [normalizedValue(source.contentRating)];
    case "languages":
      return source.languages.map(normalizedValue);
    case "repositories":
      return [source.repository.url];
  }
}

function matchesFilters(source: CatalogSource): boolean {
  const query = normalizedValue(searchQuery.value);
  if (query) {
    const searchable = [
      source.name,
      source.id,
      source.description,
      source.contentRating,
      source.kind,
      source.repository.label,
      ...source.languages,
      ...source.capabilities,
      ...source.developers.map((developer) => developer.name),
    ]
      .join(" ")
      .toLowerCase();
    if (!searchable.includes(query)) return false;
  }

  for (const dimension of Object.keys(filters.value) as FilterDimension[]) {
    const values = new Set(sourceValues(source, dimension));
    const filter = filters.value[dimension];
    if ([...filter.exclude].some((value) => values.has(value))) return false;
    if (filter.include.size > 0 && ![...filter.include].some((value) => values.has(value))) {
      return false;
    }
  }

  if (showOnlySelected.value && !selectedKeys.value.has(source.sourceKey)) return false;
  return true;
}

const filteredSources = computed(() => sources.value.filter(matchesFilters));
const selectedSources = computed(() =>
  sources.value.filter(
    (source) => selectedKeys.value.has(source.sourceKey) && isInstallable(source),
  ),
);
const detailsSource = computed(
  () => sources.value.find((source) => source.sourceKey === detailsKey.value) || null,
);

const activeFilterCount = computed(() =>
  (Object.keys(filters.value) as FilterDimension[]).reduce(
    (count, dimension) =>
      count + filters.value[dimension].include.size + filters.value[dimension].exclude.size,
    0,
  ),
);

const activeTags = computed(() => {
  const tags: Array<{ key: string; label: string; state: "include" | "exclude" }> = [];
  const repositoryLabels = new Map(repositories.value.map((repository) => [repository.url, repository.label]));
  for (const dimension of Object.keys(filters.value) as FilterDimension[]) {
    for (const value of filters.value[dimension].include) {
      tags.push({
        key: `${dimension}-include-${value}`,
        label: dimension === "repositories" ? repositoryLabels.get(value) || value : formatLabel(value),
        state: "include",
      });
    }
    for (const value of filters.value[dimension].exclude) {
      tags.push({
        key: `${dimension}-exclude-${value}`,
        label: dimension === "repositories" ? repositoryLabels.get(value) || value : formatLabel(value),
        state: "exclude",
      });
    }
  }
  return tags;
});

function filterState(dimension: FilterDimension, value: string): "include" | "exclude" | "neutral" {
  if (filters.value[dimension].include.has(value)) return "include";
  if (filters.value[dimension].exclude.has(value)) return "exclude";
  return "neutral";
}

function toggleFilter(dimension: FilterDimension, rawValue: string) {
  const value = dimension === "repositories" ? rawValue : normalizedValue(rawValue);
  const current = filters.value[dimension];
  const include = new Set(current.include);
  const exclude = new Set(current.exclude);

  if (include.has(value)) {
    include.delete(value);
    exclude.add(value);
  } else if (exclude.has(value)) {
    exclude.delete(value);
  } else {
    include.add(value);
  }

  filters.value = {
    ...filters.value,
    [dimension]: { include, exclude },
  };
}

function clearFilters() {
  filters.value = createFilters(false);
}

function clearEverything() {
  searchQuery.value = "";
  filters.value = createFilters(false);
  showOnlySelected.value = false;
}

function toggleSource(source: CatalogSource) {
  if (!isInstallable(source)) {
    openDetails(source);
    return;
  }
  const selection = new Set(selectedKeys.value);
  if (selection.has(source.sourceKey)) selection.delete(source.sourceKey);
  else selection.add(source.sourceKey);
  selectedKeys.value = selection;
  if (selection.size === 0) showOnlySelected.value = false;
}

function clearSelection() {
  selectedKeys.value = new Set();
  showOnlySelected.value = false;
}

function openDetails(source: CatalogSource) {
  detailsKey.value = source.sourceKey;
}

function closeDetails() {
  detailsKey.value = null;
}

function installLinkFor(source: CatalogSource): string {
  return buildInstallLink(source.repository.url, [source.id]);
}

function isInstallable(source: CatalogSource): boolean {
  const availability = normalizedValue(source.availability);
  return availability !== "serviceunavailable" && availability !== "retired";
}

const installCandidates = computed(() =>
  selectedSources.value.length > 0
    ? selectedSources.value
    : filteredSources.value.filter(isInstallable),
);

const installGroups = computed<InstallGroup[]>(() => {
  const grouped = new Map<string, CatalogSource[]>();
  for (const source of installCandidates.value) {
    const existing = grouped.get(source.repository.url) || [];
    existing.push(source);
    grouped.set(source.repository.url, existing);
  }
  return [...grouped.entries()].map(([repositoryURL, groupSources]) => ({
    repository: groupSources[0]!.repository,
    sources: groupSources,
    href: buildInstallLink(
      repositoryURL,
      groupSources.map((source) => source.id),
    ),
  }));
});

function saveCustomRepositories() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customRepositoryURLs.value));
}

function loadStoredRepositories(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

async function loadCustomRepository(
  rawURL: string,
  options: { persist?: boolean; notify?: boolean } = {},
): Promise<boolean> {
  let repositoryURL: string;
  try {
    repositoryURL = normalizeRepositoryURL(rawURL);
  } catch (error) {
    repositoryMessage.value = error instanceof Error ? error.message : "Invalid catalog URL.";
    if (options.notify) showNotification("error", "Catalog not added", repositoryMessage.value);
    return false;
  }

  if (repositories.value.some((repository) => repository.url === repositoryURL)) {
    repositoryMessage.value = "That catalog is already loaded.";
    return true;
  }

  loadingRepositoryURLs.value = new Set([...loadingRepositoryURLs.value, repositoryURL]);
  repositoryMessage.value = "";
  try {
    const response = await fetch(catalogURLForRepository(repositoryURL), {
      headers: { Accept: "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error(`Catalog returned HTTP ${response.status}.`);
    const catalog = normalizeCatalog(await response.json(), { repositoryURL });
    repositories.value = [...repositories.value, catalog.repository];
    sources.value = [...sources.value, ...catalog.sources].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    customRepositoryURLs.value = [...customRepositoryURLs.value, repositoryURL];
    if (options.persist !== false) saveCustomRepositories();
    if (options.notify) {
      showNotification(
        "success",
        "Catalog added",
        `${catalog.repository.label} added ${catalog.sources.length} extensions.`,
      );
    }
    return true;
  } catch (error) {
    repositoryMessage.value =
      error instanceof Error ? error.message : "The catalog could not be loaded.";
    if (options.notify) showNotification("error", "Catalog not added", repositoryMessage.value);
    return false;
  } finally {
    const loading = new Set(loadingRepositoryURLs.value);
    loading.delete(repositoryURL);
    loadingRepositoryURLs.value = loading;
  }
}

async function addRepository() {
  if (!repositoryInput.value.trim()) {
    repositoryMessage.value = "Enter a catalog URL.";
    return;
  }
  const added = await loadCustomRepository(repositoryInput.value, { persist: true, notify: true });
  if (added) repositoryInput.value = "";
}

function removeRepository(repository: Repository) {
  if (repository.isDefault) return;
  repositories.value = repositories.value.filter((item) => item.url !== repository.url);
  const removedKeys = new Set(
    sources.value
      .filter((source) => source.repository.url === repository.url)
      .map((source) => source.sourceKey),
  );
  sources.value = sources.value.filter((source) => source.repository.url !== repository.url);
  selectedKeys.value = new Set([...selectedKeys.value].filter((key) => !removedKeys.has(key)));
  if (detailsKey.value && removedKeys.has(detailsKey.value)) closeDetails();
  const repositoryFilter = filters.value.repositories;
  const include = new Set(repositoryFilter.include);
  const exclude = new Set(repositoryFilter.exclude);
  include.delete(repository.url);
  exclude.delete(repository.url);
  filters.value = {
    ...filters.value,
    repositories: { include, exclude },
  };
  customRepositoryURLs.value = customRepositoryURLs.value.filter((url) => url !== repository.url);
  saveCustomRepositories();
  showNotification("success", "Catalog removed", `${repository.label} was removed from this browser.`);
}

function parseURLState(): string[] {
  const params = new URLSearchParams(window.location.search);
  const hasState = KNOWN_STATE_PARAMS.some((name) => params.has(name));
  filters.value = createFilters(!hasState);
  searchQuery.value = params.get("q") || "";

  for (const dimension of Object.keys(FILTER_QUERY) as FilterDimension[]) {
    const names = FILTER_QUERY[dimension];
    const include = new Set(
      params
        .getAll(names.include)
        .map((value) => (dimension === "repositories" ? value : normalizedValue(value)))
        .filter(Boolean),
    );
    const exclude = new Set(
      params
        .getAll(names.exclude)
        .map((value) => (dimension === "repositories" ? value : normalizedValue(value)))
        .filter((value) => Boolean(value) && !include.has(value)),
    );
    filters.value = { ...filters.value, [dimension]: { include, exclude } };
  }

  selectedKeys.value = new Set(params.getAll("source").filter(Boolean));
  showOnlySelected.value = params.get("selectedOnly") === "1";
  detailsKey.value = params.get("details") || null;

  const candidates = [
    ...params.getAll("catalog"),
    ...params.getAll(FILTER_QUERY.repositories.include),
    ...params.getAll(FILTER_QUERY.repositories.exclude),
  ];
  return [...new Set(candidates)].filter((value) => {
    try {
      return normalizeRepositoryURL(value) !== DEFAULT_CATALOG.repository.url;
    } catch {
      return false;
    }
  });
}

function updateURLState() {
  if (!hydrated.value) return;
  const params = new URLSearchParams();
  if (searchQuery.value.trim()) params.set("q", searchQuery.value.trim());
  customRepositoryURLs.value.forEach((url) => params.append("catalog", url));
  for (const dimension of Object.keys(FILTER_QUERY) as FilterDimension[]) {
    const names = FILTER_QUERY[dimension];
    [...filters.value[dimension].include].sort().forEach((value) => params.append(names.include, value));
    [...filters.value[dimension].exclude].sort().forEach((value) => params.append(names.exclude, value));
  }
  [...selectedKeys.value].sort().forEach((key) => params.append("source", key));
  if (showOnlySelected.value) params.set("selectedOnly", "1");
  if (detailsKey.value) params.set("details", detailsKey.value);
  const query = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

async function shareCatalog() {
  updateURLState();
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    showNotification("success", "Link copied", "The current filters and selection are in the URL.");
  } catch {
    if (navigator.share) {
      await navigator.share({ title: "manko Extensions", url });
    } else {
      window.prompt("Copy this catalog link:", url);
    }
  }
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
  if (event.key === "Escape") {
    if (detailsKey.value) closeDetails();
    else installOptionsExpanded.value = false;
  } else if (event.key === "/" && !isTyping) {
    event.preventDefault();
    searchInput.value?.focus();
  }
}

watch(
  [searchQuery, filters, selectedKeys, showOnlySelected, detailsKey, customRepositoryURLs],
  updateURLState,
  { deep: true },
);

watch(detailsKey, (value) => {
  if (typeof document !== "undefined") document.body.style.overflow = value ? "hidden" : "";
});

onMounted(async () => {
  const sharedRepositories = parseURLState();
  const storedRepositories = loadStoredRepositories();
  const repositoriesToLoad = [...new Set([...storedRepositories, ...sharedRepositories])];
  for (const repositoryURL of repositoriesToLoad) {
    await loadCustomRepository(repositoryURL, { persist: false, notify: false });
  }
  const installableKeys = new Set(
    sources.value.filter(isInstallable).map((source) => source.sourceKey),
  );
  selectedKeys.value = new Set(
    [...selectedKeys.value].filter((key) => installableKeys.has(key)),
  );
  saveCustomRepositories();
  hydrated.value = true;
  updateURLState();
  document.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
  document.body.style.overflow = "";
  if (notificationTimer) window.clearTimeout(notificationTimer);
});
</script>

<template>
  <div class="catalog-browser">
    <div class="catalog-toolbar">
      <label class="catalog-search">
        <span class="catalog-search-symbol" aria-hidden="true">⌕</span>
        <span class="sr-only">Search extensions</span>
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          placeholder="Search names, descriptions, languages, or contributors"
          autocomplete="off"
        />
        <kbd>/</kbd>
      </label>
      <button
        class="toolbar-button"
        :class="{ active: filtersExpanded || activeFilterCount > 0 }"
        type="button"
        :aria-expanded="filtersExpanded"
        aria-controls="catalog-filter-panel"
        @click="filtersExpanded = !filtersExpanded"
      >
        Filters <span v-if="activeFilterCount" class="button-count">{{ activeFilterCount }}</span>
      </button>
      <button
        class="toolbar-button"
        :class="{ active: repositoriesExpanded || filters.repositories.include.size || filters.repositories.exclude.size }"
        type="button"
        :aria-expanded="repositoriesExpanded"
        aria-controls="catalog-repository-panel"
        @click="repositoriesExpanded = !repositoriesExpanded"
      >
        Repositories <span class="button-count">{{ repositories.length }}</span>
      </button>
      <button class="toolbar-button" type="button" @click="shareCatalog">Share</button>
    </div>

    <section v-show="filtersExpanded" id="catalog-filter-panel" class="catalog-panel">
      <div class="catalog-panel-heading">
        <div>
          <h2>Filters</h2>
          <p>Click once to include, twice to exclude, and a third time to clear.</p>
        </div>
        <button class="text-button" type="button" @click="clearFilters">Clear filters</button>
      </div>
      <div class="filter-grid">
        <fieldset v-for="group in filterGroups" :key="group.dimension" class="filter-group">
          <legend>{{ group.title }}</legend>
          <div class="filter-chips">
            <button
              v-for="option in group.options"
              :key="option.value"
              class="filter-chip"
              :class="filterState(group.dimension, option.value)"
              :aria-label="`${option.label}: ${filterState(group.dimension, option.value)}`"
              type="button"
              @click="toggleFilter(group.dimension, option.value)"
            >
              <span v-if="filterState(group.dimension, option.value) === 'exclude'" aria-hidden="true">−</span>
              <span v-else-if="filterState(group.dimension, option.value) === 'include'" aria-hidden="true">+</span>
              {{ option.label }}
            </button>
          </div>
        </fieldset>
      </div>
    </section>

    <section v-show="repositoriesExpanded" id="catalog-repository-panel" class="catalog-panel repository-panel">
      <div class="catalog-panel-heading">
        <div>
          <h2>Repositories</h2>
          <p>Add a compatible catalog.json URL or repository directory. Custom catalogs stay in this browser.</p>
        </div>
      </div>
      <form class="repository-form" @submit.prevent="addRepository">
        <label>
          <span class="sr-only">Custom catalog URL</span>
          <input
            v-model="repositoryInput"
            type="url"
            inputmode="url"
            placeholder="https://example.com/extensions/v1/stable/"
            autocomplete="url"
          />
        </label>
        <button class="brand-button" type="submit" :disabled="loadingRepositoryURLs.size > 0">
          {{ loadingRepositoryURLs.size > 0 ? "Checking…" : "Add catalog" }}
        </button>
      </form>
      <p v-if="repositoryMessage" class="repository-message" role="status">{{ repositoryMessage }}</p>
      <div class="repository-chips">
        <div
          v-for="repository in repositories"
          :key="repository.url"
          class="repository-chip"
          :class="filterState('repositories', repository.url)"
        >
          <button type="button" @click="toggleFilter('repositories', repository.url)">
            <span v-if="filterState('repositories', repository.url) === 'exclude'" aria-hidden="true">−</span>
            <span v-else-if="filterState('repositories', repository.url) === 'include'" aria-hidden="true">+</span>
            {{ repository.label }}
          </button>
          <button
            v-if="!repository.isDefault"
            class="repository-remove"
            type="button"
            :aria-label="`Remove ${repository.label}`"
            @click="removeRepository(repository)"
          >
            ×
          </button>
        </div>
      </div>
    </section>

    <div v-if="selectedSources.length" class="selection-controls">
      <button
        class="toolbar-button"
        :class="{ active: showOnlySelected }"
        type="button"
        @click="showOnlySelected = !showOnlySelected"
      >
        {{ showOnlySelected ? "Showing selected" : "Only show selected" }}
        <span class="button-count">{{ selectedSources.length }}</span>
      </button>
      <button class="text-button" type="button" @click="clearSelection">Clear selection</button>
    </div>

    <div class="results-summary" aria-live="polite">
      <p>
        <strong>{{ filteredSources.length }}</strong> of {{ sources.length }} extensions
        <span v-if="repositories.length > 1"> from {{ repositories.length }} repositories</span>
      </p>
      <div v-if="searchQuery || activeTags.length" class="active-tags">
        <span v-if="searchQuery" class="active-tag">Search: “{{ searchQuery }}”</span>
        <span
          v-for="tag in activeTags"
          :key="tag.key"
          class="active-tag"
          :class="{ excluded: tag.state === 'exclude' }"
        >
          {{ tag.state === "exclude" ? "Not " : "" }}{{ tag.label }}
        </span>
      </div>
    </div>

    <div v-if="filteredSources.length" class="extension-grid">
      <article
        v-for="source in filteredSources"
        :key="source.sourceKey"
        class="extension-card"
        :class="{
          selected: isInstallable(source) && selectedKeys.has(source.sourceKey),
          unavailable: !isInstallable(source),
        }"
        role="button"
        tabindex="0"
        :aria-pressed="isInstallable(source) ? selectedKeys.has(source.sourceKey) : undefined"
        @click="toggleSource(source)"
        @keydown.enter.prevent="toggleSource(source)"
        @keydown.space.prevent="toggleSource(source)"
      >
        <header class="extension-card-header">
          <div class="extension-icon" aria-hidden="true">
            <span>{{ source.name.charAt(0).toUpperCase() }}</span>
            <img
              v-if="source.iconURL"
              :src="source.iconURL"
              alt=""
              loading="lazy"
              @error="($event.currentTarget as HTMLImageElement).hidden = true"
            />
          </div>
          <div class="extension-card-title">
            <h3>{{ source.name }}</h3>
            <div class="card-badges">
              <span class="rating-badge" :class="source.contentRating.toLowerCase()">
                {{ formatLabel(source.contentRating) }}
              </span>
              <span class="version-badge">{{ formatLabel(source.kind) }}</span>
              <span class="version-badge">v{{ source.version }}</span>
            </div>
          </div>
        </header>
        <p class="extension-description">{{ source.description || "No description provided." }}</p>
        <div class="extension-tags">
          <span v-for="language in source.languages" :key="language" class="language-badge">
            {{ formatLabel(language) }}
          </span>
        </div>
        <div class="extension-card-meta">
          <span class="repository-badge">{{ source.repository.label }}</span>
        </div>
        <footer class="extension-card-footer">
          <span v-if="isInstallable(source) && selectedKeys.has(source.sourceKey)" class="selected-label">✓ Selected</span>
          <span v-else-if="isInstallable(source)" class="select-hint">Select for batch install</span>
          <span v-else class="select-hint">Compatibility details</span>
          <button class="secondary-button" type="button" @click.stop="openDetails(source)">Details</button>
        </footer>
      </article>
    </div>

    <div v-else class="empty-state">
      <span aria-hidden="true">⌕</span>
      <template v-if="sources.length === 0">
        <h3>No content extensions published yet</h3>
        <p>This repository does not currently publish any content extensions.</p>
      </template>
      <template v-else>
        <h3>No extensions match</h3>
        <p>Try a broader search or clear one of the filters.</p>
        <button class="secondary-button" type="button" @click="clearEverything">Clear search and filters</button>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="notification" class="catalog-notification" :class="notification.type" role="status">
        <div>
          <strong>{{ notification.title }}</strong>
          <p>{{ notification.message }}</p>
        </div>
        <button type="button" aria-label="Dismiss notification" @click="notification = null">×</button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="installCandidates.length" class="floating-install">
        <div class="floating-install-copy">
          <strong>{{ selectedSources.length || filteredSources.length }}</strong>
          <span>{{ selectedSources.length ? "selected" : "visible" }}</span>
        </div>
        <a
          v-if="installGroups.length === 1"
          class="brand-button install-button"
          :href="installGroups[0]!.href"
        >
          Install {{ selectedSources.length ? "selected" : "visible" }}
        </a>
        <button
          v-else
          class="brand-button install-button"
          type="button"
          @click="installOptionsExpanded = !installOptionsExpanded"
        >
          Install by repository
        </button>
        <div v-if="installOptionsExpanded && installGroups.length > 1" class="install-options">
          <strong>Install one repository at a time</strong>
          <a v-for="group in installGroups" :key="group.repository.url" :href="group.href">
            {{ group.repository.label }} <span>{{ group.sources.length }}</span>
          </a>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="detailsSource" class="details-overlay" @click.self="closeDetails">
        <section
          class="details-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`details-${detailsSource.id}`"
        >
          <button class="details-close" type="button" aria-label="Close details" @click="closeDetails">
            ×
          </button>
          <header class="details-header">
            <div class="extension-icon details-icon" aria-hidden="true">
              <span>{{ detailsSource.name.charAt(0).toUpperCase() }}</span>
              <img
                v-if="detailsSource.iconURL"
                :src="detailsSource.iconURL"
                alt=""
                @error="($event.currentTarget as HTMLImageElement).hidden = true"
              />
            </div>
            <div>
              <p class="details-eyebrow">{{ formatLabel(detailsSource.kind) }} extension</p>
              <h2 :id="`details-${detailsSource.id}`">{{ detailsSource.name }}</h2>
              <div class="card-badges">
                <span class="rating-badge" :class="detailsSource.contentRating.toLowerCase()">
                  {{ formatLabel(detailsSource.contentRating) }}
                </span>
                <span class="version-badge">v{{ detailsSource.version }}</span>
              </div>
            </div>
          </header>
          <div class="details-body">
            <section>
              <h3>Description</h3>
              <p>{{ detailsSource.description || "No description provided." }}</p>
            </section>
            <section v-if="detailsSource.compatibility" class="compatibility-callout">
              <h3>Compatibility</h3>
              <p>
                {{ formatLabel(detailsSource.compatibility.status || "unknown") }}
                <span v-if="detailsSource.compatibility.scope">
                  · {{ formatLabel(detailsSource.compatibility.scope) }} API surface
                </span>
              </p>
              <p v-if="detailsSource.compatibility.note">{{ detailsSource.compatibility.note }}</p>
              <ul v-if="detailsSource.compatibility.limitations.length">
                <li v-for="limitation in detailsSource.compatibility.limitations" :key="limitation">
                  {{ limitation }}
                </li>
              </ul>
            </section>
            <section v-if="detailsSource.capabilities.length">
              <h3>Features</h3>
              <p>{{ detailsSource.capabilities.map(formatLabel).join(", ") }}</p>
            </section>
            <div class="details-grid">
              <section>
                <h3>Languages</h3>
                <p>{{ detailsSource.languages.map(formatLabel).join(", ") || "Not declared" }}</p>
              </section>
              <section>
                <h3>API version</h3>
                <p>{{ detailsSource.extension?.apiVersion || "Not declared" }}</p>
              </section>
              <section>
                <h3>Script size</h3>
                <p>{{ formatBytes(detailsSource.extension?.size) }}</p>
              </section>
            </div>
            <section v-if="detailsSource.developers.length">
              <h3>Contributors</h3>
              <ul class="developer-list">
                <li v-for="developer in detailsSource.developers" :key="developer.name">
                  <span>{{ developer.name }}</span>
                  <a v-if="developer.github" :href="developer.github" target="_blank" rel="noopener noreferrer">GitHub</a>
                  <a v-if="developer.website" :href="developer.website" target="_blank" rel="noopener noreferrer">Website</a>
                </li>
              </ul>
            </section>
            <section v-if="detailsSource.sourceURL">
              <h3>Extension source</h3>
              <a :href="detailsSource.sourceURL" target="_blank" rel="noopener noreferrer">Open the extension source</a>
              <p v-if="detailsSource.sourceRevision">Revision <code>{{ detailsSource.sourceRevision }}</code></p>
            </section>
            <section v-if="detailsSource.upstream?.repository">
              <h3>Upstream source snapshot</h3>
              <a
                :href="detailsSource.upstream.repository"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ detailsSource.upstream.repository }}
              </a>
              <p v-if="detailsSource.upstream.commit">
                Commit <code>{{ detailsSource.upstream.commit.slice(0, 12) }}</code>
                <span v-if="detailsSource.upstream.sourcePath">
                  · <code>{{ detailsSource.upstream.sourcePath }}</code>
                </span>
              </p>
              <p v-if="detailsSource.upstream.relationship === 'auditedSnapshotNotRecordedBuildInput'">
                InkDex did not record the registry artifact's exact source commit or lockfile. This snapshot is not claimed as the artifact's build input.
              </p>
              <p v-if="detailsSource.license">License: {{ detailsSource.license }}</p>
            </section>
            <section>
              <h3>Repository</h3>
              <a :href="detailsSource.repository.catalogURL" target="_blank" rel="noopener noreferrer">
                {{ detailsSource.repository.label }}
              </a>
            </section>
          </div>
          <footer class="details-actions">
            <a
              v-if="detailsSource.rightsURL"
              class="secondary-button"
              :href="detailsSource.rightsURL"
              target="_blank"
              rel="noopener noreferrer"
            >
              License
            </a>
            <a
              v-if="detailsSource.reportURL"
              class="secondary-button"
              :href="detailsSource.reportURL"
              target="_blank"
              rel="noopener noreferrer"
            >
              Report an issue
            </a>
            <a
              v-if="isInstallable(detailsSource)"
              class="brand-button"
              :href="installLinkFor(detailsSource)"
            >
              Open in manko
            </a>
            <span v-else class="unavailable-action" role="status">Not installable in this build</span>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>
