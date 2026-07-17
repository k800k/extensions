# Review status for MadaraDex

- Import integrity: **verified** against InkDex registry artifact SHA-256 `5fffd6eec45b1180232598b3cc75b0ba562bd1b77ce0f5c595fecc819f5540db`.
- Source reference: **audited snapshot** [7f5046d09025](https://github.com/inkdex/madara-extensions/commit/7f5046d09025d99cfe8bb633b9d55b721739fb3f), path `src/MadaraDex`; the registry did not record the artifact's exact source commit/lockfile.
- License: **GPL-3.0-or-later**; package license and source attribution included.
- MangaReader compatibility: **enabled** through the public API 1.0 adapter.
- Activation review: **required**; the importer never marks a new package available.
- Service status: not guaranteed; the upstream service and any response-provided CDN remain external dependencies.
- Live smoke (2026-07-17): Anonymous HTTPS landing page rendered HTML on `madaradex.org`. The probe discarded response bodies beyond browser rendering and used no account, cookies, or activation approval.

Generated metadata declares 1 reviewed literal/base host. Re-run the import audit when upstream code, service domains, permissions, or package hashes change.
