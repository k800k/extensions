# Review status for Comix

- Import integrity: **verified** against InkDex registry artifact SHA-256 `7795e9842c680b89ba65dadc9598ddb355407c5356de0e617de2195ae0b9059b`.
- Source reference: **audited snapshot** [b03d78c35dfb](https://github.com/inkdex/general-extensions/commit/b03d78c35dfb0ad305660dd3aa8618a006cbd73f), path `src/Comix`; the registry did not record the artifact's exact source commit/lockfile.
- License: **GPL-3.0-or-later**; package license and source attribution included.
- MangaReader compatibility: **enabled** through the public API 1.1 adapter.
- Activation review: **required**; the importer never marks a new package available.
- Service status: not guaranteed; the upstream service and any response-provided CDN remain external dependencies.
- Live smoke (2026-07-17): Anonymous HTTPS landing page rendered on `comix.to`; the exact static host `static.comix.to` was reachable and denied a root request with HTTP 403. The probe discarded response bodies beyond browser rendering and used no account, cookies, or activation approval.

Generated metadata declares 2 reviewed literal/base hosts. Re-run the import audit when upstream code, service domains, permissions, or package hashes change.
