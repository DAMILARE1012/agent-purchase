import type { NextRequest } from "next/server";
import { serverConfig } from "./config";

const APP_ORIGIN = new URL(serverConfig.appUrl).origin;

/**
 * CSRF defence for state-changing requests: browsers always send Origin on
 * cross-site POSTs, so a mismatched Origin means another site sent it.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  return origin === null || origin === APP_ORIGIN;
}

/** Absolute URL on the public app origin (the request's own host may be internal). */
export function appUrl(path: string): URL {
  return new URL(path, serverConfig.appUrl);
}
