/** Lightweight API client for SDK hooks */

export interface ApiClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
}

let globalOptions: ApiClientOptions = {};

/** Configure the global API client base URL and headers */
export function configureApiClient(options: ApiClientOptions): void {
  globalOptions = { ...globalOptions, ...options };
}

/** Read the current API client configuration. */
export function getApiClientOptions(): Readonly<ApiClientOptions> {
  return globalOptions;
}

/** Returns true when a caller configured an Authorization header for API requests. */
export function hasConfiguredApiAuthorization(): boolean {
  const headers = globalOptions.headers ?? {};
  const authorization = headers.Authorization ?? headers.authorization;
  return typeof authorization === 'string' && authorization.trim().length > 0;
}

/** Fetch JSON from an API endpoint, resolving against the configured base URL */
export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const url = globalOptions.baseUrl
    ? `${globalOptions.baseUrl.replace(/\/$/, '')}${path}`
    : path;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...globalOptions.headers,
    ...(init?.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
