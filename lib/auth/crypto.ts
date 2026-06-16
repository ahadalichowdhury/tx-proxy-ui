const encoder = new TextEncoder();

export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < aBytes.length; index += 1) {
    mismatch |= aBytes[index] ^ bBytes[index];
  }

  return mismatch === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

async function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature) as BufferSource,
    encoder.encode(payload),
  );
}

type SessionPayload = {
  exp: number;
  v: 1;
};

export async function createSignedSessionToken(
  secret: string,
  maxAgeSeconds = 60 * 60 * 24,
): Promise<string> {
  const payload: SessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadEncoded = toBase64Url(encoder.encode(payloadJson));
  const signature = await signPayload(payloadEncoded, secret);

  return `${payloadEncoded}.${signature}`;
}

export async function verifySignedSessionToken(
  token: string,
  secret: string,
): Promise<boolean> {
  const [payloadEncoded, signature] = token.split(".");

  if (!payloadEncoded || !signature) {
    return false;
  }

  const isValidSignature = await verifySignature(payloadEncoded, signature, secret);

  if (!isValidSignature) {
    return false;
  }

  try {
    const payloadJson = new TextDecoder().decode(fromBase64Url(payloadEncoded));
    const payload = JSON.parse(payloadJson) as SessionPayload;

    if (payload.v !== 1 || typeof payload.exp !== "number") {
      return false;
    }

    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function verifyAdminPassword(
  submittedPassword: string,
  configuredPassword: string,
): boolean {
  return timingSafeEqual(submittedPassword, configuredPassword);
}
