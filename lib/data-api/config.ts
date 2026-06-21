import { getRequestContext } from "@cloudflare/next-on-pages";

type SecretKey = "DATA_API_SECRET";

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

export function getDataApiSecret(): string | undefined {
  return readSecret("DATA_API_SECRET")?.trim() || undefined;
}

export function getDataApiBaseUrl(): string {
  try {
    const { env } = getRequestContext();
    const configured = env.DATA_API_URL ?? stripProxySuffix(env.PROXY_BASE_URL);
    if (configured) {
      return normalizeBaseUrl(configured);
    }
  } catch {
    // Fall back to process.env during local Next.js dev.
  }

  const configured =
    process.env.DATA_API_URL ?? stripProxySuffix(process.env.PROXY_BASE_URL);

  if (!configured) {
    throw new Error(
      "DATA_API_URL or PROXY_BASE_URL is not configured for the Go data API.",
    );
  }

  return normalizeBaseUrl(configured);
}

function stripProxySuffix(value?: string): string | undefined {
  return value?.replace(/\/proxy\/?$/, "");
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
