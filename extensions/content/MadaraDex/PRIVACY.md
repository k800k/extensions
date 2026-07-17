# Privacy assessment for MadaraDex

The extension sends user-initiated browse, search, details, chapter, or image requests only through MangaReader's brokered HTTPS client. Declared hosts: `madaradex.org`.

MangaReader isolates ordinary and secure state by extension namespace. Depending on upstream behavior, this source may store preferences, cookies, login state, or rate-limit state. The package has no direct filesystem, sensor, clipboard, native-network, or arbitrary-code access. External service privacy terms remain those of the target service described by [the audited upstream snapshot](https://github.com/inkdex/madara-extensions/commit/7f5046d09025d99cfe8bb633b9d55b721739fb3f).
