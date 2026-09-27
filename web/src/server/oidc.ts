import { createHash, randomBytes } from "node:crypto";
import { serverConfig } from "./config";

// OpenID Connect authorization code flow with PKCE, against Keycloak.
// The web server is a confidential client: it holds the client secret and the
// user's tokens; the browser only ever gets an opaque session cookie.

const { oidc, appUrl } = serverConfig;
const REDIRECT_URI = `${appUrl}/auth/callback`;

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  /** Epoch ms. */
  expiresAt: number;
  refreshExpiresAt: number;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(32);
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizeUrl(p: { state: string; nonce: string; challenge: string; loginHint?: string; register?: boolean }): string {
  const endpoint = p.register ? "registrations" : "auth";
  const url = new URL(`${oidc.browserBaseUrl}/protocol/openid-connect/${endpoint}`);
  url.search = new URLSearchParams({
    client_id: oidc.clientId,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: REDIRECT_URI,
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    ...(p.loginHint ? { login_hint: p.loginHint, prompt: "login" } : {}),
  }).toString();
  return url.toString();
}

export function logoutUrl(idToken: string | undefined, returnTo = "/"): string {
  const url = new URL(`${oidc.browserBaseUrl}/protocol/openid-connect/logout`);
  url.search = new URLSearchParams({
    client_id: oidc.clientId,
    post_logout_redirect_uri: `${appUrl}${returnTo}`,
    ...(idToken ? { id_token_hint: idToken } : {}),
  }).toString();
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  refresh_expires_in: number;
}

async function tokenRequest(params: Record<string, string>, previousIdToken = ""): Promise<TokenSet> {
  const res = await fetch(`${oidc.internalBaseUrl}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: oidc.clientId, client_secret: oidc.clientSecret, ...params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Token endpoint returned ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as TokenResponse;
  const now = Date.now();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    idToken: body.id_token ?? previousIdToken,
    expiresAt: now + body.expires_in * 1000,
    // Keycloak reports 0 for offline tokens; treat that as "use the SSO max".
    refreshExpiresAt: now + (body.refresh_expires_in || 36_000) * 1000,
  };
}

export function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
}

export function refreshTokens(tokens: TokenSet): Promise<TokenSet> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }, tokens.idToken);
}

/**
 * Reads the ID token's claims. The token came straight from Keycloak's token
 * endpoint over a direct server-to-server call we initiated, so OIDC Core
 * §3.1.3.7 allows using it without re-verifying the signature. The API still
 * fully verifies every access token it receives.
 */
export function idTokenClaims(idToken: string): Record<string, unknown> {
  const [, payload] = idToken.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

export function validateIdToken(idToken: string, expectedNonce: string): { sub: string } {
  const claims = idTokenClaims(idToken);
  const aud = claims.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (claims.iss !== oidc.browserBaseUrl) throw new Error("ID token issuer mismatch");
  if (!audiences.includes(oidc.clientId)) throw new Error("ID token audience mismatch");
  if (claims.nonce !== expectedNonce) throw new Error("ID token nonce mismatch");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) throw new Error("ID token expired");
  return { sub: String(claims.sub) };
}
