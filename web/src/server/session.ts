import { refreshTokens, randomToken, type TokenSet } from "./oidc";
import { redis } from "./redis";

// Server-side sessions in Redis. The browser holds only a random session ID in
// an httpOnly cookie; tokens never reach client JavaScript.

export const SESSION_COOKIE = "stc_sid";
const REFRESH_MARGIN_MS = 30_000;

interface SessionData {
  sub: string;
  tokens: TokenSet;
}

interface LoginState {
  verifier: string;
  nonce: string;
  returnTo: string;
}

const key = (id: string) => `session:${id}`;
const ttlSeconds = (tokens: TokenSet) => Math.max(60, Math.floor((tokens.refreshExpiresAt - Date.now()) / 1000));

export async function createSession(data: SessionData): Promise<string> {
  const id = randomToken(32);
  await (await redis()).set(key(id), JSON.stringify(data), { expiration: { type: "EX", value: ttlSeconds(data.tokens) } });
  return id;
}

async function readSession(id: string): Promise<SessionData | null> {
  const raw = await (await redis()).get(key(id));
  return raw ? (JSON.parse(raw) as SessionData) : null;
}

export async function destroySession(id: string): Promise<SessionData | null> {
  const client = await redis();
  const raw = await client.getDel(key(id));
  return raw ? (JSON.parse(raw) as SessionData) : null;
}

/**
 * A valid access token for the session, refreshing it when it is about to
 * expire. Returns null when the session is gone or can't be refreshed.
 */
export async function accessTokenFor(id: string): Promise<string | null> {
  const session = await readSession(id);
  if (!session) return null;
  if (session.tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return session.tokens.accessToken;
  if (session.tokens.refreshExpiresAt <= Date.now()) {
    await destroySession(id);
    return null;
  }
  try {
    const tokens = await refreshTokens(session.tokens);
    await (await redis()).set(key(id), JSON.stringify({ ...session, tokens }), { expiration: { type: "EX", value: ttlSeconds(tokens) } });
    return tokens.accessToken;
  } catch (err) {
    console.warn("Token refresh failed; ending session", err);
    await destroySession(id);
    return null;
  }
}

export async function saveLoginState(state: string, data: LoginState): Promise<void> {
  await (await redis()).set(`oidc:${state}`, JSON.stringify(data), { expiration: { type: "EX", value: 600 } });
}

export async function takeLoginState(state: string): Promise<LoginState | null> {
  const raw = await (await redis()).getDel(`oidc:${state}`);
  return raw ? (JSON.parse(raw) as LoginState) : null;
}

/** Only same-site relative paths, so the login flow can't be used as an open redirect. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/home";
  return value;
}
