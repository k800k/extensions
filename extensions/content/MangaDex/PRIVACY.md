# Privacy assessment for MangaDex

The extension sends user-initiated browse, search, details, chapter, or image requests only through MangaReader's brokered HTTPS client. Declared hosts: `*.mangadex.network`, `api.mangadex.org`, `mangadex.org`, `uploads.mangadex.org`.

MangaReader isolates ordinary and secure state by extension namespace. Depending on upstream behavior, this source may store preferences, cookies, login state, or rate-limit state. The package has no direct filesystem, sensor, clipboard, native-network, or arbitrary-code access. External service privacy terms remain those of the target service described by [the audited upstream snapshot](https://github.com/inkdex/general-extensions/commit/b03d78c35dfb0ad305660dd3aa8618a006cbd73f).
