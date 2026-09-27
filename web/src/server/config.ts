/**
 * Server-side configuration, read at runtime (never bundled for the browser).
 *
 * Keycloak has two addresses: the one browsers use (redirects) and the one the
 * web server uses inside the Docker network (token exchange). Tokens are
 * always issued for the browser address.
 */
export const serverConfig = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  apiInternalUrl: process.env.API_INTERNAL_URL ?? "http://localhost:8000",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  oidc: {
    browserBaseUrl: process.env.OIDC_BROWSER_BASE_URL ?? "http://localhost:8080/realms/scan-to-confirm",
    internalBaseUrl: process.env.OIDC_INTERNAL_BASE_URL ?? "http://localhost:8080/realms/scan-to-confirm",
    clientId: process.env.OIDC_CLIENT_ID ?? "scan-web",
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? "",
  },
};

export const secureCookies = serverConfig.appUrl.startsWith("https://");
