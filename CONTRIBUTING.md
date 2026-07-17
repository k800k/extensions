# Contributing

Contributions certify the Developer Certificate of Origin with `git commit -s`.

This repository accepts content and tracker extensions. Theme extension declarations, directories, catalog entries, and runtime registrations are unsupported.

Before publishing an extension as `available`, complete its specification, privacy and rights records, host and authentication declarations, contract suite, smoke-test record, source link, and source revision. Tracker packages must cover authentication, search, progress, updates, collections, expiry/refresh, and logout behavior.

Do not add publisher signing keys, package approval envelopes, or safety claims. Package hashes are artifact-integrity metadata only.

Run `npm run check && npm test && npm run bundle && npm run docs:build && npm run publish:dry-run` before opening a pull request.
