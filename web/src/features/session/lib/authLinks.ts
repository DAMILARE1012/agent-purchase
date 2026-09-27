/** The current page, including the #fragment (receipt links keep their token there). */
function currentLocation(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

export function signIn(options: { loginHint?: string; returnTo?: string; register?: boolean } = {}): void {
  const params = new URLSearchParams({ returnTo: options.returnTo ?? currentLocation() });
  if (options.loginHint) params.set("login_hint", options.loginHint);
  if (options.register) params.set("register", "1");
  // /auth/login is a route handler that redirects to Keycloak, so it needs a full page load.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/auth/login?${params}`);
}
