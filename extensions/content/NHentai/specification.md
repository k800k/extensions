# nHentai extension specification

This MangaReader API v1 package provides anonymous latest and popular discovery, text search, numeric gallery lookup, gallery metadata, one synthetic gallery installment, and ordered page acquisition. It uses only the service's JSON responses and the brokered runtime client.

The declared network boundary is exact: `nhentai.net`, `t.nhentai.net`, and `i.nhentai.net`. Gallery identifiers must be positive decimal integers. Image type codes are mapped to known file suffixes, page order is preserved, and any response-supplied host is ignored. JSON parsing is strict and malformed payloads fail closed.

Pagination uses an integer page cursor. HTTP 429 is retried once after the brokered rate-limit delay. Missing galleries become a not-found error. Cloudflare challenge responses request MangaReader's visible challenge handoff and do not expose credentials to the extension. Login, account favorites, and arbitrary script execution are intentionally omitted.
