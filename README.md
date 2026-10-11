# Altair Bestdori

Altair Bestdori opens [Bestdori](https://bestdori.com) story scenarios in the
[Altair](https://github.com/haneoka-gakuen/altair) editor and lets you browse
Bestdori's asset tree while you write. A scenario becomes an ordinary Altair
project made of [ADV commands](https://github.com/haneoka-gakuen/altair-plugin-adv):
dialogue keeps its speakers and voice lines, character placement is converted
to stage positions, backgrounds and stills keep their aspect, and Live2D
costumes are normalized so Vega can load them. From there you can edit,
preview in [Vega](https://github.com/haneoka-gakuen/vega), and export.

The plugin brings no network code of its own. Your application decides how
Bestdori is reached — direct, through a proxy, or from a local mirror — and the
plugin handles everything Bestdori-specific on top of that.

## Install

```sh
pnpm add @haneoka/altair @haneoka/altair-plugin-adv @haneoka/altair-plugin-bestdori
```

The plugin depends on Altair ADV (`haneoka.altair-adv ^0.1.0`); install that
first. ESM only; Node 20 or a current browser.

## Use it in Altair

For importing scenario files only, the default plugin is enough:

```ts
import { AltairPluginHost } from "@haneoka/altair/plugins";
import { altairAdvPlugin } from "@haneoka/altair-plugin-adv";
import { altairBestdoriPlugin } from "@haneoka/altair-plugin-bestdori";

const host = new AltairPluginHost();
await host.install(altairAdvPlugin);
await host.install(altairBestdoriPlugin);
```

To browse and insert Bestdori assets as well, create the plugin with a
resource adapter:

```ts
import { createAltairBestdoriPlugin } from "@haneoka/altair-plugin-bestdori";

const bestdori = createAltairBestdoriPlugin({
  resources: {
    locale: navigator.language,
    adapter: {
      fetchIndex: ({ server, signal }) =>
        fetch(`/bestdori/api/explorer/${server}/assets/_info.json`, { signal }).then((r) => r.json()),
      fetchBundle: ({ server, path, signal }) =>
        fetch(`/bestdori/api/explorer/${server}/assets/${path.join("/")}.json`, { signal }).then((r) => r.json()),
      resolveRawUrl: (rawPath, server) => `/bestdori/assets/${server}/${rawPath}`,
      fetchLive2d: ({ costumeId, signal }) =>
        fetch(`/bestdori/live2d/${costumeId}/buildData.json`, { signal }).then((r) => r.json()),
    },
  },
});
await host.install(bestdori);
```

The paths above are only an example; point them at however your app reaches
Bestdori.

| Contribution | Details |
| --- | --- |
| Format `bestdori-scenario` | Accepts `.asset` and `.json` files whose JSON has a `Base` object. Imports to a project; exports Altair project JSON. |
| Resource browser | Added only when `resources` is set. Shows the Bestdori tree under a `bestdori` root, with previews and drag-to-insert. |
| Service `ALTAIR_BESTDORI_ASSET_SERVICE` | Path, preview and Live2D helpers for other plugins. |

### Choosing the Bestdori server

Bestdori keeps separate trees for `jp`, `en`, `tw`, `cn` and `kr`. The server
is chosen in this order:

1. An explicit `server` option (or `bestdoriServer` in a browse request).
2. The locale: Japanese → `jp`, English → `en`, Traditional Chinese → `tw`,
   Simplified Chinese → `cn`, Korean → `kr`.
3. The configured fallback, and finally `jp`.

The server is independent of the language your project is written in.

## The resource adapter

| Member | Called with | Returns |
| --- | --- | --- |
| `fetchIndex` | `{ server, signal }` | Bestdori's asset index for that server. |
| `fetchBundle` | `{ server, path, signal }` | The file list of one bundle. |
| `resolveRawUrl` | `(rawPath, server)` | A URL your app can load for that raw file. |
| `fetchLive2d` (optional) | `{ server, costumeId, signal }` | The costume's build data, used to assemble a Live2D model entry. Without it Live2D folders still list, but cannot be inserted. |

Every call receives an `AbortSignal`; cancelled browsing never leaves stale
results behind.

What each file becomes when inserted:

| Bestdori file | Inserted as |
| --- | --- |
| Image | Background, still, frame or plain image |
| Audio | BGM, sound effect or voice, decided from the bundle path |
| Video | Movie |
| Live2D costume | Character model, with its icon |

## Importing without the editor

```ts
import { importBestdoriScenario } from "@haneoka/altair-plugin-bestdori";

const { project, diagnostics } = importBestdoriScenario(bytes, {
  title: "Band Story 1",
  server: "jp",
  voiceBundle: "sound/voice/scenario/bandstory1_rip/",
});
```

`ImportBestdoriScenarioOptions`:

| Option | Meaning |
| --- | --- |
| `title`, `sceneId`, `sceneName` | Names for the created project and scene. |
| `server` | Bestdori region the scenario comes from. |
| `locale` | Used to pick the region only when `server` is not given. |
| `releaseServer` | Your own release id, stored on the project. |
| `voiceBundle` | Path prefix of the voice files; each line loads `/assets/<server>/<voiceBundle><voiceId>.mp3`. |
| `proxify` | Rewrites resource URLs, for example through your proxy. |
| `resolveCostume` | Maps a character to the Live2D costume to show. |
| `provenance` | Free-form JSON stored with the project. |

`parseBestdoriScenario` returns the project without diagnostics.
`serializeBestdoriScenario(project)` writes the project as Altair project
JSON — Altair does not write Bestdori's own format back.

Errors in the input throw `BestdoriFormatError`. Anything that converts but not
exactly (an unknown motion, an effect with no counterpart) is reported as a
diagnostic with a severity and a path.

## Lower-level helpers

`@haneoka/altair-plugin-bestdori/source` exposes the pieces the importer is
built from, for tools that work with Bestdori data directly:

- `resolveBestdoriServer`, `bestdoriServerForLocale` — server selection.
- `bestdoriBuildDataToLive2dEntry`, `resolveBundlePath` — Live2D build data to
  a model entry Vega can load.
- `BESTDORI_PERSPECTIVE_SCENE`, `bestdoriCharacterWorldPosition`,
  `bestdoriPositionTypeFromSide` — Bestdori's 2D character sides mapped to
  stage positions.
- `bestdoriBackgroundStageRef` — the stage reference for a background of a
  given aspect ratio (4:3 backgrounds and 1334×1002 card stills).

Other subpaths: `/assets` (asset paths and resources), `/resource-browser`
(the browser without the plugin), `/provider` (the browser as an Altair
contribution).

## What is not included

No Bestdori data, Live2D models, Live2D SDK or Cubism Core ships with this
package. Your application supplies them through the adapter and Vega's Cubism
plugin.

## License

MPL-2.0. See [LICENSE](LICENSE).
