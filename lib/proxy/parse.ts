export type ParsedStreamSource = {
  url: string;
  auth: string;
  httpAuth: string;
  drm: import("@/lib/streams/drm").StreamDrmConfig;
};

export {
  authStringToHeaders,
  encodeStreamSource,
  finalizeStreamSource,
  headersToAuthString,
  mergeHeaderMaps,
  parseHeaderAssignmentString,
  parseStreamSourceParts,
} from "@/lib/streams/stream-source";

export {
  buildLicenseRequestAuth,
  buildShakaDrmConfig,
  drmConfigToHeaders,
  hasDrmConfig,
  mergeDrmConfig,
  parseDrmFromHeaderMap,
  splitHttpAndDrmHeaders,
  type StreamDrmConfig,
} from "@/lib/streams/drm";

import {
  drmConfigToHeaders,
  mergeDrmConfig,
  splitHttpAndDrmHeaders,
  type StreamDrmConfig,
} from "@/lib/streams/drm";
import { parseAdvancedStreamSource } from "@/lib/streams/parse-advanced-stream";
import {
  headersToAuthString,
  mergeHeaderMaps,
  parseStreamSourceParts,
} from "@/lib/streams/stream-source";

function buildParsedSource(
  url: string,
  headers: Record<string, string>,
  drmExtra?: Partial<StreamDrmConfig>,
): ParsedStreamSource {
  const { http, drm: drmFromHeaders } = splitHttpAndDrmHeaders(headers);
  const drm = mergeDrmConfig(drmFromHeaders, drmExtra);
  const storedHeaders = mergeHeaderMaps(http, drmConfigToHeaders(drm));

  return {
    url,
    httpAuth: headersToAuthString(http),
    auth: headersToAuthString(storedHeaders),
    drm,
  };
}

export function parseStreamSourceFull(source: string): ParsedStreamSource {
  const trimmed = source.trim();
  if (!trimmed) {
    return { url: "", auth: "", httpAuth: "", drm: {} };
  }

  const advanced = parseAdvancedStreamSource(trimmed);
  if (
    advanced.url ||
    Object.keys(advanced.headers).length > 0 ||
    Object.keys(advanced.drm).length > 0
  ) {
    const mergedHeaders = mergeHeaderMaps(
      advanced.headers,
      drmConfigToHeaders(advanced.drm),
    );
    return buildParsedSource(advanced.url, mergedHeaders);
  }

  const fallback = parseStreamSourceParts(trimmed);
  return buildParsedSource(fallback.url, fallback.headers);
}

export function parseStreamSource(source: string): ParsedStreamSource {
  return parseStreamSourceFull(source);
}

export function isDashStreamUrl(source: string): boolean {
  const { url } = parseStreamSource(source);
  return url.toLowerCase().includes(".mpd");
}

export function isDrmStreamSource(source: string): boolean {
  const { drm } = parseStreamSourceFull(source);
  return Boolean(
    drm.scheme ||
      drm.licenseUrl ||
      (drm.clearKeys && Object.keys(drm.clearKeys).length > 0),
  );
}
