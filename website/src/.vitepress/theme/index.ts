/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2025 Inkdex */
/* Copyright © 2026 manko Extension Contributors */

import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Layout from "./Layout.vue";
import RepositoryInstall from "./components/RepositoryInstall.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("RepositoryInstall", RepositoryInstall);
  },
} satisfies Theme;
