import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/server/http";
import { logoutUrl } from "@/server/oidc";
import { destroySession, SESSION_COOKIE } from "@/server/session";

/** Ends the app session and the Keycloak session, then returns to the landing page. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  const session = sid ? await destroySession(sid) : null;
  const res = NextResponse.redirect(logoutUrl(session?.tokens.idToken), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
