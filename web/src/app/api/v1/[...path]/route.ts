import { NextResponse, type NextRequest } from "next/server";
import { serverConfig } from "@/server/config";
import { isSameOrigin } from "@/server/http";
import { accessTokenFor, destroySession, SESSION_COOKIE } from "@/server/session";

/**
 * Backend-for-frontend proxy: /api/v1/* → FastAPI /v1/*.
 * Adds the session's access token, so the browser never handles tokens.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const FORWARDED_HEADERS = ["content-type", "accept", "idempotency-key"];

async function proxy(req: NextRequest, ctx: RouteContext<"/api/v1/[...path]">) {
  if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden", message: "Cross-site request blocked." }, { status: 403 });
  }

  const { path } = await ctx.params;
  // Payment-network callbacks are server-to-server only; never forward them from browsers.
  if (path[0] === "network") {
    return NextResponse.json({ error: "not_found", message: "Not found." }, { status: 404 });
  }
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  const token = sid ? await accessTokenFor(sid) : null;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  const target = `${serverConfig.apiInternalUrl}/v1/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: SAFE_METHODS.has(req.method) ? undefined : await req.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return NextResponse.json({ error: "api_unavailable", message: "The payment service is unavailable. Try again shortly." }, { status: 502 });
  }

  const res = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
  // The session is gone or no longer accepted: clear the cookie so the UI shows signed-out.
  if (sid && (!token || upstream.status === 401)) {
    if (token) await destroySession(sid);
    res.cookies.delete(SESSION_COOKIE);
  }
  return res;
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
