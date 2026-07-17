# Review status for MangaDot

- Import integrity: **verified** against InkDex registry artifact SHA-256 `5b98135cc1f5f494c2780085e8a9a3686509ec3af87ea46da2bc62d8cf792eeb`.
- Source reference: **audited snapshot** [b03d78c35dfb](https://github.com/inkdex/general-extensions/commit/b03d78c35dfb0ad305660dd3aa8618a006cbd73f), path `src/MangaDot`; the registry did not record the artifact's exact source commit/lockfile.
- License: **GPL-3.0-or-later**; package license and source attribution included.
- MangaReader compatibility: **enabled** through the public API 1.0 adapter.
- Activation review: **required**; the importer never marks a new package available.
- Service status: not guaranteed; the upstream service and any response-provided CDN remain external dependencies.
- Live smoke (2026-07-17): Anonymous HTTPS landing page rendered HTML on `mangadot.net`. The probe discarded response bodies beyond browser rendering and used no account or cookies.

Generated metadata declares 1 reviewed literal/base host. Re-run the import audit when upstream code, service domains, permissions, or package hashes change.
