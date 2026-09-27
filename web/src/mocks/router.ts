// Minimal request router for the mock API: "GET runs/:id" style patterns.

export interface MockRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Handler = (req: MockRequest) => unknown;

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  on(method: string, pattern: string, handler: Handler): this {
    const keys: string[] = [];
    const source = pattern
      .split("/")
      .map((part) => (part.startsWith(":") ? (keys.push(part.slice(1)), "([^/]+)") : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/");
    this.routes.push({ method, regex: new RegExp(`^${source}$`), keys, handler });
    return this;
  }

  /** The handler for a request, or null when the route isn't mocked. */
  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(path);
      if (m) return { handler: route.handler, params: Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}
