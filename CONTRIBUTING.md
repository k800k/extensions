# Contributing

Contributions certify the Developer Certificate of Origin with `git commit -s`.

This repository accepts content extensions only. Tracker and theme extension declarations, directories, catalog entries, and runtime registrations are unsupported.

Before changing a content extension from `approvalRequired`, complete its specification, privacy and rights records, host and authentication declarations, contract suite, live smoke-test record, and review status. Package hash changes invalidate prior MangaReader approval.

Run `npm run check && npm test && npm run bundle && npm run docs:build && npm run publish:dry-run` before opening a pull request.
