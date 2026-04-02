/**
 * Minimal route handler types so the SDK doesn't force an Express dependency.
 * Consumers wire these into Express, Fastify, or any compatible HTTP framework.
 */

export interface RouteRequest {
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface RouteResponse {
  status(code: number): RouteResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  write(chunk: string): void;
  end(): void;
  on(event: string, handler: () => void): void;
}

export type RouteHandler = (req: RouteRequest, res: RouteResponse) => void | Promise<void>;

export interface Router {
  get(path: string, handler: RouteHandler): void;
  post(path: string, handler: RouteHandler): void;
}

export interface RouterFactory {
  (): Router;
}
