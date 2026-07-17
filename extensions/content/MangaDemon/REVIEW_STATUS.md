# Review status for MangaDemon

- Import integrity: **verified** against InkDex registry artifact SHA-256 `dd5ea16770df3b75a4e06350f72201afdaf57dca0eb1b764638722d0cae992fe`.
- Source reference: **audited snapshot** [b03d78c35dfb](https://github.com/inkdex/general-extensions/commit/b03d78c35dfb0ad305660dd3aa8618a006cbd73f), path `src/MangaDemon`; the registry did not record the artifact's exact source commit/lockfile.
- License: **GPL-3.0-or-later**; package license and source attribution included.
- MangaReader compatibility: **enabled** through the public API 1.0 adapter.
- Activation review: **required**; the importer never marks a new package available.
- Service status: not guaranteed; the upstream service and any response-provided CDN remain external dependencies.
- Live smoke (2026-07-17): Anonymous HTTPS landing page rendered on `demonicscans.org`; exact CDN roots on `cdn.demoniclibs.com`, `demoniclibs.com`, and `mangareadon.org` returned HTTP 200, while `librarydm.com` returned an empty root response. The probe discarded response bodies beyond browser rendering and used no account or cookies.

Generated metadata declares 5 reviewed literal/base hosts. Re-run the import audit when upstream code, service domains, permissions, or package hashes change.
