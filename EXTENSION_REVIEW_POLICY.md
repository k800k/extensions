# Extension review policy

Only content extensions are eligible for review. Tracker and theme extension kinds are rejected.

Every catalog entry begins as `approvalRequired` and remains unavailable until its activation review is complete. Every activation candidate requires:

- a service specification covering documented API behavior, terms, authentication, pagination, discovery, search, details, content delivery, challenges, and error cases;
- representative fixtures and contract tests;
- a reviewed HTTPS host list, privacy assessment, content rating, and rights record;
- appropriate source licensing, DCO sign-off, and documented review status; and
- publisher signing plus package-specific offline MangaReader approval.

An extension requiring a runtime surface MangaReader does not expose is marked `serviceUnavailable`, with the blocker recorded in its specification and review status.
