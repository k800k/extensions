/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

function mrDecodeHTML(value) {
  const entities = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return String(value || "").replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const number = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}

function mrTextContent(value) {
  return mrDecodeHTML(String(value || "")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function mrAttribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag || "").match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i"));
  return mrDecodeHTML(match?.[1] ?? match?.[2] ?? "");
}

function mrAbsoluteURL(value, baseURL) {
  if (!value) return "";
  try {
    return new URL(mrDecodeHTML(value), baseURL).href;
  } catch {
    return "";
  }
}

function mrTags(html, name) {
  const result = [];
  const expression = new RegExp(`<${name}\\b[^>]*>`, "gi");
  for (const match of String(html || "").matchAll(expression)) result.push({ tag: match[0], index: match.index || 0 });
  return result;
}

function mrElements(html, name) {
  const result = [];
  const expression = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "gi");
  for (const match of String(html || "").matchAll(expression)) result.push({ html: match[0], index: match.index || 0 });
  return result;
}

function mrWindow(html, index, before = 1200, after = 2400) {
  return String(html || "").slice(Math.max(0, index - before), Math.min(String(html || "").length, index + after));
}

function mrUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

function mrScriptJSON(html, id) {
  const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html || "").match(new RegExp(`<script\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i"));
  if (!match) return null;
  try {
    return JSON.parse(mrDecodeHTML(match[1]).trim());
  } catch {
    return null;
  }
}

function mrJavaScriptArray(source, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(source || "").match(new RegExp(`(?:var|let|const)?\\s*${escaped}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;`, "i"));
  if (!match) return [];
  try {
    const value = JSON.parse(match[1].replace(/\\\//g, "/").replace(/'/g, '"'));
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [...match[1].matchAll(/["']([^"']+)["']/g)].map(item => item[1].replace(/\\\//g, "/"));
  }
}

function mrNumber(value) {
  const number = Number.parseFloat(String(value ?? "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(number) ? number : undefined;
}
