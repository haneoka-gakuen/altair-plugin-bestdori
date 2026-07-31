import type { JsonObject } from "@haneoka/altair";
import {
  defineAltairPlugin,
  defineAltairService,
  type AltairFormatContribution,
  type AltairSourceFile,
} from "@haneoka/altair/plugins";
import {
  altairBestdoriAssetService,
  type AltairBestdoriAssetService,
} from "./assets.js";
import {
  createAltairBestdoriResourceProvider,
  type AltairBestdoriResourceProviderOptions,
} from "./provider.js";
import {
  importBestdoriScenario,
  serializeBestdoriScenario,
} from "./story-project.js";

export {
  importBestdoriScenario,
  parseBestdoriScenario,
  serializeBestdoriScenario,
  type ImportBestdoriScenarioOptions,
} from "./story-project.js";
export * from "./assets.js";
export * from "./resource-browser.js";
export * from "./provider.js";
export * from "./source.js";

export const ALTAIR_BESTDORI_PLUGIN_ID = "haneoka.altair-bestdori" as const;
export const ALTAIR_BESTDORI_FORMAT_ID = "bestdori-scenario" as const;
export const ALTAIR_BESTDORI_ASSET_SERVICE =
  defineAltairService<AltairBestdoriAssetService>(
    "haneoka.altair.bestdori.assets",
  );

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const entryFile = (
  files: readonly AltairSourceFile[],
  entryPath?: string,
): AltairSourceFile => {
  const entry = entryPath
    ? files.find(({ path }) => path === entryPath)
    : files[0];
  if (!entry) throw new RangeError("Bestdori format entry does not exist");
  return entry;
};

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringOption = (
  options: JsonObject | undefined,
  key: string,
): string | undefined => {
  const value = options?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const assertActive = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw (
      signal.reason ??
      new DOMException("Bestdori format operation aborted", "AbortError")
    );
  }
};

export const altairBestdoriFormat = Object.freeze({
  id: ALTAIR_BESTDORI_FORMAT_ID,
  name: "Bestdori scenario",
  extensions: [".asset", ".json"],
  mediaTypes: ["application/json"],
  sniff(request) {
    assertActive(request.signal);
    const entry = entryFile(request.files, request.entryPath);
    try {
      const parsed = JSON.parse(decoder.decode(entry.bytes)) as unknown;
      if (record(parsed) && record(parsed.Base)) return 1;
    } catch {
      return 0;
    }
    return /\.asset$/iu.test(entry.path) ? 0.5 : 0;
  },
  import(request) {
    assertActive(request.signal);
    const entry = entryFile(request.files, request.entryPath);
    const title = stringOption(request.options, "title");
    const releaseServer = stringOption(request.options, "releaseServer");
    const server = stringOption(request.options, "server");
    const locale = stringOption(request.options, "locale");
    const result = importBestdoriScenario(entry.bytes, {
      ...(title ? { title } : {}),
      ...(releaseServer ? { releaseServer } : {}),
      ...(locale ? { locale } : {}),
      ...(server
        ? {
            server: server as "jp" | "en" | "tw" | "cn" | "kr",
          }
        : {}),
    });
    assertActive(request.signal);
    return result;
  },
  export(request) {
    assertActive(request.signal);
    return {
      artifacts: [
        {
          path: request.entryPath ?? "story.story.json",
          bytes: encoder.encode(serializeBestdoriScenario(request.project)),
          mediaType: "application/vnd.haneoka.story-project+json",
        },
      ],
      diagnostics: [],
    };
  },
} satisfies AltairFormatContribution);

export interface AltairBestdoriPluginOptions {
  /**
   * Enables the neutral resource-browser contribution. Transport remains
   * host-injected; the plugin retains all source-specific traversal rules.
   */
  readonly resources?: AltairBestdoriResourceProviderOptions;
}

export const createAltairBestdoriPlugin = (
  options: AltairBestdoriPluginOptions = {},
) => {
  const resourceProvider = options.resources
    ? createAltairBestdoriResourceProvider(options.resources)
    : undefined;
  return defineAltairPlugin({
    manifest: {
      id: ALTAIR_BESTDORI_PLUGIN_ID,
      name: "Altair Bestdori",
      version: "0.1.0",
      apiVersion: 2,
      dependencies: {
        "haneoka.altair-adv": "^0.1.0",
      },
      capabilities: ["assets", "diagnostics", "format", "services"],
    },
    setup(context) {
      context.contribute("format", altairBestdoriFormat);
      if (resourceProvider) {
        context.contribute("resource-browser", resourceProvider);
      }
      context.provide(
        ALTAIR_BESTDORI_ASSET_SERVICE,
        altairBestdoriAssetService,
      );
    },
  });
};

export const altairBestdoriPlugin = createAltairBestdoriPlugin();

export default altairBestdoriPlugin;
