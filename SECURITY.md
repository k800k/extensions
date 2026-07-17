# Security

Report repository or extension concerns through GitHub Security Advisories. In MangaReader, use Report Source or Block Source for an installed catalog entry.

Extensions execute third-party code and are not certified safe by MangaReader. Review the linked source revision, declared HTTPS hosts, authentication modes, permissions, capabilities, privacy record, and rights record before installing. Open source makes auditing possible; it does not remove risk.

Catalog SHA-256 values detect artifact mismatch only. Contract and runtime validation detect compatibility failures only. Host and capability declarations are enforced access controls and auditable facts, not proof of safety.

OAuth client IDs are public identifiers. Never commit OAuth client secrets or user tokens; tracker tokens belong in MangaReader's namespaced Keychain storage.
