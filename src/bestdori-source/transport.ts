export const BESTDORI_SERVERS = ["jp", "en", "tw", "cn", "kr"] as const;

export type BestdoriServer = (typeof BESTDORI_SERVERS)[number];
export type BestdoriResponseType = "json" | "text" | "bytes";

export const isBestdoriServer = (value: unknown): value is BestdoriServer =>
  typeof value === "string" && (BESTDORI_SERVERS as readonly string[]).includes(value);

const normalizedLocaleSegments = (value: unknown): readonly string[] =>
  typeof value === "string" ? value.trim().replaceAll("_", "-").toLowerCase().split("-").filter(Boolean) : [];

/**
 * Resolve a UI/content locale to the Bestdori server that owns that language.
 *
 * An explicit Chinese script is more precise than a possibly conflicting
 * region. Bare Bestdori server ids are accepted so hosts can forward persisted
 * source metadata through the same boundary.
 */
export const bestdoriServerForLocale = (locale: unknown): BestdoriServer | undefined => {
  const segments = normalizedLocaleSegments(locale);
  const language = segments[0];
  if (!language) return undefined;
  if (isBestdoriServer(language)) return language;
  if (language === "ja") return "jp";
  if (language === "ko") return "kr";
  if (language !== "zh") return undefined;
  if (segments.includes("hant")) return "tw";
  if (segments.includes("hans")) return "cn";
  return segments.some((segment) => segment === "tw" || segment === "hk" || segment === "mo") ? "tw" : "cn";
};

export interface ResolveBestdoriServerOptions {
  /** A persisted/user-selected Bestdori server always wins when valid. */
  readonly server?: unknown;
  /** BCP 47 language tag used only when no valid explicit server exists. */
  readonly locale?: unknown;
  /** Final fallback for missing or unsupported locales. Defaults to Japanese. */
  readonly fallback?: BestdoriServer;
}

export const resolveBestdoriServer = ({
  server,
  locale,
  fallback = "jp",
}: ResolveBestdoriServerOptions = {}): BestdoriServer =>
  isBestdoriServer(server) ? server : (bestdoriServerForLocale(locale) ?? fallback);

export interface BestdoriTransportRequest {
  /** Asset/API path relative to the transport's configured Bestdori origin. */
  path: string;
  responseType: BestdoriResponseType;
  server?: BestdoriServer;
  headers?: Readonly<Record<string, string>>;
}

export interface BestdoriTransportResponse<T> {
  data: T;
  status: number;
  server?: BestdoriServer;
  url?: string;
  headers?: Readonly<Record<string, string>>;
}

/** Implemented by the host: fetch/cache/retry policy never leaks into converters. */
export interface BestdoriTransport {
  request<T = unknown>(request: Readonly<BestdoriTransportRequest>): Promise<BestdoriTransportResponse<T>>;
}

export interface BestdoriTransportErrorOptions {
  status?: number;
  server?: BestdoriServer;
  retryable?: boolean;
  cause?: unknown;
}

export class BestdoriTransportError extends Error {
  readonly status?: number;
  readonly server?: BestdoriServer;
  readonly retryable: boolean;

  constructor(message: string, options: BestdoriTransportErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "BestdoriTransportError";
    if (options.status !== undefined) this.status = options.status;
    if (options.server !== undefined) this.server = options.server;
    this.retryable = options.retryable ?? false;
  }
}
