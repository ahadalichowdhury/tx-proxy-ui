import "server-only";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { normalizeProxyBaseUrl } from "@/lib/proxy";

const DEFAULT_PROXY_BASE_URL = "http://127.0.0.1:8080/proxy";

function readProxyBaseUrlFromEnv(): string | undefined {
  try {
    const { env } = getRequestContext();
    const fromCloudflare = env.PROXY_BASE_URL ?? env.NEXT_PUBLIC_PROXY_BASE_URL;
    if (fromCloudflare) {
      return fromCloudflare;
    }
  } catch {
    // Fall back to process.env during local Next.js dev.
  }

  return process.env.PROXY_BASE_URL ?? process.env.NEXT_PUBLIC_PROXY_BASE_URL;
}

function isValidProxyBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(normalizeProxyBaseUrl(value));
    return parsed.hostname.length > 0 && parsed.hostname !== "proxy";
  } catch {
    return false;
  }
}

export function getProxyBaseUrl(): string {
  const configured = readProxyBaseUrlFromEnv()?.trim();
  if (!configured || !isValidProxyBaseUrl(configured)) {
    return DEFAULT_PROXY_BASE_URL;
  }
  return normalizeProxyBaseUrl(configured);
}
