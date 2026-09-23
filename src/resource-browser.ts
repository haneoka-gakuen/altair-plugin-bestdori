import {
  bestdoriEditorAssetNodeAt,
  bestdoriEditorAssetReference,
  bestdoriEditorAssetResource,
  bestdoriLive2dCharacterIcon,
  bestdoriLive2dResource,
  type BestdoriEditorAssetBundleResponse,
  type BestdoriEditorAssetIndexResponse,
  type BestdoriEditorAssetReference,
  type BestdoriEditorAudioUsage,
  type BestdoriEditorResourceInsert,
  type BestdoriVisualResourceKind,
} from "./assets.js";

export interface BestdoriResourceIndexRequest {
  readonly server: string;
  readonly signal: AbortSignal;
}

export interface BestdoriResourceBundleRequest extends BestdoriResourceIndexRequest {
  readonly path: readonly string[];
}

export interface BestdoriResourceLive2dRequest extends BestdoriResourceIndexRequest {
  readonly costumeId: string;
}

/**
 * All I/O is supplied by the host. The plugin owns Bestdori path semantics,
 * source normalization, preview descriptors, and insert descriptors.
 */
export interface BestdoriResourceBrowserAdapter {
  readonly fetchIndex: (request: BestdoriResourceIndexRequest) => Promise<BestdoriEditorAssetIndexResponse>;
  readonly fetchBundle: (request: BestdoriResourceBundleRequest) => Promise<BestdoriEditorAssetBundleResponse>;
  readonly resolveRawUrl: (rawPath: string, server: string) => string;
  readonly fetchLive2d?: (
    request: BestdoriResourceLive2dRequest,
  ) => Promise<Readonly<Record<string, unknown>> | undefined>;
}

export type BestdoriResourceMediaKind = "image" | "audio" | "video" | "data" | "live2d";

export interface BestdoriResourceMediaDescriptor {
  readonly kind: BestdoriResourceMediaKind;
  readonly rawPath?: string;
  readonly url?: string;
}

export interface BestdoriResourcePreviewDescriptor {
  readonly kind: "image" | "audio" | "video";
  readonly url: string;
}

export type BestdoriResourceInsertDescriptor =
  | {
      readonly kind: "asset";
      readonly reference: BestdoriEditorAssetReference;
    }
  | {
      readonly kind: "live2d";
      readonly server: string;
      readonly costumeId: string;
      readonly resourceKey: string;
    };

interface BestdoriResourceNodeBase {
  readonly id: string;
  readonly path: readonly string[];
  readonly name: string;
  readonly description?: string;
}

export interface BestdoriResourceDirectoryNode extends BestdoriResourceNodeBase {
  readonly kind: "directory";
}

export interface BestdoriResourceFileNode extends BestdoriResourceNodeBase {
  readonly kind: "file";
  readonly media: BestdoriResourceMediaDescriptor;
  readonly preview?: BestdoriResourcePreviewDescriptor;
  readonly insert?: BestdoriResourceInsertDescriptor;
}

export type BestdoriResourceNode = BestdoriResourceDirectoryNode | BestdoriResourceFileNode;

export interface BestdoriResourceBrowseRequest {
  readonly server?: string;
  readonly path?: readonly string[];
  readonly signal?: AbortSignal;
}

export interface BestdoriResourceBrowseResult {
  readonly server: string;
  readonly path: readonly string[];
  readonly nodes: readonly BestdoriResourceNode[];
}

export interface BestdoriResourceInsertOptions {
  readonly visualKind?: BestdoriVisualResourceKind;
  readonly audioUsage?: BestdoriEditorAudioUsage;
  readonly signal?: AbortSignal;
}

export interface AltairBestdoriResourceBrowser {
  readonly browse: (request?: BestdoriResourceBrowseRequest) => Promise<BestdoriResourceBrowseResult>;
  readonly list: AltairBestdoriResourceBrowser["browse"];
  readonly resolveInsert: (
    descriptor: BestdoriResourceInsertDescriptor,
    options?: BestdoriResourceInsertOptions,
  ) => Promise<BestdoriEditorResourceInsert | undefined>;
}

const neverAborted = new AbortController().signal;

const assertActive = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("Bestdori resource operation aborted", "AbortError");
  }
};

const normalizePath = (path: readonly string[] | undefined): string[] =>
  (path ?? []).map((part) => {
    const normalized = part.normalize("NFKC").trim();
    if (
      !normalized ||
      normalized === "." ||
      normalized === ".." ||
      normalized.includes("/") ||
      normalized.includes("\\") ||
      normalized.includes("\0")
    ) {
      throw new TypeError("Bestdori resource path contains an unsafe segment");
    }
    return normalized;
  });

const nodeId = (server: string, kind: "directory" | "file", path: readonly string[]): string =>
  `bestdori:${encodeURIComponent(server)}:${kind}:${path.map(encodeURIComponent).join("/")}`;

const directoryNode = (server: string, path: readonly string[], name: string): BestdoriResourceDirectoryNode =>
  Object.freeze({
    kind: "directory",
    id: nodeId(server, "directory", path),
    path: Object.freeze([...path]),
    name,
  });

const assetFileNode = (
  adapter: BestdoriResourceBrowserAdapter,
  server: string,
  bundlePath: readonly string[],
  fileName: string,
): BestdoriResourceFileNode => {
  const reference = bestdoriEditorAssetReference(server, bundlePath, fileName, adapter.resolveRawUrl);
  const path = [...bundlePath, fileName];
  const preview =
    reference.mediaKind === "image" || reference.mediaKind === "audio" || reference.mediaKind === "video"
      ? Object.freeze({
          kind: reference.mediaKind,
          url: reference.url,
        })
      : undefined;
  return Object.freeze({
    kind: "file",
    id: nodeId(server, "file", path),
    path: Object.freeze(path),
    name: fileName,
    description: bundlePath.join("/"),
    media: Object.freeze({
      kind: reference.mediaKind,
      rawPath: reference.rawPath,
      url: reference.url,
    }),
    ...(preview ? { preview } : {}),
    ...(reference.mediaKind === "data"
      ? {}
      : {
          insert: Object.freeze({
            kind: "asset",
            reference,
          } satisfies BestdoriResourceInsertDescriptor),
        }),
  });
};

const live2dFileNode = (
  adapter: BestdoriResourceBrowserAdapter,
  server: string,
  parentPath: readonly string[],
  costumeId: string,
): BestdoriResourceFileNode => {
  const path = [...parentPath, costumeId];
  const iconUrl = bestdoriLive2dCharacterIcon(costumeId, adapter.resolveRawUrl, server);
  return Object.freeze({
    kind: "file",
    id: nodeId(server, "file", path),
    path: Object.freeze(path),
    name: costumeId,
    description: "Bestdori Live2D",
    media: Object.freeze({ kind: "live2d" }),
    ...(iconUrl
      ? {
          preview: Object.freeze({
            kind: "image",
            url: iconUrl,
          } satisfies BestdoriResourcePreviewDescriptor),
        }
      : {}),
    insert: Object.freeze({
      kind: "live2d",
      server,
      costumeId,
      resourceKey: `bestdori:live2d:${costumeId}`,
    }),
  });
};

export const createBestdoriResourceBrowser = (
  adapter: BestdoriResourceBrowserAdapter,
): AltairBestdoriResourceBrowser => {
  const browse = async (request: BestdoriResourceBrowseRequest = {}): Promise<BestdoriResourceBrowseResult> => {
    const server = request.server?.trim() || "jp";
    const path = normalizePath(request.path);
    const signal = request.signal ?? neverAborted;
    assertActive(signal);
    const index = await adapter.fetchIndex({ server, signal });
    assertActive(signal);
    const node = bestdoriEditorAssetNodeAt(index.tree, path);
    if (node === undefined) {
      return Object.freeze({
        server,
        path: Object.freeze(path),
        nodes: Object.freeze([]),
      });
    }

    let nodes: readonly BestdoriResourceNode[];
    if (typeof node === "number") {
      const bundle = await adapter.fetchBundle({ server, path, signal });
      assertActive(signal);
      nodes = bundle.files
        .map((fileName) => assetFileNode(adapter, bundle.server || server, path, fileName))
        .sort((left, right) => left.name.localeCompare(right.name));
    } else {
      const live2dCostumes = path.join("/") === "live2d/chara";
      nodes = Object.keys(node)
        .sort((left, right) => left.localeCompare(right))
        .map((name) =>
          live2dCostumes ? live2dFileNode(adapter, server, path, name) : directoryNode(server, [...path, name], name),
        );
    }
    return Object.freeze({
      server,
      path: Object.freeze(path),
      nodes: Object.freeze(nodes),
    });
  };

  const resolveInsert = async (
    descriptor: BestdoriResourceInsertDescriptor,
    options: BestdoriResourceInsertOptions = {},
  ): Promise<BestdoriEditorResourceInsert | undefined> => {
    const signal = options.signal ?? neverAborted;
    assertActive(signal);
    if (descriptor.kind === "asset") {
      return bestdoriEditorAssetResource(descriptor.reference, options.visualKind, options.audioUsage);
    }
    if (!adapter.fetchLive2d) {
      throw new ReferenceError("Bestdori Live2D loading is not configured for this browser");
    }
    const value = await adapter.fetchLive2d({
      server: descriptor.server,
      costumeId: descriptor.costumeId,
      signal,
    });
    assertActive(signal);
    return value ? bestdoriLive2dResource(descriptor.costumeId, value) : undefined;
  };

  return Object.freeze({
    browse,
    list: browse,
    resolveInsert,
  });
};
