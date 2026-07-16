# Content extensions

No content extensions are currently published.

Create a new reviewed scaffold from the repository root with:

```sh
node packages/cli/bin/mr-ext.mjs new --id ExampleSource --name "Example Source"
```

Only content extensions are supported. Tracker and theme extension kinds are intentionally rejected by the SDK, CLI, catalog, and website.
