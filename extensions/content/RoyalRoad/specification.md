# RoyalRoad extension specification

This package adapts the GPL-3.0-or-later Paperback registry artifact for RoyalRoad to MangaReader Extension API v1. The compiled registry bundle is preserved inside `main.js`; the MangaReader compatibility bridge supplies Paperback's state, request, selector, interceptor, encoding, and form surfaces. [general-extensions at b03d78c35dfb](https://github.com/inkdex/general-extensions/commit/b03d78c35dfb0ad305660dd3aa8618a006cbd73f), path `src/RoyalRoad`, is a later audited source snapshot: the registry did not record this artifact's source commit, so the snapshot is not claimed as its exact build input.

- Kind: `content`
- Upstream version: `1.0.0-alpha.1`
- MangaReader API: `1.1`
- Language: `en`
- Rating: `SAFE`
- HTTPS hosts: `www.royalroad.com`
- Compatibility: **supported**

Core discovery, title search, details, chapters, content delivery, request interception, and state are translated at the public content-extension boundary. API 1.1 provides constrained web execution for Comix and XHTML publication delivery for RoyalRoad and LNori. Paperback settings/search forms can be described, but MangaReader does not send form actions or selected advanced-filter values back into an extension. Live sites can change independently, and response-provided image CDNs require exact-host review.
