/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export const MINIMAL_PNG_BYTES = Object.freeze(Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)));
export const MINIMAL_WEBP_BYTES = Object.freeze(Array.from(Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA4AAAAvAAAAAAcQEf0PRET/Aw==",
  "base64"
)));
export const MINIMAL_GIF_BYTES = Object.freeze(Array.from(Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64"
)));
export const MINIMAL_AVIF_BYTES = Object.freeze(Array.from(Buffer.from(
  "AAAAHGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZgAAAPBtZXRhAAAAAAAAAChoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAbGliYXZpZgAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAEUAAAAFQAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABoaXBycAAAAElpcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAOcGl4aQAAAAABCAAAAAxhdjFDgQAcAAAAABNjb2xybmNseAABAA0ABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB1tZGF0EgAKBxgABhgIaDUyCBAAABjhQnIQ",
  "base64"
)));

export function runtimeResponse({ url = "https://example.invalid/", status = 200, headers = {}, mimeType, cookies = [], text, bytes } = {}) {
  const data = bytes === undefined ? Buffer.from(text || "", "utf8") : Buffer.from(bytes);
  return { url, status, headers, mimeType, cookies, dataBase64: data.toString("base64") };
}

export function makeTextDocument() {
  return {
    createElement(tagName) {
      if (String(tagName).toLowerCase() === "canvas") return { getContext: () => null };
      let value = "";
      return {
        get value() { return value; },
        set value(next) { value = String(next); },
        get innerHTML() { return value; },
        set innerHTML(next) {
          value = String(next)
            .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
            .replace(/&#([0-9]+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
            .replaceAll("&amp;", "&")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&quot;", '"')
            .replaceAll("&#39;", "'");
        }
      };
    }
  };
}

async function loadExtension(mainPath, responder, kind, options = {}) {
  const source = await readFile(mainPath, "utf8");
  const calls = [];
  const sleeps = [];
  const challenges = [];
  const webCalls = [];
  const state = new Map(Object.entries(options.initialState || {}));
  const secureState = new Map(Object.entries(options.secureState || {}));
  let cookies = structuredClone(options.initialCookies || []);
  const context = {
    http: {
      async request(request) {
        calls.push(request);
        return responder(request, calls.length - 1);
      },
      registerInterceptor() {}
    },
    cookies: {
      getAll: () => structuredClone(cookies),
      setAll(value) { cookies = structuredClone(value || []); }
    },
    state: {
      get: key => state.get(key),
      set: (key, value) => state.set(key, value),
      remove: key => state.delete(key),
      reset: () => state.clear()
    },
    secureState: {
      get: key => secureState.get(key),
      set: (key, value) => secureState.set(key, value),
      remove: key => secureState.delete(key)
    },
    rateLimit: { async sleep(milliseconds) { sleeps.push(milliseconds); } },
    log: { debug() {}, warning() {} },
    clock: { now: () => options.now || "2026-01-01T00:00:00.000Z" },
    challenge: { request(url) { challenges.push(url); } },
    authentication: { request() {} },
    encoding: {
      toBase64: value => Buffer.from(value).toString("base64"),
      fromBase64: value => Uint8Array.from(Buffer.from(value, "base64")).buffer
    },
    ...(options.webHandler ? {
      web: {
        async execute(request) {
          webCalls.push(request);
          return options.webHandler(request, webCalls.length - 1);
        }
      }
    } : {})
  };
  let extension;
  const sandbox = {
    MangaReader: { context },
    defineContentExtension(value) { if (kind === "content") extension = value; return value; },
    defineTrackerExtension(value) { if (kind === "tracker") extension = value; return value; },
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    atob: value => Buffer.from(value, "base64").toString("binary"),
    btoa: value => Buffer.from(value, "binary").toString("base64"),
    ...(options.document ? { document: options.document } : {}),
    ...(options.globals || {})
  };
  vm.runInNewContext(source, sandbox, { filename: mainPath, timeout: 2000 });
  if (!extension) throw new Error(`No ${kind} extension was defined by ${mainPath}`);
  if (typeof extension.initialize === "function") await extension.initialize(context);
  return {
    extension,
    context,
    calls,
    sleeps,
    challenges,
    state,
    secureState,
    webCalls,
    get cookies() { return structuredClone(cookies); }
  };
}

export function loadContentExtension(mainPath, responder, options = {}) {
  return loadExtension(mainPath, responder, "content", options);
}

export function loadTrackerExtension(mainPath, responder, options = {}) {
  return loadExtension(mainPath, responder, "tracker", options);
}
