// Browser side of passkeys: turns the server's WebAuthn options (JSON, base64url)
// into what navigator.credentials expects, and the resulting credential back into JSON.

function fromB64url(value: string): ArrayBuffer {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

function toB64url(buffer: ArrayBuffer | null): string | null {
  if (!buffer) return null;
  let s = "";
  new Uint8Array(buffer).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Json = Record<string, unknown>;

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined" && !!navigator.credentials;
}

/** Creates a passkey from registration options; returns the credential as JSON for the server. */
export async function createPasskey(publicKey: Json): Promise<Json> {
  const options = {
    ...publicKey,
    challenge: fromB64url(publicKey.challenge as string),
    user: { ...(publicKey.user as Json), id: fromB64url((publicKey.user as Json).id as string) },
    excludeCredentials: ((publicKey.excludeCredentials as Json[]) ?? []).map((c) => ({ ...c, id: fromB64url(c.id as string) })),
  } as unknown as PublicKeyCredentialCreationOptions;
  const cred = (await navigator.credentials.create({ publicKey: options })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was created.");
  const res = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64url(res.clientDataJSON),
      attestationObject: toB64url(res.attestationObject),
      transports: typeof res.getTransports === "function" ? res.getTransports() : [],
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

/** Signs a challenge with an existing passkey; returns the assertion as JSON for the server. */
export async function signWithPasskey(publicKey: Json): Promise<Json> {
  const options = {
    ...publicKey,
    challenge: fromB64url(publicKey.challenge as string),
    allowCredentials: ((publicKey.allowCredentials as Json[]) ?? []).map((c) => ({ ...c, id: fromB64url(c.id as string) })),
  } as unknown as PublicKeyCredentialRequestOptions;
  const cred = (await navigator.credentials.get({ publicKey: options })) as PublicKeyCredential | null;
  if (!cred) throw new Error("The passkey didn't sign.");
  const res = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64url(res.clientDataJSON),
      authenticatorData: toB64url(res.authenticatorData),
      signature: toB64url(res.signature),
      userHandle: toB64url(res.userHandle),
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

/** A sentence for the person when the browser refuses or they cancel. */
export function passkeyErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError") return "The passkey prompt was cancelled or timed out. Try again.";
  if (name === "InvalidStateError") return "This device already has a passkey for your account.";
  if (name === "SecurityError") return "Passkeys only work on the app's own address (http://localhost:3000 in the sandbox).";
  return (err as Error)?.message || "The passkey didn't work. Try again.";
}

/** A default passkey name, so a shopper with several can tell them apart ("Edge on Windows"). */
export function deviceName(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "this device";
  return `${browser} on ${os}`;
}
