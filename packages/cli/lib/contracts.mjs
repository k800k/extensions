/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export const API_VERSION = "1.0";
export const SUPPORTED_API_VERSIONS = new Set(["1.0", "1.1"]);

export const repositoryCapabilities = new Set([
  "browse", "discover", "search", "filters", "details", "installments",
  "acquisition", "imageSequence", "updates", "managedCollections", "settings",
  "authentication", "interceptors", "cookies", "challengeHandoff"
]);

export const extensionPermissions = new Set([
  "network", "cookies", "state", "secureState", "rateLimiting", "redactedLogging",
  "challengeHandoff", "authenticationHandoff", "managedCollections", "webExecution"
]);

export const authenticationModes = new Set([
  "none", "basic", "apiKey", "oauth2PKCE", "visibleWebSession"
]);

const availabilities = new Set(["approvalRequired", "available", "serviceUnavailable"]);
const contentRatings = new Set(["SAFE", "MATURE", "ADULT"]);
const forbiddenRuntimeFragments = ["eval(", "new Function", "Function(", "WebAssembly", "import("];

function assertNonemptyString(value, field) {
  assert.equal(typeof value, "string", `${field} must be a string`);
  assert.ok(value.trim(), `${field} must not be empty`);
}

function assertStringArray(value, field, allowed, { required = false } = {}) {
  assert.ok(Array.isArray(value), `${field} must be an array`);
  if (required) assert.ok(value.length > 0, `${field} must not be empty`);
  value.forEach((item, index) => {
    assertNonemptyString(item, `${field}[${index}]`);
    if (allowed) assert.ok(allowed.has(item), `${field} contains unsupported value ${item}`);
  });
  assert.equal(new Set(value).size, value.length, `${field} must not contain duplicates`);
}

function assertIcon(bytes, extension, id) {
  if (extension === ".svg") {
    assert.match(bytes.toString("utf8", 0, Math.min(bytes.length, 512)), /<svg\b/i, `${id} icon is not SVG`);
    return;
  }
  if (extension === ".png") {
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${id} icon is not PNG`);
    return;
  }
  if ([".jpg", ".jpeg"].includes(extension)) {
    assert.equal(bytes.subarray(0, 2).toString("hex"), "ffd8", `${id} icon is not JPEG`);
    return;
  }
  if (extension === ".webp") {
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", `${id} icon is not WebP`);
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", `${id} icon is not WebP`);
    return;
  }
  assert.equal(extension, ".ico", `${id} iconFile has an unsupported extension`);
  assert.equal(bytes.subarray(0, 4).toString("hex"), "00000100", `${id} icon is not ICO`);
}

export function isAllowedHTTPSHost(value) {
  return typeof value === "string"
    && value === value.toLowerCase()
    && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+$/.test(value)
    && value !== "localhost"
    && !value.endsWith(".local");
}

/** Validate one content extension package. Tracker and theme kinds are intentionally unsupported. */
export async function assertContentExtension(directory, expectedID) {
  const metadata = JSON.parse(await readFile(join(directory, "extension.json"), "utf8"));
  const source = await readFile(join(directory, "main.js"), "utf8");

  assert.equal(metadata.id, expectedID);
  assert.match(metadata.id, /^[A-Za-z0-9._-]{1,128}$/);
  assert.equal(metadata.kind, "content", "only content extensions are supported");
  assert.ok(SUPPORTED_API_VERSIONS.has(metadata.apiVersion), `unsupported API version ${metadata.apiVersion}`);
  assertNonemptyString(metadata.name, "name");
  assertNonemptyString(metadata.description, "description");
  assert.match(metadata.version, /^[A-Za-z0-9._-]{1,128}$/, "version must be path-safe");
  assertNonemptyString(metadata.language, "language");
  assertStringArray(metadata.languages, "languages", undefined, { required: true });
  assert.ok(metadata.languages.includes(metadata.language), "languages must contain language");
  assert.ok(contentRatings.has(metadata.contentRating), `unsupported content rating ${metadata.contentRating}`);
  assert.ok(availabilities.has(metadata.availability), `unsupported availability ${metadata.availability}`);
  assertStringArray(metadata.capabilities, "capabilities", repositoryCapabilities);
  assertStringArray(metadata.permissions, "permissions", extensionPermissions, { required: true });
  assert.ok(metadata.permissions.includes("network"), "network permission is required by API v1");
  assertStringArray(metadata.allowedHTTPSHosts, "allowedHTTPSHosts", undefined, { required: true });
  assert.ok(metadata.allowedHTTPSHosts.every(isAllowedHTTPSHost), "allowedHTTPSHosts must contain exact public lower-case hostnames");
  assertStringArray(metadata.authenticationModes, "authenticationModes", authenticationModes, { required: true });
  assert.ok(Array.isArray(metadata.developers) && metadata.developers.length > 0, "developers must not be empty");
  metadata.developers.forEach((developer, index) => assertNonemptyString(developer?.name, `developers[${index}].name`));

  assert.equal(basename(metadata.iconFile), metadata.iconFile, "iconFile must be a package-local filename");
  const iconBytes = await readFile(join(directory, metadata.iconFile));
  assertIcon(iconBytes, extname(metadata.iconFile).toLowerCase(), expectedID);

  if (metadata.license?.startsWith("GPL-")) {
    const license = await readFile(join(directory, "LICENSE"), "utf8");
    assert.match(license, /GNU GENERAL PUBLIC LICENSE/, `${expectedID} must include its declared GPL license`);
  }

  assert.match(source, /defineContentExtension\s*\(/);
  assert.doesNotMatch(source, /define(?:Tracker|Theme)Extension\s*\(/, "tracker and theme declarations are unsupported");
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, "extensions must use the brokered runtime client");
  forbiddenRuntimeFragments.forEach(fragment => assert.ok(!source.includes(fragment), `main.js contains forbidden runtime fragment ${fragment}`));

  for (const file of ["specification.md", "REVIEW_STATUS.md", "PRIVACY.md", "RIGHTS.md"]) {
    const text = await readFile(join(directory, file), "utf8");
    assert.ok(text.trim().length > 80, `${file} must contain an independent review record`);
  }
  return metadata;
}

export const assertExtensionScaffold = (directory, expectedKind, expectedID) => {
  assert.equal(expectedKind, "content", "only content extensions are supported");
  return assertContentExtension(directory, expectedID);
};
