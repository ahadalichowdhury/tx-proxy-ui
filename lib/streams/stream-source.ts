/**
 * Encode/decode IPTV stream URLs with pipe-delimited upstream headers.
 * Matches the Go proxy format: url|Header:value|Header2:value2
 */

export type StreamHeaderMap = Record<string, string>;

const VLC_HTTP_HEADER_MAP: Record<string, string> = {
  "http-referrer": "Referer",
  "http-referer": "Referer",
  "http-user-agent": "User-Agent",
  "http-origin": "Origin",
  "http-cookie": "Cookie",
  "http-authorization": "Authorization",
};

const HEADER_QUERY_KEYS: Record<string, string> = {
  referer: "Referer",
  referrer: "Referer",
  "http-referrer": "Referer",
  "http-referer": "Referer",
  "user-agent": "User-Agent",
  useragent: "User-Agent",
  cookie: "Cookie",
  origin: "Origin",
  authorization: "Authorization",
};

export function extractHeaderQueryParams(url: string): {
  url: string;
  headers: StreamHeaderMap;
} {
  try {
    const parsed = new URL(url);
    const headers: StreamHeaderMap = {};
    const toDelete: string[] = [];

    for (const [key, value] of parsed.searchParams.entries()) {
      const mapped = HEADER_QUERY_KEYS[key.toLowerCase()];
      if (mapped && value.trim()) {
        headers[mapped] = value.trim();
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      parsed.searchParams.delete(key);
    }

    return { url: parsed.toString(), headers };
  } catch {
    return { url, headers: {} };
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isStreamHttpUrl(value: string): boolean {
  return isHttpUrl(value);
}

function splitAuthPair(part: string): { key: string; value: string } | null {
  const trimmed = part.trim();
  if (!trimmed) {
    return null;
  }

  const colonIndex = trimmed.indexOf(":");
  const equalsIndex = trimmed.indexOf("=");

  if (colonIndex > 0 && (equalsIndex < 0 || colonIndex < equalsIndex)) {
    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    if (key && value) {
      return { key, value };
    }
  }

  if (equalsIndex > 0) {
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (key && value && !key.includes("://")) {
      return { key, value };
    }
  }

  if (colonIndex > 0) {
    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    if (key && value) {
      return { key, value };
    }
  }

  return null;
}

function headerNameFromToken(token: string): string {
  return token
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

export function parseHeaderAssignmentString(raw: string): StreamHeaderMap {
  const decoded = tryDecodeURIComponent(raw.trim());
  if (!decoded) {
    return {};
  }

  // Stored auth uses pipe-separated headers. Do not split on "&" here or
  // Referer/Cookie values with query params will break apart.
  if (decoded.includes("|") || !decoded.includes("&")) {
    return authStringToHeaders(decoded);
  }

  return parseKodiHeaderAssignmentString(decoded);
}

const KODI_HEADER_SPLIT =
  /&(?=(?:Referer|User-Agent|Cookie|Origin|Authorization|X-[\w-]+)=)/gi;

function parseKodiHeaderAssignmentString(raw: string): StreamHeaderMap {
  const headers: StreamHeaderMap = {};
  const segments: string[] = [];
  let lastIndex = 0;

  for (const match of raw.matchAll(KODI_HEADER_SPLIT)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push(raw.slice(lastIndex, index));
    }
    lastIndex = index + 1;
  }

  if (lastIndex < raw.length) {
    segments.push(raw.slice(lastIndex));
  }

  if (segments.length === 0) {
    segments.push(raw);
  }

  for (const segment of segments) {
    const parsed = splitAuthPair(segment);
    if (!parsed) {
      continue;
    }
    const key = normalizeHeaderName(parsed.key);
    if (key) {
      headers[key] = parsed.value;
    }
  }

  return headers;
}

function tryDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeHeaderName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  if (lower === "referer" || lower === "referrer") {
    return "Referer";
  }
  if (lower === "user-agent" || lower === "useragent") {
    return "User-Agent";
  }
  if (lower === "origin") {
    return "Origin";
  }
  if (lower === "cookie") {
    return "Cookie";
  }
  if (lower === "authorization") {
    return "Authorization";
  }

  if (lower.startsWith("x-")) {
    return headerNameFromToken(lower);
  }

  return headerNameFromToken(trimmed.replace(/_/g, "-"));
}

export function vlcOptToHeaders(key: string, value: string): StreamHeaderMap {
  const lower = key.trim().toLowerCase();
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return {};
  }

  const mapped = VLC_HTTP_HEADER_MAP[lower];
  if (mapped) {
    return { [mapped]: trimmedValue };
  }

  if (lower.startsWith("http-")) {
    const headerName = normalizeHeaderName(lower.slice(5));
    if (headerName) {
      return { [headerName]: trimmedValue };
    }
  }

  return {};
}

export function parseExtVlcOptLine(line: string): StreamHeaderMap | null {
  const match = line.match(/^#EXTVLCOPT:(.+)$/i);
  if (!match?.[1]) {
    return null;
  }

  const option = match[1].trim();
  const separator = option.indexOf("=");
  if (separator <= 0) {
    return null;
  }

  const key = option.slice(0, separator).trim();
  const value = option.slice(separator + 1).trim();
  return vlcOptToHeaders(key, value);
}

export function parseKodiPropLine(line: string): StreamHeaderMap | null {
  const match = line.match(
    /^#KODIPROP:inputstream\.(?:adaptive\.)?(?:stream|manifest)[-_]headers=(.+)$/i,
  );
  if (!match?.[1]) {
    return null;
  }

  const raw = match[1].trim();
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const headers: StreamHeaderMap = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value.trim()) {
          const headerName = normalizeHeaderName(key);
          if (headerName) {
            headers[headerName] = value.trim();
          }
        }
      }
      return headers;
    } catch {
      return parseHeaderAssignmentString(raw);
    }
  }

  return parseHeaderAssignmentString(raw);
}

export function authStringToHeaders(auth: string): StreamHeaderMap {
  const headers: StreamHeaderMap = {};
  if (!auth.trim()) {
    return headers;
  }

  for (const segment of auth.split("|")) {
    const parsed = splitAuthPair(segment);
    if (!parsed) {
      continue;
    }
    const key = normalizeHeaderName(parsed.key);
    if (key) {
      headers[key] = parsed.value;
    }
  }

  return headers;
}

export function mergeHeaderMaps(
  ...maps: Array<StreamHeaderMap | null | undefined>
): StreamHeaderMap {
  const merged: StreamHeaderMap = {};

  for (const map of maps) {
    if (!map) {
      continue;
    }
    for (const [key, value] of Object.entries(map)) {
      if (value.trim()) {
        merged[key] = value.trim();
      }
    }
  }

  return merged;
}

export function headersToAuthString(headers: StreamHeaderMap): string {
  const preferredOrder = [
    "Referer",
    "Origin",
    "User-Agent",
    "Authorization",
    "Cookie",
    "X-Drm-Scheme",
    "X-Drm-License-Url",
    "X-Drm-Kid",
    "X-Drm-Key",
    "X-Drm-Keys",
    "X-Drm-Pssh",
    "X-Drm-License-Headers",
    "X-Drm-Config",
  ];

  const parts: string[] = [];
  const seen = new Set<string>();

  for (const key of preferredOrder) {
    const value = headers[key];
    if (value) {
      parts.push(`${key}:${value}`);
      seen.add(key);
    }
  }

  for (const [key, value] of Object.entries(headers)) {
    if (!seen.has(key) && value.trim()) {
      parts.push(`${key}:${value}`);
    }
  }

  return parts.join("|");
}

export function unwrapEmbeddedStreamUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }

  // cors-everywhere style: https://proxy-host/https://cdn.example/...
  const embedded = trimmed.match(/^https?:\/\/[^/]+\/(https?:\/\/.+)$/i);
  if (embedded?.[1]) {
    return embedded[1];
  }

  return trimmed;
}

export function encodeStreamSource(url: string, headers: StreamHeaderMap): string {
  const auth = headersToAuthString(headers);
  if (!auth) {
    return url;
  }
  return `${url}|${auth}`;
}

export function parseStreamSourceParts(source: string): {
  url: string;
  headers: StreamHeaderMap;
} {
  const trimmed = source.trim();
  if (!trimmed) {
    return { url: "", headers: {} };
  }

  const pipeIndex = trimmed.indexOf("|");
  if (pipeIndex < 0) {
    const { url, headers } = extractHeaderQueryParams(trimmed);
    return {
      url: isHttpUrl(unwrapEmbeddedStreamUrl(url)) ? unwrapEmbeddedStreamUrl(url) : "",
      headers,
    };
  }

  const candidateUrl = trimmed.slice(0, pipeIndex).trim();
  if (!isHttpUrl(candidateUrl)) {
    return { url: "", headers: {} };
  }

  const { url, headers: queryHeaders } = extractHeaderQueryParams(candidateUrl);
  const suffix = trimmed.slice(pipeIndex + 1);

  return {
    url: unwrapEmbeddedStreamUrl(url),
    headers: mergeHeaderMaps(queryHeaders, parseHeaderAssignmentString(suffix)),
  };
}

export function finalizeStreamSource(
  url: string,
  ...headerMaps: Array<StreamHeaderMap | null | undefined>
): string {
  const { url: baseUrl, headers: inlineHeaders } = parseStreamSourceParts(url);
  const merged = mergeHeaderMaps(inlineHeaders, ...headerMaps);
  return encodeStreamSource(baseUrl, merged);
}
