# Altair Bestdori

Imports Bestdori scenarios and resources into Altair projects.

```sh
pnpm add @haneoka/altair @haneoka/altair-plugin-bestdori
```

The plugin provides scenario conversion, asset browsing, previews, diagnostics, and Live2D source normalization. Applications supply network access through `fetchIndex`, `fetchBundle`, `resolveRawUrl`, and optional `fetchLive2d` adapters.

An explicit server takes priority over locale selection. Japanese, English, Traditional Chinese, Simplified Chinese, and Korean map to `jp`, `en`, `tw`, `cn`, and `kr`; unsupported locales fall back to the configured server and then `jp`.

The package does not include upstream models, Live2D SDKs, or Cubism Core.

MPL-2.0.
