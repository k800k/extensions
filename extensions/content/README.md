# Content extensions

The catalog contains 13 provenance-pinned content ports: AllPornComic, Atsumaru, Comix, LNori, MadaraDex, MangaBat, MangaDemon, MangaDex, MangaDot, MangaKakalot, RoyalRoad, Webtoon, and WeebCentral.

Every package includes its declared GPL license, upstream provenance, exact host declarations, review records, icon, and contract tests. All entries remain `approvalRequired` pending publisher signing and MangaReader approval.

Create a new reviewed scaffold from the repository root with:

```sh
node packages/cli/bin/mr-ext.mjs new --id ExampleSource --name "Example Source"
```

Only content extensions are supported. Tracker and theme extension kinds are intentionally rejected by the SDK, CLI, catalog, and website.
