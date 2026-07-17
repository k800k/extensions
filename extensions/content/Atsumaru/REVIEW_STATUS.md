# Review status for Atsumaru

- Import integrity: **verified** against InkDex registry artifact SHA-256 `32e6daf809f6b3bf37be6d7d08a20b85355443697cab7224bb98987bedc29a0e`.
- Source reference: **audited snapshot** [b03d78c35dfb](https://github.com/inkdex/general-extensions/commit/b03d78c35dfb0ad305660dd3aa8618a006cbd73f), path `src/Atsumaru`; the registry did not record the artifact's exact source commit/lockfile.
- License: **GPL-3.0-or-later**; package license and source attribution included.
- MangaReader compatibility: **enabled** through the public API 1.0 adapter.
- Activation review: **required**; the importer never marks a new package available.
- Service status: not guaranteed; the upstream service and any response-provided CDN remain external dependencies.
- Live smoke (2026-07-17): Anonymous HTTPS landing page returned HTML on `atsu.moe`. The probe discarded response bodies beyond browser rendering and used no account, cookies, or activation approval.

Generated metadata declares 1 reviewed literal/base host. Re-run the import audit when upstream code, service domains, permissions, or package hashes change.
