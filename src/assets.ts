import { BESTDORI_BACKGROUND_STAGE_REF, createBestdoriSceneRuntime } from "./bestdori-source/scene.js";
import { hasBestdoriCharacterIcon } from "./bestdori-source/resources.js";
import {
  createBestdoriResourceBrowser,
  type AltairBestdoriResourceBrowser,
  type BestdoriResourceBrowserAdapter,
} from "./resource-browser.js";
import {
  createAltairBestdoriResourceProvider,
  type AltairBestdoriResourceProvider,
  type AltairBestdoriResourceProviderOptions,
} from "./provider.js";

export type BestdoriEditorAssetNode = number | { readonly [name: string]: BestdoriEditorAssetNode };

export interface BestdoriEditorAssetIndexResponse {
  readonly server: string;
  readonly tree: Readonly<Record<string, BestdoriEditorAssetNode>>;
}

export interface BestdoriEditorAssetBundleResponse {
  readonly server: string;
  readonly path: string;
  readonly files: readonly string[];
}

export type BestdoriEditorAssetMediaKind = "image" | "audio" | "video" | "data";
export type BestdoriEditorAudioUsage = "bgm" | "se" | "voice";
export type BestdoriVisualResourceKind = "background" | "still" | "frame";

export interface BestdoriEditorAssetReference {
  readonly server: string;
  readonly bundlePath: readonly string[];
  readonly fileName: string;
  readonly rawPath: string;
  readonly url: string;
  readonly mediaKind: BestdoriEditorAssetMediaKind;
}

export type BestdoriEditorResourceInsert =
  | {
      readonly kind: BestdoriVisualResourceKind | "video" | "live2d";
      readonly key: string;
      readonly value: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: "audio";
      readonly usage: BestdoriEditorAudioUsage;
      readonly key: string;
      readonly value: Readonly<Record<string, unknown>>;
    };

export type BestdoriAssetUrlResolver = (rawPath: string, server: string) => string;

const extension = (name: string): string =>
  name
    .split(/[?#]/u, 1)[0]
    ?.match(/\.([a-z0-9]+)$/iu)?.[1]
    ?.toLocaleLowerCase("en-US") ?? "";

export const bestdoriEditorAssetMediaKind = (name: string): BestdoriEditorAssetMediaKind => {
  const suffix = extension(name);
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(suffix)) {
    return "image";
  }
  if (["mp3", "wav", "ogg", "aac", "m4a"].includes(suffix)) {
    return "audio";
  }
  if (["mp4", "webm", "m4v"].includes(suffix)) return "video";
  return "data";
};

export const bestdoriEditorAssetNodeAt = (
  tree: Readonly<Record<string, BestdoriEditorAssetNode>> | undefined,
  path: readonly string[],
): BestdoriEditorAssetNode | undefined => {
  let node: BestdoriEditorAssetNode = tree ?? {};
  for (const segment of path) {
    if (typeof node === "number") return undefined;
    node = node[segment] as BestdoriEditorAssetNode;
    if (node === undefined) return undefined;
  }
  return node;
};

const safePathPart = (value: string, label: string): string => {
  const result = value.normalize("NFKC").trim();
  if (
    !result ||
    result === "." ||
    result === ".." ||
    result.includes("/") ||
    result.includes("\\") ||
    result.includes("\0")
  ) {
    throw new TypeError(`Bestdori ${label} is not a safe path segment`);
  }
  return result;
};

export const bestdoriEditorAssetRawPath = (server: string, bundlePath: readonly string[], fileName: string): string => {
  const region = safePathPart(server, "server");
  const bundle = bundlePath.map((part) => safePathPart(part, "bundle path"));
  const file = safePathPart(fileName, "file name");
  if (!bundle.length) {
    throw new TypeError("Bestdori bundle path must not be empty");
  }
  return `/assets/${region}/${bundle.join("/")}_rip/${file}`;
};

export const bestdoriEditorAssetUrl = (
  server: string,
  bundlePath: readonly string[],
  fileName: string,
  resolveUrl: BestdoriAssetUrlResolver = (path) => path,
): string => {
  const rawPath = bestdoriEditorAssetRawPath(server, bundlePath, fileName);
  return resolveUrl(rawPath, server);
};

export const bestdoriEditorAssetReference = (
  server: string,
  bundlePath: readonly string[],
  fileName: string,
  resolveUrl?: BestdoriAssetUrlResolver,
): BestdoriEditorAssetReference => {
  const rawPath = bestdoriEditorAssetRawPath(server, bundlePath, fileName);
  return Object.freeze({
    server,
    bundlePath: Object.freeze([...bundlePath]),
    fileName,
    rawPath,
    url: resolveUrl ? resolveUrl(rawPath, server) : rawPath,
    mediaKind: bestdoriEditorAssetMediaKind(fileName),
  });
};

export const bestdoriEditorAudioUsage = (
  bundlePath: readonly string[],
  preferred?: BestdoriEditorAudioUsage,
): BestdoriEditorAudioUsage => {
  if (preferred) return preferred;
  const path = bundlePath.join("/").toLocaleLowerCase("en-US");
  if (/(?:^|\/)(?:voice|vocal)(?:\/|$)/u.test(path)) return "voice";
  if (/(?:^|\/)(?:bgm\d*|music)(?:\/|$)/u.test(path)) return "bgm";
  return "se";
};

const commonResource = (asset: BestdoriEditorAssetReference): Readonly<Record<string, unknown>> => ({
  resourceRef: asset.rawPath,
  assetId: asset.rawPath,
  assetName: asset.fileName,
  sourcePath: asset.rawPath,
  url: asset.url,
  source: "bestdori",
  sourceServer: asset.server,
  runtimeAvailable: true,
});

export const bestdoriEditorAudioResource = (
  asset: BestdoriEditorAssetReference,
  preferredUsage?: BestdoriEditorAudioUsage,
): BestdoriEditorResourceInsert => {
  const usage = bestdoriEditorAudioUsage(asset.bundlePath, preferredUsage);
  return {
    kind: "audio",
    usage,
    key: asset.rawPath,
    value: {
      resourceRef: asset.rawPath,
      soundId: asset.rawPath,
      cueName: asset.fileName,
      categoryName: usage === "bgm" ? "Bgm" : usage === "voice" ? "Voice" : "Se",
      playableUrl: asset.url,
      url: asset.url,
      sourcePath: asset.rawPath,
      source: "bestdori",
      sourceServer: asset.server,
    },
  };
};

export const bestdoriEditorAssetResource = (
  asset: BestdoriEditorAssetReference,
  preferredKind?: BestdoriVisualResourceKind,
  preferredAudioUsage?: BestdoriEditorAudioUsage,
): BestdoriEditorResourceInsert | undefined => {
  if (asset.mediaKind === "data") return undefined;
  if (asset.mediaKind === "audio") {
    return bestdoriEditorAudioResource(asset, preferredAudioUsage);
  }
  const common = commonResource(asset);
  if (asset.mediaKind === "video") {
    return {
      kind: "video",
      key: asset.rawPath,
      value: {
        ...common,
        videoId: asset.rawPath,
        playableUrl: asset.url,
      },
    };
  }
  const kind =
    preferredKind ??
    (asset.bundlePath[0] === "bg" || asset.bundlePath.slice(0, 2).join("/") === "story/bg" ? "background" : "still");
  if (kind !== "background") {
    return {
      kind,
      key: asset.rawPath,
      value: kind === "frame" ? { ...common, texture: asset.url } : common,
    };
  }
  const runtime = createBestdoriSceneRuntime();
  return {
    kind,
    key: asset.rawPath,
    value: {
      ...common,
      stageRef: asset.rawPath,
      stage: runtime.stages[BESTDORI_BACKGROUND_STAGE_REF] ?? runtime.stage,
    },
  };
};

export const bestdoriLive2dResource = (
  costumeId: string,
  value: Readonly<Record<string, unknown>>,
): BestdoriEditorResourceInsert => {
  const id = safePathPart(costumeId, "costume id");
  const key = `bestdori:live2d:${id}`;
  return {
    kind: "live2d",
    key,
    value: {
      ...value,
      live2dKey: key,
      resourceRef: key,
      bestdoriCostumeId: id,
      source: "bestdori",
    },
  };
};

export const bestdoriLive2dCharacterIconPath = (costumeId: string): string | undefined => {
  const characterId = Number(costumeId.match(/^(\d+)/u)?.[1]);
  return hasBestdoriCharacterIcon(characterId) ? `/res/icon/chara_icon_${characterId}.png` : undefined;
};

export const bestdoriLive2dCharacterIcon = (
  costumeId: string,
  resolveUrl: BestdoriAssetUrlResolver = (path) => path,
  server = "jp",
): string | undefined => {
  const path = bestdoriLive2dCharacterIconPath(costumeId);
  return path ? resolveUrl(path, server) : undefined;
};

export interface AltairBestdoriAssetService {
  readonly mediaKind: typeof bestdoriEditorAssetMediaKind;
  readonly nodeAt: typeof bestdoriEditorAssetNodeAt;
  readonly reference: typeof bestdoriEditorAssetReference;
  readonly resource: typeof bestdoriEditorAssetResource;
  readonly live2dResource: typeof bestdoriLive2dResource;
  readonly live2dCharacterIcon: typeof bestdoriLive2dCharacterIcon;
  readonly createBrowser: (adapter: BestdoriResourceBrowserAdapter) => AltairBestdoriResourceBrowser;
  readonly createProvider: (options: AltairBestdoriResourceProviderOptions) => AltairBestdoriResourceProvider;
}

export const altairBestdoriAssetService: AltairBestdoriAssetService = Object.freeze({
  mediaKind: bestdoriEditorAssetMediaKind,
  nodeAt: bestdoriEditorAssetNodeAt,
  reference: bestdoriEditorAssetReference,
  resource: bestdoriEditorAssetResource,
  live2dResource: bestdoriLive2dResource,
  live2dCharacterIcon: bestdoriLive2dCharacterIcon,
  createBrowser: createBestdoriResourceBrowser,
  createProvider: createAltairBestdoriResourceProvider,
});
