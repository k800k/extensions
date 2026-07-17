# Review status for MangaDex

- Import integrity: **verified** against InkDex registry artifact SHA-256 `46f1532d3ec4582f8789a8b9c41840dfbaeee933319bc462c795c4f8fbf5e716`.
- Source reference: **audited snapshot** [b03d78c35dfb](https://github.com/inkdex/general-extensions/commit/b03d78c35dfb0ad305660dd3aa8618a006cbd73f), path `src/MangaDex`; the registry did not record the artifact's exact source commit/lockfile.
- License: **GPL-3.0-or-later**; package license and source attribution included.
- MangaReader compatibility: **enabled** through the public API 1.0 adapter.
- Activation review: **required**; the importer never marks a new package available.
- Service status: not guaranteed; the upstream service and any response-provided CDN remain external dependencies.
- Live smoke (2026-07-17): Anonymous `api.mangadex.org/ping` returned HTTP 200, and the public page and cover hosts `mangadex.org` and `uploads.mangadex.org` returned HTTP 200; OAuth and status-page hosts were not exercised or declared. The probe discarded response bodies beyond browser rendering and used no account, cookies, or activation approval.

Generated metadata declares 3 reviewed literal/base hosts. Re-run the import audit when upstream code, service domains, permissions, or package hashes change.
