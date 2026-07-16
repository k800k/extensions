# Security

Report repository or content-extension concerns through GitHub Security Advisories. In MangaReader, use Report Source or Block Source for an installed catalog entry.

Publisher signatures authenticate exact manifest bytes; MangaReader approvals bind the repository, publisher fingerprint, content-extension API version, package hash, hosts, authentication modes, permissions, capabilities, rating, and expiry. Changing any executable package or claim requires rebuilding and reapproval.

Never commit publisher or MangaReader approval private keys. Treat third-party extension code as untrusted input and review it before packaging.
