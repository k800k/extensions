# Privacy assessment for MangaKakalot

The extension sends user-initiated browse, search, details, chapter, or image requests only through MangaReader's brokered HTTPS client. Declared hosts: `www.mangakakalot.gg`.

MangaReader isolates ordinary and secure state by extension namespace. Depending on upstream behavior, this source may store preferences, cookies, login state, or rate-limit state. The package has no direct filesystem, sensor, clipboard, native-network, or arbitrary-code access. External service privacy terms remain those of the target service described by [the audited upstream snapshot](https://github.com/inkdex/mangabox-extensions/commit/8c426aff4eff7ae719c00ddf22c9181d21f3c712).
