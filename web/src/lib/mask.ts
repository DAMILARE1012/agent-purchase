/** "Sam Carter" → "S•• C•••••": enough to tell people apart in support views, not to identify them. */
export function maskName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0] + "•".repeat(Math.max(1, w.length - 1)))
    .join(" ");
}
