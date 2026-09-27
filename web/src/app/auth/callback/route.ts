import { NextResponse, type NextRequest } from "next/server";
import { secureCookies } from "@/server/config";
import { appUrl } from "@/server/http";
import { exchangeCode, validateIdToken } from "@/server/oidc";
import { createSession, SESSION_COOKIE, takeLoginState } from "@/server/session";

/** Keycloak redirects here after sign-in with ?code and ?state. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const fail = (reason: string) => NextResponse.redirect(appUrl(`/signin-error?reason=${encodeURIComponent(reason)}`));

  if (params.get("error")) return fail(params.get("error_description") ?? params.get("error")!);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("missing_code");

  const login = await takeLoginState(state);
  if (!login) return fail("expired"); // Unknown or reused state: possible CSRF or a stale tab.

  try {
    const tokens = await exchangeCode(code, login.verifier);
    const { sub } = validateIdToken(tokens.idToken, login.nonce);
    const sid = await createSession({ sub, tokens });
    const res = NextResponse.redirect(appUrl(login.returnTo));
    res.cookies.set(SESSION_COOKIE, sid, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/" });
    return res;
  } catch (err) {
    console.error("Sign-in failed", err);
    return fail("token_exchange");
  }
}
