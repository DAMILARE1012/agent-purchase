const TOKEN_PATTERN = /RCPT1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

/**
 * Finds a receipt token in anything a user might give us: the full receipt
 * link (token in the URL fragment), the raw token, or text copied around it.
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
