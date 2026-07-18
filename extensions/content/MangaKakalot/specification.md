# MangaKakalot extension specification

This package adapts the GPL-3.0-or-later Paperback registry artifact for MangaKakalot to MangaReader Extension API v1. The compiled registry bundle is preserved inside `main.js`; the MangaReader compatibility bridge supplies Paperback's state, request, selector, interceptor, encoding, and form surfaces. [mangabox-extensions at 8c426aff4eff](https://github.com/inkdex/mangabox-extensions/commit/8c426aff4eff7ae719c00ddf22c9181d21f3c712), path `src/MangaKakalot`, is a later audited source snapshot: the registry did not record this artifact's source commit, so the snapshot is not claimed as its exact build input.

- Kind: `content`
- Upstream version: `1.0.0-alpha.11`
- MangaReader API: `1.0`
- Language: `en`
- Rating: `SAFE`
- HTTPS hosts: `img-r1.2xstorage.com`, `img-r2.2xstorage.com`, `imgs-2.2xstorage.com`, `www.mangakakalot.gg`
- Compatibility: **supported**

Core discovery, title search, details, chapters, content delivery, request interception, and state are translated at the public content-extension boundary. API 1.1 provides constrained web execution for Comix and XHTML publication delivery for RoyalRoad and LNori. Paperback settings/search forms can be described, but MangaReader does not send form actions or selected advanced-filter values back into an extension. Live sites can change independently, and response-provided image CDNs require exact-host review.
