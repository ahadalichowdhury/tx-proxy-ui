/**
 * NS Player / IPTV-style stream line parsing.
 * Handles inline headers in URLs, pipe/Kodi/semicolon/comma/quoted suffixes,
 * and header-like query params embedded in the stream URL.
 */

import {
  drmConfigToHeaders,
  mergeDrmConfig,
  normalizeDrmScheme,
  parseClearKeyPairs,
  parseKodiClearKeyLicense,
  splitHttpAndDrmHeaders,
  type StreamDrmConfig,
} from "@/lib/streams/drm";
import {
  extractHeaderQueryParams,
  mergeHeaderMaps,
  normalizeHeaderName,
  parseHeaderAssignmentString,
  unwrapEmbeddedStreamUrl,
  type StreamHeaderMap,
} from "@/lib/streams/stream-source";

export type { StreamDrmConfig as DrmMetadata };

export type ParsedAdvancedStream = {
  url: string;
  headers: StreamHeaderMap;
  drm: StreamDrmConfig;
};

const KODI_SUFFIX_SPLIT =
  /&(?=(?:Referer|Referrer|User-Agent|UserAgent|Cookie|Origin|Authorization|DrmScheme|LicenseUrl|LicenseKey|Kid|Key|X-[\w-]+)=)/gi;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

  return null;
}

function parseSemicolonSuffix(raw: string): StreamHeaderMap {
  const headers: StreamHeaderMap = {};

  for (const segment of raw.split(";")) {
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

function parseCommaSuffix(raw: string): StreamHeaderMap {
  const headers: StreamHeaderMap = {};
  const segments = raw.split(",");

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

function parseQuotedHeaderSuffix(raw: string): StreamHeaderMap {
  const headers: StreamHeaderMap = {};
  const pattern =
    /(?:^|\s)(["']?)(Referer|Referrer|User-Agent|UserAgent|Cookie|Origin|Authorization|X-[\w-]+)\1\s*[:=]\s*(["']?)([\s\S]*?)\3(?=\s+(?:Referer|Referrer|User-Agent|UserAgent|Cookie|Origin|Authorization|X-[\w-]+)\s*[:=]|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const key = normalizeHeaderName(match[2] ?? "");
    const value = (match[4] ?? "").trim();
    if (key && value) {
      headers[key] = value;
    }
  }

  if (Object.keys(headers).length > 0) {
    return headers;
  }

  const simplePattern =
    /(?:^|\s)(Referer|Referrer|User-Agent|UserAgent|Cookie|Origin|Authorization|X-[\w-]+)\s*[:=]\s*(\S+)/gi;

  while ((match = simplePattern.exec(raw)) !== null) {
    const key = normalizeHeaderName(match[1] ?? "");
    const value = (match[2] ?? "").trim();
    if (key && value) {
      headers[key] = value;
    }
  }

  return headers;
}

function parseJsonHeaderSuffix(raw: string): StreamHeaderMap {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
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
    return {};
  }
}

function parseKodiAmpersandSuffix(raw: string): StreamHeaderMap {
  const headers: StreamHeaderMap = {};
  const segments: string[] = [];
  let lastIndex = 0;

  for (const match of raw.matchAll(KODI_SUFFIX_SPLIT)) {
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

function parseTrailingHeaders(remainder: string): StreamHeaderMap {
  const trimmed = remainder.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith("|")) {
    return parseHeaderAssignmentString(trimmed.slice(1));
  }

  if (trimmed.startsWith("{")) {
    return parseJsonHeaderSuffix(trimmed);
  }

  if (/^["']/.test(trimmed) || /\bReferer\s*[:=]/i.test(trimmed)) {
    const quoted = parseQuotedHeaderSuffix(trimmed);
    if (Object.keys(quoted).length > 0) {
      return quoted;
    }
  }

  if (trimmed.startsWith(";")) {
    return parseSemicolonSuffix(trimmed.slice(1));
  }

  if (/^[,]/.test(trimmed) || /^Referer=|^User-Agent=|^Cookie=/i.test(trimmed)) {
    const commaBody = trimmed.startsWith(",") ? trimmed.slice(1) : trimmed;
    const commaHeaders = parseCommaSuffix(commaBody);
    if (Object.keys(commaHeaders).length > 0) {
      return commaHeaders;
    }
  }

  if (trimmed.includes("|")) {
    return parseHeaderAssignmentString(trimmed);
  }

  if (trimmed.includes("&") && /(?:Referer|User-Agent|Cookie|Origin)=/i.test(trimmed)) {
    return parseKodiAmpersandSuffix(trimmed);
  }

  if (/^(Referer|Referrer|User-Agent|UserAgent|Cookie|Origin|Authorization|X-[\w-]+)\s*[:=]/i.test(trimmed)) {
    return parseQuotedHeaderSuffix(trimmed);
  }

  const assignment = splitAuthPair(trimmed);
  if (assignment) {
    const key = normalizeHeaderName(assignment.key);
    if (key) {
      return { [key]: assignment.value };
    }
  }

  return {};
}

function extractLeadingUrl(line: string): { url: string; remainder: string } | null {
  const trimmed = line.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const pipeIndex = trimmed.indexOf("|");
  if (pipeIndex > 0) {
    const candidate = trimmed.slice(0, pipeIndex).trim();
    if (isHttpUrl(candidate)) {
      return { url: candidate, remainder: trimmed.slice(pipeIndex) };
    }
  }

  const semicolonMatch = trimmed.match(/^(https?:\/\/[^\s;]+);(.*)$/i);
  if (semicolonMatch?.[1] && isHttpUrl(semicolonMatch[1])) {
    return {
      url: semicolonMatch[1],
      remainder: `;${semicolonMatch[2] ?? ""}`,
    };
  }

  const commaMatch = trimmed.match(/^(https?:\/\/[^\s,]+),(.*)$/i);
  if (
    commaMatch?.[1] &&
    isHttpUrl(commaMatch[1]) &&
    /^(Referer|Referrer|User-Agent|UserAgent|Cookie|Origin)=/i.test(commaMatch[2] ?? "")
  ) {
    return {
      url: commaMatch[1],
      remainder: `,${commaMatch[2] ?? ""}`,
    };
  }

  const spaceMatch = trimmed.match(/^(https?:\/\/[^\s"']+)\s+(.+)$/i);
  if (spaceMatch?.[1] && isHttpUrl(spaceMatch[1])) {
    return { url: spaceMatch[1], remainder: spaceMatch[2] ?? "" };
  }

  const bareMatch = trimmed.match(/^(https?:\/\/[^\s|,;"']+)/i);
  if (bareMatch?.[1] && isHttpUrl(bareMatch[1])) {
    return {
      url: bareMatch[1].replace(/[,\)]+$/, ""),
      remainder: trimmed.slice(bareMatch[1].length).trim(),
    };
  }

  return null;
}

export function parseExtHttpLine(line: string): StreamHeaderMap | null {
  const match = line.match(/^#EXTHTTP:(.+)$/i);
  if (!match?.[1]) {
    return null;
  }

  const raw = match[1].trim();
  if (raw.startsWith("{")) {
    return parseJsonHeaderSuffix(raw);
  }

  return parseHeaderAssignmentString(raw);
}

export function parseKodiLicenseLine(line: string): StreamDrmConfig | null {
  const licenseKeyMatch = line.match(
    /^#?KODIPROP:inputstream\.adaptive\.license_key=(.+)$/i,
  );
  if (licenseKeyMatch?.[1]?.trim()) {
    const raw = licenseKeyMatch[1].trim();
    const clearKey = parseKodiClearKeyLicense(raw);
    if (clearKey) {
      return clearKey;
    }
    if (/^https?:\/\//i.test(raw)) {
      return { licenseUrl: raw };
    }
    const pairs = parseClearKeyPairs(raw);
    if (Object.keys(pairs).length > 0) {
      return { scheme: "clearkey", clearKeys: pairs };
    }
    return null;
  }

  const licenseTypeMatch = line.match(
    /^#?KODIPROP:inputstream\.adaptive\.license_type=(.+)$/i,
  );
  if (licenseTypeMatch?.[1]?.trim()) {
    return { scheme: normalizeDrmScheme(licenseTypeMatch[1].trim()) };
  }

  const manifestTypeMatch = line.match(
    /^#?KODIPROP:inputstream\.adaptive\.manifest_type=(.+)$/i,
  );
  if (manifestTypeMatch?.[1]?.trim()) {
    return {};
  }

  return null;
}

export function drmToHeaders(drm: StreamDrmConfig): StreamHeaderMap {
  return drmConfigToHeaders(drm);
}

function finalizeParsedStream(
  url: string,
  rawHeaders: StreamHeaderMap,
  extraDrm: StreamDrmConfig = {},
): ParsedAdvancedStream {
  const { http, drm } = splitHttpAndDrmHeaders(rawHeaders);
  return {
    url: unwrapEmbeddedStreamUrl(url),
    headers: http,
    drm: mergeDrmConfig(drm, extraDrm),
  };
}

export function parseAdvancedStreamLine(raw: string): ParsedAdvancedStream | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const extracted = extractLeadingUrl(trimmed);
  if (!extracted) {
    return null;
  }

  const { url: queryStripped, headers: queryHeaders } = extractHeaderQueryParams(
    extracted.url,
  );
  const trailingHeaders = parseTrailingHeaders(extracted.remainder);

  return finalizeParsedStream(
    queryStripped,
    mergeHeaderMaps(queryHeaders, trailingHeaders),
  );
}

export function parseAdvancedStreamSource(source: string): ParsedAdvancedStream {
  const trimmed = source.trim();
  if (!trimmed) {
    return { url: "", headers: {}, drm: {} };
  }

  const parsed = parseAdvancedStreamLine(trimmed);
  if (parsed) {
    return parsed;
  }

  const pipeIndex = trimmed.indexOf("|");
  if (pipeIndex > 0) {
    const candidateUrl = trimmed.slice(0, pipeIndex).trim();
    if (isHttpUrl(candidateUrl)) {
      const { url, headers: queryHeaders } = extractHeaderQueryParams(candidateUrl);
      return finalizeParsedStream(
        url,
        mergeHeaderMaps(
          queryHeaders,
          parseHeaderAssignmentString(trimmed.slice(pipeIndex + 1)),
        ),
      );
    }
  }

  if (isHttpUrl(trimmed)) {
    const { url, headers } = extractHeaderQueryParams(trimmed);
    return finalizeParsedStream(url, headers);
  }

  return { url: trimmed, headers: {}, drm: {} };
}
