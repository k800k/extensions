# Review status for MangaBat

- Import integrity: **verified** against InkDex registry artifact SHA-256 `ec9a212b2ebc2354619bc30ef24836e838eebc51a50a42eccd9e733211d3d08f`.
- Source reference: **audited snapshot** [8c426aff4eff](https://github.com/inkdex/mangabox-extensions/commit/8c426aff4eff7ae719c00ddf22c9181d21f3c712), path `src/MangaBat`; the registry did not record the artifact's exact source commit/lockfile.
- License: **GPL-3.0-or-later**; package license and source attribution included.
- MangaReader compatibility: **enabled** through the public API 1.0 adapter.
- Activation review: **required**; the importer never marks a new package available.
- Service status: not guaranteed; the upstream service and any response-provided CDN remain external dependencies.
- Live smoke (2026-07-17): Anonymous HTTPS landing page rendered HTML on `www.mangabats.com`. The probe discarded response bodies beyond browser rendering and used no account, cookies, or activation approval.

Generated metadata declares 1 reviewed literal/base host. Re-run the import audit when upstream code, service domains, permissions, or package hashes change.
