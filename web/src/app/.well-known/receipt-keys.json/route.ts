import { serverConfig } from "@/server/config";

/** Public receipt-signing keys (JWKS), served from the API. */
export async function GET() {
  const upstream = await fetch(`${serverConfig.apiInternalUrl}/.well-known/receipt-keys.json`, { cache: "no-store" });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
