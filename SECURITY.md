# Security

Report repository or extension vulnerabilities through GitHub Security Advisories. Use a normal GitHub issue for reproducible package, catalog, or service-compatibility defects that do not contain sensitive information.

MangaReader runs extension code in its isolated WebKit runtime. Extension networking remains brokered so the app can apply cancellation, response limits, cookie handling, and operation timeouts.

OAuth client IDs are public identifiers. Never commit OAuth client secrets, access tokens, refresh tokens, cookies, or connector credentials. Tracker credentials belong in MangaReader's namespaced Keychain storage.
