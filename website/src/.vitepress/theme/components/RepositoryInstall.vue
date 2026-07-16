<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 MangaReader Extension Contributors -->

<script setup lang="ts">
import { ref } from "vue";
import { buildAddRepositoryLink, DEFAULT_CATALOG } from "../lib/catalog";

const copied = ref(false);
const repositoryURL = DEFAULT_CATALOG.repository.url;
const addRepositoryLink = buildAddRepositoryLink(repositoryURL);

async function copyRepositoryURL() {
  try {
    await navigator.clipboard.writeText(repositoryURL);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1800);
  } catch {
    window.prompt("Copy the MangaReader repository URL:", repositoryURL);
  }
}
</script>

<template>
  <section class="repository-install" aria-labelledby="repository-install-title">
    <div class="repository-install-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
    <div class="repository-install-copy">
      <h3 id="repository-install-title">MangaReader Extensions</h3>
      <code>{{ repositoryURL }}</code>
    </div>
    <div class="repository-install-actions">
      <button class="secondary-button" type="button" @click="copyRepositoryURL">
        {{ copied ? "Copied" : "Copy URL" }}
      </button>
      <a class="brand-button" :href="addRepositoryLink">Add Repository</a>
    </div>
  </section>
</template>
