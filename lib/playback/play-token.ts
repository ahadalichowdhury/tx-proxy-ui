const PLAY_TOKEN_TTL_SECONDS = 4 * 60 * 60;

type PlayTokenPayload = {
  u: string;
  a: string;
  e: number;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function derivePlayTokenKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret.trim()),
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

export async function createPlayToken(
  secret: string,
  targetUrl: string,
  auth: string,
  ttlSeconds = PLAY_TOKEN_TTL_SECONDS,
): Promise<string> {
  const payload: PlayTokenPayload = {
    u: targetUrl.trim(),
    a: auth,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const key = await derivePlayTokenKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return toBase64Url(combined);
}

export async function buildTokenizedProxyUrl(
  secret: string,
  targetUrl: string,
  auth: string,
  proxyBaseUrl: string,
): Promise<string> {
  const token = await createPlayToken(secret, targetUrl, auth);
  const base = proxyBaseUrl.replace(/\/+$/, "");
  return `${base}?t=${encodeURIComponent(token)}`;
}

export { PLAY_TOKEN_TTL_SECONDS };
