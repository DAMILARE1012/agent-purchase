// Sign-in and sign-up are route handlers that redirect to Keycloak, so the
// landing page links to them with plain <a> tags (full page loads).
export const SIGN_UP_HREF = "/auth/login?register=1&returnTo=/wallet";
export const SIGN_IN_HREF = "/auth/login?returnTo=/wallet";
export const VERIFY_HREF = "/r";
