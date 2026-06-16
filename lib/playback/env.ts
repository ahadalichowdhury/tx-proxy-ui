import { getRequestContext } from "@cloudflare/next-on-pages";

type SecretKey = "PROXY_TOKEN_SECRET";

function readSecret(key: SecretKey): string | undefined {
  try {
    const { env } = getRequestContext();
    const fromCloudflare = env[key];
    if (fromCloudflare) {
      return fromCloudflare;
    }
  } catch {
    // Fall back to process.env during local Next.js dev.
  }

  return process.env[key];
}

export function getProxyTokenSecret(): string | undefined {
  const secret = readSecret("PROXY_TOKEN_SECRET")?.trim();
  if (!secret || secret.length < 32) {
    return undefined;
  }
  return secret;
}

export function isPlayTokenEnabled(): boolean {
  return Boolean(getProxyTokenSecret());
}
