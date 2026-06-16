import { parseStreamSource } from "@/lib/proxy/parse";

const VOLATILE_QUERY_KEYS = new Set([
  "md5",
  "expires",
  "expire",
  "token",
  "e",
  "t",
  "sig",
  "signature",
  "auth",
  "st",
  "stime",
  "ts",
  "nonce",
  "hash",
]);

export function stableStreamBase(storedUrl: string): string {
  const { url } = parseStreamSource(storedUrl.trim());

  try {
    const parsed = new URL(url);

    for (const key of [...parsed.searchParams.keys()]) {
      if (VOLATILE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }

    const search = parsed.searchParams.toString();
    return `${parsed.origin}${parsed.pathname}${search ? `?${search}` : ""}`;
  } catch {
    return url;
  }
}
