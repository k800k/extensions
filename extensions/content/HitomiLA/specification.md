# Hitomi.la extension specification

This MangaReader API v1 package provides anonymous English latest and popular discovery, multi-language search, gallery details, a synthetic gallery installment, and ordered WebP pages. Nozomi indices are requested in byte ranges and decoded as big-endian 32-bit gallery identifiers.

Search defaults to English. A `language:<name>` term overrides the language, namespaced tags use their Nozomi namespace, negative terms subtract matches, and plain title terms use the galleries-index B-tree. Gallery metadata assignments and routing configuration are parsed structurally as data; service JavaScript is never executed.

The exact host boundary is `hitomi.la`, `ltn.gold-usergeneratedcontent.net`, `w1.gold-usergeneratedcontent.net`, and `w2.gold-usergeneratedcontent.net`. Routing configuration is cached for thirty minutes, only known routing hosts are constructed, and metadata fan-out is limited to four concurrent operations. Invalid identifiers, hashes, ranges, assignments, and response types fail closed.
