/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */

function mrSearchNormalized(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function mrSearchDistance(left, right, limit) {
  const a = Array.from(left), b = Array.from(right);
  if (Math.abs(a.length - b.length) > limit || a.length > 100 || b.length > 100) return null;
  let previous = Array.from({length:b.length + 1}, (_, i) => i), before = previous;
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j-1]+1, previous[j]+1, previous[j-1]+(a[i-1] === b[j-1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) current[j] = Math.min(current[j], before[j-2]+1);
    }
    before = previous; previous = current;
  }
  return previous[b.length] <= limit ? previous[b.length] : null;
}

function mrSearchScore(query, candidate) {
  const q = mrSearchNormalized(query), c = mrSearchNormalized(candidate);
  if (!q || q === c) return 0;
  if (c.startsWith(q)) return 100;
  if (c.split(" ").some(word => word.startsWith(q))) return 200;
  if (c.includes(q)) return 300;
  if (q.length < 3 || q.length > 100 || /^\d+$/.test(q)) return null;
  const distances = [c, ...c.split(" ")].map(value => mrSearchDistance(q, value, q.length < 6 ? 1 : 2)).filter(value => value !== null);
  return distances.length ? 400 + Math.min(...distances) : null;
}

function mrRankSuggestions(query, candidates, limit = 30, fieldID) {
  const seen = new Set();
  return candidates.flatMap((candidate, index) => {
    if (!candidate || !candidate.fieldID || !candidate.value || (fieldID && candidate.fieldID !== fieldID)) return [];
    const key = `${candidate.fieldID}\u0000${candidate.value}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const scores = [mrSearchScore(query, candidate.title ?? candidate.value), mrSearchScore(query, candidate.value)].filter(score => score !== null);
    return scores.length ? [{candidate, index, score:Math.min(...scores)}] : [];
  }).sort((a,b) => a.score - b.score || a.index - b.index).slice(0,limit).map(value => value.candidate);
}

// Bounded candidate lookup: one literal request and, only when needed, two
// broadened requests. Every suggested value still comes from the provider.
function mrCreateSuggestionLookup(fetchCandidates) {
  const cache = new Map(), flights = new Map();
  async function loadCandidates(fieldID, query) {
    const key = `${fieldID || "*"}\u0000${query}`;
    const saved = cache.get(key);
    if (saved && Date.now() - saved.time < 300000) return saved.values;
    cache.delete(key);
    if (flights.has(key)) return flights.get(key);
    const task = (async () => {
      const values = await fetchCandidates(fieldID, query);
      if (!Array.isArray(values)) throw new Error("The source returned invalid suggestions.");
      if (values.some(value => !value || typeof value.fieldID !== "string" || !value.fieldID || typeof value.value !== "string"
        || !value.value || value.value.length > 256 || String(value.title ?? value.value).length > 256)) throw new Error("The source returned invalid suggestions.");
      const bounded = values.slice(0,100);
      cache.set(key, {time:Date.now(),values:bounded});
      while (cache.size > 100) cache.delete(cache.keys().next().value);
      return bounded;
    })();
    flights.set(key, task);
    try { return await task; } finally { if (flights.get(key) === task) flights.delete(key); }
  }
  return async input => {
    const field = input?.fieldID || null, query = mrSearchNormalized(input?.query);
    const limit = Math.min(30,Math.max(1,Number(input?.limit) || 20));
    if (!query) return [];
    const direct = await loadCandidates(field,query);
    const cached = [...cache.values()].filter(value => Date.now() - value.time < 300000).flatMap(value => value.values);
    let candidates = [...direct,...cached];
    let ranked = mrRankSuggestions(query,candidates,limit,field);
    if (!ranked.some(value => (mrSearchScore(query,value.title ?? value.value) ?? 1000) < 400) && query.length > 3) {
      const letters = Array.from(query);
      const alternatives = [...new Set([letters.slice(0,3).join(""),letters.slice(-3).join("")])].filter(value => value.trim() && value !== query);
      const results = await Promise.allSettled(alternatives.map(value => loadCandidates(field,value)));
      candidates = candidates.concat(results.flatMap(result => result.status === "fulfilled" ? result.value : []));
      ranked = mrRankSuggestions(query,candidates,limit,field);
      if (!ranked.length) {
        const failure = results.find(result => result.status === "rejected");
        if (failure) throw failure.reason;
      }
    }
    return ranked;
  };
}

function mrValidateSearchSelections(configuration, selections, sort) {
  const fields = new Map((configuration.fields || []).map(field => [field.id,field]));
  const counts = new Map(), seen = new Set();
  if (sort && !(configuration.sortOptions || []).some(option => option.id === sort)) throw new Error("Unsupported source sort order.");
  for (const selection of selections || []) {
    const field = fields.get(selection.fieldID);
    if (!field) throw new Error(`Unsupported source filter: ${selection.fieldID}`);
    if (selection.polarity === "exclude" && !field.supportsExclusion) throw new Error(`${field.title} does not support exclusion.`);
    if (!["include","exclude"].includes(selection.polarity)) throw new Error(`Invalid filter state for ${field.title}.`);
    const value = String(selection.value ?? "").trim();
    if (!value || value.length > 256) throw new Error(`Invalid value for ${field.title}.`);
    const kind = field.inputKind || (field.options?.length ? "choice" : "lookup");
    if (kind === "choice" && !(field.options || []).some(option => option.id === value)) throw new Error(`Choose an available ${field.title.toLowerCase()} value.`);
    if (kind === "number" && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new Error(`${field.title} must be a nonnegative whole number.`);
    const key = `${field.id}\u0000${value}`;
    if (seen.has(key)) throw new Error(`Choose one filter state for ${selection.title || value}.`);
    seen.add(key);
    counts.set(field.id,(counts.get(field.id) || 0)+1);
    if (field.maximumSelections && counts.get(field.id) > field.maximumSelections) throw new Error(`Choose at most ${field.maximumSelections} value(s) for ${field.title}.`);
  }
}
