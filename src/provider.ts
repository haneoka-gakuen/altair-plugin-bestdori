import type {
  ResourceBrowserDirectory,
  ResourceBrowserFile,
  ResourceBrowserInsert,
  ResourceBrowserNode,
  ResourceBrowserPath,
  ResourceBrowserProvider,
  ResourceBrowserRequest,
} from "@haneoka/altair/resource-browser";
import type { BestdoriEditorResourceInsert } from "./assets.js";
import {
  bestdoriEditorAudioUsage,
  type BestdoriEditorAudioUsage,
} from "./assets.js";
import {
  createBestdoriResourceBrowser,
  type BestdoriResourceBrowserAdapter,
  type BestdoriResourceFileNode,
  type BestdoriResourceInsertDescriptor,
  type BestdoriResourceNode,
} from "./resource-browser.js";
import {
  resolveBestdoriServer,
  type BestdoriServer,
} from "./bestdori-source/transport.js";

export type AltairBestdoriResourceReference =
  | BestdoriResourceInsertDescriptor
  | { readonly kind: "unavailable" };

export type AltairBestdoriResourceValue = Readonly<Record<string, unknown>>;

export type AltairBestdoriResourceProvider = ResourceBrowserProvider<
  AltairBestdoriResourceReference,
  AltairBestdoriResourceValue
>;

export interface AltairBestdoriResourceProviderOptions {
  readonly adapter: BestdoriResourceBrowserAdapter;
  /** Explicit source override. Takes priority over `locale`. */
  readonly server?: BestdoriServer;
  /** Initial locale used when a request does not provide one. */
  readonly locale?: string;
  readonly id?: string;
  readonly name?: string;
  readonly rootName?: string;
}

const rootPath = Object.freeze(["bestdori"]);

const requestServer = (
  request: ResourceBrowserRequest,
  fallback: BestdoriServer,
): BestdoriServer =>
  resolveBestdoriServer({
    server: request.context?.bestdoriServer,
    locale: request.context?.bestdoriLocale ?? request.context?.locale,
    fallback,
  });

const acceptedKinds = (
  node: BestdoriResourceFileNode,
): readonly string[] =>
  Object.freeze(
    node.media.kind === "image"
      ? ["background", "still", "frame", "image"]
      : node.media.kind === "audio"
        ? [
            node.insert?.kind === "asset"
              ? bestdoriEditorAudioUsage(node.insert.reference.bundlePath)
              : "se",
            "audio",
          ]
        : node.media.kind === "video"
          ? ["video"]
          : node.media.kind === "live2d"
            ? ["live2d", "model"]
            : [],
  );

const providerPath = (path: readonly string[]): readonly string[] =>
  Object.freeze([...rootPath, ...path]);

const neutralNode = (
  node: BestdoriResourceNode,
  request: ResourceBrowserRequest,
): ResourceBrowserNode<AltairBestdoriResourceReference> => {
  if (node.kind === "directory") {
    return Object.freeze({
      type: "directory",
      id: node.id,
      name: node.name,
      path: providerPath(node.path),
      ...(node.description ? { description: node.description } : {}),
    });
  }
  const kinds = acceptedKinds(node);
  const displayKind = node.media.kind === "live2d" ? "model" : node.media.kind;
  return Object.freeze({
    type: "file",
    id: node.id,
    name: node.name,
    path: providerPath(node.path),
    ...(node.description ? { description: node.description } : {}),
    ...(node.media.rawPath ? { detail: node.media.rawPath } : {}),
    displayKind,
    ...(node.preview?.kind === "audio"
      ? { audioPreviewUrl: node.preview.url }
      : node.preview
        ? { previewUrl: node.preview.url }
        : {}),
    acceptedKinds: kinds,
    available:
      Boolean(node.insert) &&
      (request.acceptedKinds.length === 0 ||
        requestAccepts(kinds, request)),
    reference: node.insert ?? Object.freeze({ kind: "unavailable" }),
  });
};

const audioUsage = (
  file: ResourceBrowserFile<AltairBestdoriResourceReference>,
): BestdoriEditorAudioUsage | undefined =>
  file.reference.kind === "asset" &&
  file.reference.reference.mediaKind === "audio"
    ? bestdoriEditorAudioUsage(file.reference.reference.bundlePath)
    : undefined;

const requestedAudioUsages = (
  request: ResourceBrowserRequest,
): readonly BestdoriEditorAudioUsage[] => {
  const kinds = [
    request.preferredKind &&
    request.acceptedKinds.includes(request.preferredKind)
      ? request.preferredKind
      : undefined,
    ...request.acceptedKinds,
  ];
  return Object.freeze(
    [...new Set(kinds)].filter(
      (kind): kind is BestdoriEditorAudioUsage =>
        kind === "bgm" || kind === "se" || kind === "voice",
    ),
  );
};

const requestAccepts = (
  fileKinds: readonly string[],
  request: ResourceBrowserRequest,
): boolean => {
  if (request.acceptedKinds.length === 0) return true;
  const specificAudio = requestedAudioUsages(request);
  if (
    fileKinds.includes("audio") &&
    specificAudio.length > 0
  ) {
    return specificAudio.some((kind) => fileKinds.includes(kind));
  }
  return request.acceptedKinds.some((kind) => fileKinds.includes(kind));
};

const defaultKind = (
  file: ResourceBrowserFile<AltairBestdoriResourceReference>,
): string | undefined => {
  if (file.reference.kind === "live2d") return "live2d";
  if (file.reference.kind !== "asset") return undefined;
  if (file.reference.reference.mediaKind === "image") return "background";
  if (file.reference.reference.mediaKind === "audio") return "audio";
  if (file.reference.reference.mediaKind === "video") return "video";
  return undefined;
};

const selectedKind = (
  file: ResourceBrowserFile<AltairBestdoriResourceReference>,
  request: ResourceBrowserRequest,
): string | undefined => {
  if (request.acceptedKinds.length === 0) {
    return defaultKind(file);
  }
  const inferredAudioUsage = audioUsage(file);
  if (inferredAudioUsage) {
    const specificAudio = requestedAudioUsages(request);
    if (specificAudio.length > 0) {
      return specificAudio.includes(inferredAudioUsage)
        ? inferredAudioUsage
        : undefined;
    }
    return request.acceptedKinds.includes("audio") ? "audio" : undefined;
  }
  if (
    request.preferredKind &&
    file.acceptedKinds.includes(request.preferredKind) &&
    request.acceptedKinds.includes(request.preferredKind)
  ) {
    return request.preferredKind;
  }
  return request.acceptedKinds.find((kind) => file.acceptedKinds.includes(kind));
};

const neutralInsert = (
  resource: BestdoriEditorResourceInsert,
): ResourceBrowserInsert<AltairBestdoriResourceValue> => ({
  kind: resource.kind,
  key: resource.key,
  value: resource.value,
  ...("usage" in resource ? { usage: resource.usage } : {}),
});

export const createAltairBestdoriResourceProvider = (
  options: AltairBestdoriResourceProviderOptions,
): AltairBestdoriResourceProvider => {
  const browser = createBestdoriResourceBrowser(options.adapter);
  const server = resolveBestdoriServer({
    server: options.server,
    locale: options.locale,
  });
  const root: ResourceBrowserDirectory = Object.freeze({
    type: "directory",
    id: `${options.id ?? "haneoka.altair-bestdori.resources"}:root`,
    name: options.rootName ?? "Bestdori",
    path: rootPath,
  });

  return Object.freeze({
    id: options.id ?? "haneoka.altair-bestdori.resources",
    name: options.name ?? "Bestdori resources",
    roots: Object.freeze([root]),
    preferredPath: (_request) => rootPath,
    async list(
      path: ResourceBrowserPath,
      request: ResourceBrowserRequest,
    ) {
      if (path[0] !== rootPath[0]) return [];
      const result = await browser.browse({
        server: requestServer(request, server),
        path: path.slice(rootPath.length),
        ...(request.signal ? { signal: request.signal } : {}),
      });
      return result.nodes.map((node) => neutralNode(node, request));
    },
    async open(
      file: ResourceBrowserFile<AltairBestdoriResourceReference>,
      request: ResourceBrowserRequest,
    ) {
      if (!file.available) return undefined;
      if (file.reference.kind === "unavailable") return undefined;
      const kind = selectedKind(file, request);
      if (!kind) return undefined;
      const visualKind =
        kind === "background" ||
        kind === "still" ||
        kind === "frame" ||
        kind === "image"
          ? kind === "image"
            ? "background"
            : kind
          : undefined;
      const audioUsage =
        kind === "bgm" || kind === "se" || kind === "voice" ? kind : undefined;
      const resource = await browser.resolveInsert(file.reference, {
        ...(visualKind ? { visualKind } : {}),
        ...(audioUsage ? { audioUsage } : {}),
        ...(request.signal ? { signal: request.signal } : {}),
      });
      return resource ? neutralInsert(resource) : undefined;
    },
  } satisfies AltairBestdoriResourceProvider);
};
