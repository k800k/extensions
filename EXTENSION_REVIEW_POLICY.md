# Extension review policy

Content and tracker extensions are eligible for publication. Theme extensions are rejected.

MangaReader does not designate packages safe, approved, or verified. Publication requires enough evidence for users to audit compatibility and access:

- a service specification covering documented API behavior, terms, authentication, pagination, discovery, search, details, content delivery, challenges, and error cases;
- representative fixtures and contract tests;
- a reviewed HTTPS host list, privacy assessment, content rating, and rights record;
- appropriate source licensing, DCO sign-off, and documented review status; and
- a direct source link and exact source revision for the published artifact; and
- deterministic packaging with a catalog SHA-256 checksum.

Tracker packages must also document OAuth behavior and implement authentication, search, progress retrieval, updates, and collections. An extension requiring a runtime surface MangaReader does not expose is marked `serviceUnavailable`, with the blocker recorded in its specification and review status.

These checks establish whether a package can run as declared. They do not certify that it is safe; the install decision remains with the user.
