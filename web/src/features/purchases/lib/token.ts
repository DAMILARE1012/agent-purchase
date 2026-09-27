const TOKEN_PATTERN = /MG1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

/**
 * Finds a purchase-receipt token in anything a user might give us: the full
 * receipt link (token in the URL fragment), the raw token, or text around it.
 */
export function extractToken(text: string): string | null {
  let input = text;
  try {
    input = decodeURIComponent(text);
  } catch {
    // Not URI-encoded; use as is.
  }
  return input.match(TOKEN_PATTERN)?.[0] ?? null;
}

/** The link printed in a receipt's QR code. The token sits in the fragment, so it never reaches server logs. */
export function receiptLink(origin: string, token: string): string {
  return `${origin}/verify#${token}`;
}
