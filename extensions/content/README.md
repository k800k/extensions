# Content extensions

The catalog contains two adult-rated content packages:

- `NHentai` — available; review the adult-content and rights records before installing
- `HitomiLA` — available; review the adult-content and rights records before installing
Each package has an independent specification, privacy assessment, rights record, review status, neutral icon, and sanitized contract and behavior tests. A catalog entry does not bypass MangaReader's activation review.

Create a new reviewed scaffold from the repository root with:

```sh
node packages/cli/bin/mr-ext.mjs new --id ExampleSource --name "Example Source"
```

Only content extensions are supported. Tracker and theme extension kinds are intentionally rejected by the SDK, CLI, catalog, and website.
