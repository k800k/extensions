/* Copyright 2026 MangaReader Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export function runtimeResponse({ url = "https://example.invalid/", status = 200, headers = {}, mimeType, text, bytes } = {}) {
  const data = bytes === undefined ? Buffer.from(text || "", "utf8") : Buffer.from(bytes);
  return { url, status, headers, mimeType, cookies: [], dataBase64: data.toString("base64") };
}

async function loadExtension(mainPath, responder, kind, options = {}) {
  const source = await readFile(mainPath, "utf8");
  const calls = [];
  const sleeps = [];
  const challenges = [];
  const state = new Map();
  const secureState = new Map(Object.entries(options.secureState || {}));
  const context = {
    http: {
      async request(request) {
        calls.push(request);
        return responder(request, calls.length - 1);
      },
      registerInterceptor() {}
    },
    cookies: { getAll: () => [], setAll() {} },
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
    }
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
    btoa: value => Buffer.from(value, "binary").toString("base64")
  };
  vm.runInNewContext(source, sandbox, { filename: mainPath, timeout: 2000 });
  if (!extension) throw new Error(`No ${kind} extension was defined by ${mainPath}`);
  if (typeof extension.initialize === "function") await extension.initialize(context);
  return { extension, context, calls, sleeps, challenges, secureState };
}

export function loadContentExtension(mainPath, responder, options = {}) {
  return loadExtension(mainPath, responder, "content", options);
}

export function loadTrackerExtension(mainPath, responder, options = {}) {
  return loadExtension(mainPath, responder, "tracker", options);
}
