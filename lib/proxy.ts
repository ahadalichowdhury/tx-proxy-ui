import { parseStreamSource } from "@/lib/proxy/parse";
import { isStreamHttpUrl } from "@/lib/streams/stream-source";

export { parseStreamSource } from "@/lib/proxy/parse";

export function toProxyMediaUrl(
  mediaUrl: string,
  proxyBaseUrl: string,
  streamAuth?: string,
): string {
  if (!isStreamHttpUrl(mediaUrl)) {
    return mediaUrl;
  }

  const base = proxyBaseUrl.replace(/\/+$/, "");
  let result = `${base}?url=${encodeURIComponent(mediaUrl)}`;
  if (streamAuth) {
    result += `&auth=${encodeURIComponent(streamAuth)}`;
  }
  return result;
}

export function toProxyStreamUrl(rawUrl: string, proxyBaseUrl: string): string {
  const { url, httpAuth } = parseStreamSource(rawUrl);
  return toProxyMediaUrl(url, proxyBaseUrl, httpAuth);
}

/** Resolve relative DASH/HLS media URLs against the upstream manifest URL. */
export function resolveStreamMediaUri(uri: string, manifestUrl: string): string {
  const trimmed = uri.trim();
  if (!trimmed) {
    return uri;
  }

  if (shouldRouteThroughProxy(trimmed)) {
    return trimmed;
  }

  try {
    return new URL(trimmed, manifestUrl).href;
  } catch {
    return uri;
  }
}

export function normalizeProxyBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/proxy")) {
    return trimmed;
  }
  return `${trimmed}/proxy`;
}

/** Shaka ClearKey and browser EME use data:/blob: license URIs — never proxy those. */
export function shouldRouteThroughProxy(uri: string): boolean {
  const trimmed = uri.trim();
  if (!trimmed) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("javascript:")
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
