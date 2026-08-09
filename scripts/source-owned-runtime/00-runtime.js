/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

function mrCreateRuntime(configuration) {
  const allowedHosts = new Set(configuration.allowedHosts.map(host => host.toLowerCase()));
  const dynamicOrigins = new Set();
  let runtimeContext;

  function context() {
    const value = runtimeContext || globalThis.manko?.context;
    if (!value) throw operationError("ExtensionRuntimeError", "manko runtime context is unavailable");
    return value;
  }

  function initialize(value) {
    runtimeContext = value || globalThis.manko?.context;
    context();
  }

  function operationError(name, message, type, url) {
    const error = new Error(message);
    error.name = name;
    if (type) error.type = type;
    if (url) error.url = url;
    return error;
  }

  function header(headers, name) {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers || {})) {
      if (key.toLowerCase() === wanted) return String(value);
    }
    return "";
  }

  function hostAllowed(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (allowedHosts.has(host)) return true;
    for (const declaration of allowedHosts) {
      if (declaration.startsWith("*.") && host.endsWith(declaration.slice(1)) && host !== declaration.slice(2)) return true;
    }
    return false;
  }

  function parsedURL(value, baseURL = configuration.baseURL) {
    let parsed;
    try {
      parsed = new URL(String(value || ""), baseURL);
    } catch {
      throw operationError("InvalidResponseError", `${configuration.name} supplied an invalid URL`, "invalidResponse");
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
      throw operationError("InvalidResponseError", `${configuration.name} supplied an invalid HTTP(S) URL`, "invalidResponse");
    }
    return parsed;
  }

  function registerDynamicDestination(value, baseURL = configuration.baseURL) {
    const parsed = parsedURL(value, baseURL);
    dynamicOrigins.add(parsed.origin);
    return parsed;
  }

  function url(value, baseURL = configuration.baseURL) {
    const parsed = parsedURL(value, baseURL);
    if ((parsed.protocol !== "https:" || !hostAllowed(parsed.hostname)) && !dynamicOrigins.has(parsed.origin)) {
      throw operationError("HostNotAllowedError", `${configuration.name} supplied an unregistered HTTP(S) destination`, "hostNotAllowed");
    }
    return parsed;
  }

  function bytes(base64) {
    if (typeof atob === "function") {
      const binary = atob(base64 || "");
      const result = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) result[index] = binary.charCodeAt(index);
      return result;
    }
    return new Uint8Array(context().encoding.fromBase64(base64 || ""));
  }

  function base64(value) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (typeof btoa === "function") {
      let binary = "";
      for (let index = 0; index < data.length; index += 0x8000) {
        binary += String.fromCharCode(...data.subarray(index, index + 0x8000));
      }
      return btoa(binary);
    }
    return context().encoding.toBase64([...data]);
  }

  function text(response, maximumBytes) {
    let data = bytes(response.dataBase64);
    if (maximumBytes && data.byteLength > maximumBytes) data = data.subarray(0, maximumBytes);
    return new TextDecoder("utf-8", { fatal: false }).decode(data);
  }

  function cookieDomain(cookie) {
    return String(cookie?.domain || "").replace(/^\./, "").toLowerCase();
  }

  function cookiesFor(requestURL) {
    const parsed = url(requestURL);
    const result = {};
    for (const cookie of context().cookies?.getAll?.() || []) {
      const domain = cookieDomain(cookie);
      const path = String(cookie?.path || "/");
      if (!domain || (parsed.hostname !== domain && !parsed.hostname.endsWith(`.${domain}`))) continue;
      if (!(parsed.pathname === path || path === "/" || parsed.pathname.startsWith(path.endsWith("/") ? path : `${path}/`))) continue;
      if (cookie?.expires && Date.parse(cookie.expires) <= Date.now()) continue;
      if (cookie?.name) result[String(cookie.name)] = String(cookie.value || "");
    }
    return result;
  }

  function persistCookies(received) {
    if (!Array.isArray(received) || !received.length || !context().cookies?.setAll) return;
    const current = context().cookies.getAll?.() || [];
    const keyed = new Map(current.map(cookie => [`${cookie.name}\u0000${cookieDomain(cookie)}\u0000${cookie.path || "/"}`, cookie]));
    for (const cookie of received.slice(0, 100)) {
      const domain = cookieDomain(cookie);
      if (!cookie?.name || !hostAllowed(domain)) continue;
      keyed.set(`${cookie.name}\u0000${domain}\u0000${cookie.path || "/"}`, cookie);
    }
    context().cookies.setAll([...keyed.values()].slice(0, 100));
  }

  function isChallenge(response, body) {
    if (response.status !== 403 && response.status !== 503) return false;
    if (header(response.headers, "cf-mitigated").trim().toLowerCase() === "challenge") return true;
    const sample = String(body || "").slice(0, 8192);
    return /<form\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:challenge-form|managed-challenge)[^"']*["']/i.test(sample)
      || /<title>\s*just a moment(?:\.{3})?\s*<\/title>/i.test(sample);
  }

  async function request(value, options = {}) {
    const requestURL = url(value, options.baseURL);
    const response = await context().http.request({
      url: requestURL.href,
      method: options.method || "GET",
      headers: {
        Accept: options.accept || (options.binary ? "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5" : "text/html,application/json;q=0.9,*/*;q=0.5"),
        ...(configuration.userAgent ? { "User-Agent": configuration.userAgent } : {}),
        ...(configuration.referer ? { Referer: configuration.referer } : {}),
        ...(options.headers || {})
      },
      cookies: cookiesFor(requestURL.href),
      ...(options.bodyBase64 ? { bodyBase64: options.bodyBase64 } : {})
    });
    persistCookies(response.cookies);
    const challengeBody = response.status === 403 || response.status === 503 ? text(response, 8192) : "";
    if (isChallenge(response, challengeBody)) {
      const handoffURL = configuration.challengeURL || configuration.baseURL;
      context().challenge?.request?.(handoffURL);
      throw operationError("ChallengeRequiredError", `${configuration.name} requires verification`, "challengeRequired", handoffURL);
    }
    if (response.status === 429 && !options.retried) {
      const delay = Math.max(1, Math.min(30, Number.parseInt(header(response.headers, "retry-after"), 10) || 1));
      await context().rateLimit.sleep(delay * 1000);
      return request(requestURL.href, { ...options, retried: true });
    }
    if (response.status === 404 && options.missingOK) return null;
    if (response.status < 200 || response.status >= 300) {
      const notFound = response.status === 404;
      throw operationError(notFound ? "NotFoundError" : "ServiceError", `${configuration.name} returned HTTP ${response.status}`, notFound ? "notFound" : "serviceError", requestURL.href);
    }
    return options.binary || options.returnResponse ? response : text(response);
  }

  async function jsonRequest(value, options = {}) {
    const body = await request(value, { ...options, accept: "application/json" });
    try {
      return JSON.parse(body);
    } catch {
      throw operationError("InvalidResponseError", `${configuration.name} returned malformed JSON`, "invalidResponse", url(value).href);
    }
  }

  async function image(value, alternatives = []) {
    const candidates = [value, ...alternatives];
    let lastError;
    for (const candidate of candidates) {
      try {
        const response = await request(candidate, { binary: true });
        const mimeType = String(response.mimeType || header(response.headers, "content-type"))
          .split(";", 1)[0].trim().toLowerCase();
        if (!/^image\/(?:avif|gif|jpeg|jpg|png|webp)$/.test(mimeType) && mimeType !== "application/octet-stream") {
          throw operationError("InvalidResponseError", `${configuration.name} returned a non-image resource`, "invalidResponse", url(candidate).href);
        }
        if (!response.dataBase64) throw operationError("InvalidResponseError", `${configuration.name} returned an empty image`, "invalidResponse");
        return { dataBase64: response.dataBase64, mimeType };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || operationError("ServiceError", `${configuration.name} image request failed`, "serviceError");
  }

  function page(input) {
    const value = input?.metadata?.page ?? input?.cursor?.page ?? 1;
    if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) {
      throw operationError("InvalidCursorError", `${configuration.name} page cursor is invalid`, "invalidCursor");
    }
    return value;
  }

  return Object.freeze({ initialize, context, operationError, header, hostAllowed, registerDynamicDestination, url, bytes, base64, text, persistCookies, request, jsonRequest, image, page });
}
