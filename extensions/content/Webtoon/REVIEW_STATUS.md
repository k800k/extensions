# Review status for Webtoon

- Import integrity: **verified** against InkDex registry artifact SHA-256 `785d79492c240f3a50c9cc7159d41b416f878c364c2b0443efb6f5668cac5bc8`.
- Source reference: **audited snapshot** [b03d78c35dfb](https://github.com/inkdex/general-extensions/commit/b03d78c35dfb0ad305660dd3aa8618a006cbd73f), path `src/Webtoon`; the registry did not record the artifact's exact source commit/lockfile.
- License: **GPL-3.0-or-later**; package license and source attribution included.
- MangaReader compatibility: **enabled** through the public API 1.0 adapter.
- Activation review: **required**; the importer never marks a new package available.
- Service status: not guaranteed; the upstream service and any response-provided CDN remain external dependencies.
- Live smoke (2026-07-17): Anonymous HTTPS landing page redirected within `www.webtoons.com` to `/en/`; exact image hosts `webtoon-phinf.pstatic.net` and `swebtoon-phinf.pstatic.net` were reachable and returned HTTP 403/404 for root requests. The probe discarded response bodies beyond browser rendering and used no account, cookies, or activation approval.

Generated metadata declares 4 reviewed literal/base hosts. Re-run the import audit when upstream code, service domains, permissions, or package hashes change.
