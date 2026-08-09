# Security

Report repository or extension vulnerabilities through GitHub Security Advisories. Use a normal GitHub issue for reproducible script, catalog, or service-compatibility defects that do not contain sensitive information.

manko runs extension code in its isolated WebKit runtime. Extension networking remains brokered so the app can apply cancellation, response limits, cookie handling, and operation timeouts.

OAuth client IDs are public identifiers. Never commit OAuth client secrets, access tokens, refresh tokens, cookies, or connector credentials. Tracker credentials belong in manko's namespaced Keychain storage.
