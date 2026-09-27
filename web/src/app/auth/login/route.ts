import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, pkcePair, randomToken } from "@/server/oidc";
import { destroySession, safeReturnTo, saveLoginState, SESSION_COOKIE } from "@/server/session";

/**
 * Starts sign-in (or sign-up with ?register=1) at Keycloak.
 * ?login_hint=rita pre-fills the username and forces a fresh login, which the
 * demo uses to switch users.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const loginHint = params.get("login_hint") ?? undefined;
  const state = randomToken(24);
  const nonce = randomToken(24);
  const { verifier, challenge } = pkcePair();
  await saveLoginState(state, { verifier, nonce, returnTo: safeReturnTo(params.get("returnTo")) });

  const res = NextResponse.redirect(
    authorizeUrl({ state, nonce, challenge, loginHint, register: params.get("register") === "1" }),
  );
  // Switching user: end the current app session first.
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (loginHint && sid) {
    await destroySession(sid);
    res.cookies.delete(SESSION_COOKIE);
  }
  return res;
}
