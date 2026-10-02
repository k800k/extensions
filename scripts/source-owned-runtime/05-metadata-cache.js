/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

// Resource keys live inside the host's repository/version/config/account partition.
// Old hosts use one bounded, disposable memory cache instead.
function mrCreateMetadataCache(getContext) {
  const memory = new Map(), flights = new Map();
  let bytes = 0, generation = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  function drop(key) { bytes -= memory.get(key)?.bytes || 0; memory.delete(key); }
  async function remember(key, ttlSeconds, loader, validate, cacheOverride) {
    const resource = JSON.stringify(key);
    const checkedLoad = async () => {
      const value = await loader();
      validate(value);
      return clone(value);
    };
    const host = cacheOverride || getContext().cache;
    if (typeof host?.remember === "function") {
      let value = await host.remember(resource, { ttlSeconds }, checkedLoad);
      try { validate(value); } catch (_) {
        await host.remove(resource);
        value = await host.remember(resource, { ttlSeconds }, checkedLoad);
        validate(value);
      }
      return value;
    }
    const saved = memory.get(resource);
    if (saved && (ttlSeconds === null || Date.now() - saved.time < ttlSeconds * 1000)) {
      try { validate(saved.value); memory.delete(resource); memory.set(resource, saved); return clone(saved.value); }
      catch (_) { drop(resource); }
    }
    if (flights.has(resource)) return clone(await flights.get(resource));
    const token = generation;
    const flight = (async () => {
      const value = await checkedLoad(), size = new TextEncoder().encode(JSON.stringify(value)).byteLength;
      if (token === generation && size <= 16 * 1024 * 1024) {
        drop(resource); memory.set(resource, { value, bytes: size, time: Date.now() }); bytes += size;
        while (memory.size > 100 || bytes > 16 * 1024 * 1024) drop(memory.keys().next().value);
      }
      return value;
    })();
    flights.set(resource, flight);
    try { return clone(await flight); } finally { if (flights.get(resource) === flight) flights.delete(resource); }
  }
  return { remember, get generation() { return generation; }, clear() { generation++; memory.clear(); flights.clear(); bytes = 0; } };
}
