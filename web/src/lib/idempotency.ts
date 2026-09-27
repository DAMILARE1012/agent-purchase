/** A fresh idempotency key for one user action (one form submission). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
