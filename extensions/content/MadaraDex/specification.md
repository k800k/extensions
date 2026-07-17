# MadaraDex extension specification

This package adapts the GPL-3.0-or-later Paperback registry artifact for MadaraDex to MangaReader Extension API v1. The compiled registry bundle is preserved inside `main.js`; the MangaReader compatibility bridge supplies Paperback's state, request, selector, interceptor, encoding, and form surfaces. [madara-extensions at 7f5046d09025](https://github.com/inkdex/madara-extensions/commit/7f5046d09025d99cfe8bb633b9d55b721739fb3f), path `src/MadaraDex`, is a later audited source snapshot: the registry did not record this artifact's source commit, so the snapshot is not claimed as its exact build input.

- Kind: `content`
- Upstream version: `1.0.0-alpha.15`
- MangaReader API: `1.0`
- Language: `en`
- Rating: `ADULT`
- HTTPS hosts: `madaradex.org`
- Compatibility: **supported**

Core discovery, title search, details, chapters, content delivery, request interception, and state are translated at the public content-extension boundary. API 1.1 provides constrained web execution for Comix and XHTML publication delivery for RoyalRoad and LNori. Paperback settings/search forms can be described, but MangaReader does not send form actions or selected advanced-filter values back into an extension. Live sites can change independently, and response-provided image CDNs require exact-host review.
