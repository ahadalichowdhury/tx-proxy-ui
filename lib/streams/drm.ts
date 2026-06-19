/**
 * DRM configuration parsing/encoding for pipe-delimited stream sources.
 * Supports Widevine, PlayReady, ClearKey, Kodi/NS Player aliases, and X-Drm-Config JSON.
 */

import {
  authStringToHeaders,
  headersToAuthString,
  mergeHeaderMaps,
  parseHeaderAssignmentString,
  isStreamHttpUrl,
  type StreamHeaderMap,
} from "@/lib/streams/stream-source";

export type DrmScheme = "widevine" | "playready" | "clearkey";

export type StreamDrmConfig = {
  scheme?: DrmScheme;
  licenseUrl?: string;
  /** ClearKey: kid (normalized UUID) → key (hex) */
  clearKeys?: Record<string, string>;
  pssh?: string;
  licenseHeaders?: StreamHeaderMap;
};

export type ParsedStreamWithDrm = {
  url: string;
  httpHeaders: StreamHeaderMap;
  drm: StreamDrmConfig;
};

const DRM_ALIAS_TO_CANONICAL: Record<string, string> = {
  "x-drm-scheme": "X-Drm-Scheme",
  drmscheme: "X-Drm-Scheme",
  drm_scheme: "X-Drm-Scheme",
  scheme: "X-Drm-Scheme",

  "x-drm-license-url": "X-Drm-License-Url",
  licenseurl: "X-Drm-License-Url",
  license_url: "X-Drm-License-Url",
  licensekey: "X-Drm-License-Url",
  license_key: "X-Drm-License-Url",

  "x-drm-kid": "X-Drm-Kid",
  kid: "X-Drm-Kid",

  "x-drm-key": "X-Drm-Key",
  key: "X-Drm-Key",
  clearkey: "X-Drm-Key",

  "x-drm-keys": "X-Drm-Keys",
  keys: "X-Drm-Keys",

  "x-drm-pssh": "X-Drm-Pssh",
  pssh: "X-Drm-Pssh",

  "x-drm-config": "X-Drm-Config",
  drmconfig: "X-Drm-Config",

  "x-drm-license-headers": "X-Drm-License-Headers",
  licenseheaders: "X-Drm-License-Headers",
};

const DRM_CANONICAL_KEYS = new Set([
  "X-Drm-Scheme",
  "X-Drm-License-Url",
  "X-Drm-Kid",
  "X-Drm-Key",
  "X-Drm-Keys",
  "X-Drm-Pssh",
  "X-Drm-Config",
  "X-Drm-License-Headers",
]);

function normalizeAliasKey(key: string): string {
  const trimmed = key.trim();
  const lower = trimmed.toLowerCase().replace(/-/g, "");
  const underscored = trimmed.toLowerCase();

  if (DRM_ALIAS_TO_CANONICAL[underscored]) {
    return DRM_ALIAS_TO_CANONICAL[underscored];
  }
  if (DRM_ALIAS_TO_CANONICAL[lower]) {
    return DRM_ALIAS_TO_CANONICAL[lower];
  }
  if (DRM_CANONICAL_KEYS.has(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

export function isDrmHeaderKey(key: string): boolean {
  const canonical = normalizeAliasKey(key);
  return DRM_CANONICAL_KEYS.has(canonical);
}

export function normalizeDrmScheme(raw: string | undefined): DrmScheme | undefined {
  if (!raw?.trim()) {
    return undefined;
  }

  const lower = raw.trim().toLowerCase();
  if (lower.includes("widevine") || lower === "wv") {
    return "widevine";
  }
  if (lower.includes("playready") || lower === "pr") {
    return "playready";
  }
  if (lower.includes("clearkey") || lower.includes("clear") || lower === "ck") {
    return "clearkey";
  }
  if (lower === "widevine" || lower === "playready" || lower === "clearkey") {
    return lower as DrmScheme;
  }
  return undefined;
}

export function normalizeKid(raw: string): string {
  const trimmed = raw.trim().replace(/^0x/i, "").replace(/-/g, "").toLowerCase();
  if (trimmed.length !== 32 || !/^[0-9a-f]+$/.test(trimmed)) {
    return raw.trim();
  }
  return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(12, 16)}-${trimmed.slice(16, 20)}-${trimmed.slice(20)}`;
}

/** Shaka ClearKey expects 32-char hex key IDs without UUID dashes. */
export function clearKeyIdForShaka(kid: string): string {
  const normalized = kid.trim().replace(/^0x/i, "").replace(/-/g, "").toLowerCase();
  if (/^[0-9a-f]{32}$/.test(normalized)) {
    return normalized;
  }
  return kid.trim().replace(/-/g, "").toLowerCase();
}

export function clearKeyMaterialForShaka(key: string): string {
  const decoded = decodeKeyMaterial(key);
  return decoded.replace(/[^0-9a-f]/gi, "").toLowerCase();
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeKeyMaterial(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("b64:")) {
    return bytesToHex(base64ToBytes(trimmed.slice(4)));
  }
  if (trimmed.startsWith("hex:")) {
    return trimmed.slice(4).toLowerCase();
  }
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  try {
    return bytesToHex(base64ToBytes(trimmed));
  } catch {
    return trimmed.toLowerCase();
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseClearKeyPairs(raw: string): Record<string, string> {
  const keys: Record<string, string> = {};
  const trimmed = raw.trim();
  if (!trimmed) {
    return keys;
  }

  const segments = trimmed.includes(";")
    ? trimmed.split(";")
    : trimmed.includes(",")
      ? trimmed.split(",")
      : [trimmed];

  for (const segment of segments) {
    const part = segment.trim();
    if (!part) {
      continue;
    }

    const colon = part.indexOf(":");
    const eq = part.indexOf("=");
    let kidRaw: string;
    let keyRaw: string;

    if (colon > 0 && (eq < 0 || colon < eq)) {
      kidRaw = part.slice(0, colon).trim();
      keyRaw = part.slice(colon + 1).trim();
    } else if (eq > 0) {
      kidRaw = part.slice(0, eq).trim();
      keyRaw = part.slice(eq + 1).trim();
    } else {
      continue;
    }

    if (!kidRaw || !keyRaw) {
      continue;
    }

    keys[normalizeKid(kidRaw)] = decodeKeyMaterial(keyRaw);
  }

  return keys;
}

function parseLicenseHeaders(raw: string): StreamHeaderMap {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const headers: StreamHeaderMap = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value.trim()) {
          headers[key] = value.trim();
        }
      }
      return headers;
    } catch {
      return parseHeaderAssignmentString(trimmed.replace(/\|/g, "|"));
    }
  }

  return parseHeaderAssignmentString(trimmed.replace(/;/g, "|"));
}

function parseDrmConfigJson(raw: string): Partial<StreamDrmConfig> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const config: Partial<StreamDrmConfig> = {};

    const scheme = parsed.scheme ?? parsed.drmScheme ?? parsed.type;
    if (typeof scheme === "string") {
      config.scheme = normalizeDrmScheme(scheme);
    }

    const licenseUrl =
      parsed.licenseUrl ?? parsed.license_url ?? parsed.licenseServer ?? parsed.la_url;
    if (typeof licenseUrl === "string" && licenseUrl.trim()) {
      config.licenseUrl = licenseUrl.trim();
    }

    if (typeof parsed.pssh === "string" && parsed.pssh.trim()) {
      config.pssh = parsed.pssh.trim();
    }

    const clearKeys = parsed.clearKeys ?? parsed.keys;
    if (clearKeys && typeof clearKeys === "object" && !Array.isArray(clearKeys)) {
      const mapped: Record<string, string> = {};
      for (const [kid, key] of Object.entries(clearKeys as Record<string, string>)) {
        mapped[normalizeKid(kid)] = decodeKeyMaterial(String(key));
      }
      config.clearKeys = mapped;
    }

    const licenseHeaders = parsed.licenseHeaders ?? parsed.headers;
    if (licenseHeaders && typeof licenseHeaders === "object") {
      const headers: StreamHeaderMap = {};
      for (const [key, value] of Object.entries(licenseHeaders as Record<string, unknown>)) {
        if (typeof value === "string" && value.trim()) {
          headers[key] = value.trim();
        }
      }
      config.licenseHeaders = headers;
    }

    return config;
  } catch {
    return {};
  }
}

/** Parse Kodi ClearKey JSON license_key blobs. */
export function parseKodiClearKeyLicense(raw: string): StreamDrmConfig | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      keys?: Array<{ kid?: string; k?: string; kty?: string }>;
    };

    if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
      return null;
    }

    const clearKeys: Record<string, string> = {};
    for (const entry of parsed.keys) {
      if (!entry.kid || !entry.k) {
        continue;
      }
      const kidBytes = entry.kid.includes("-")
        ? entry.kid
        : bytesToHex(base64ToBytes(entry.kid));
      const keyHex = /^[0-9a-fA-F]+$/.test(entry.k)
        ? entry.k.toLowerCase()
        : bytesToHex(base64ToBytes(entry.k));
      clearKeys[normalizeKid(kidBytes)] = keyHex;
    }

    if (Object.keys(clearKeys).length === 0) {
      return null;
    }

    return { scheme: "clearkey", clearKeys };
  } catch {
    return null;
  }
}

export function parseDrmFromHeaderMap(headers: StreamHeaderMap): StreamDrmConfig {
  const canonical: StreamHeaderMap = {};

  for (const [key, value] of Object.entries(headers)) {
    const mapped = normalizeAliasKey(key);
    if (DRM_CANONICAL_KEYS.has(mapped) && value.trim()) {
      canonical[mapped] = value.trim();
    }
  }

  let config: StreamDrmConfig = {};

  if (canonical["X-Drm-Config"]) {
    config = { ...config, ...parseDrmConfigJson(canonical["X-Drm-Config"]) };
  }

  if (canonical["X-Drm-Scheme"]) {
    config.scheme = normalizeDrmScheme(canonical["X-Drm-Scheme"]) ?? config.scheme;
  }

  if (canonical["X-Drm-License-Url"]) {
    const raw = canonical["X-Drm-License-Url"];
    const clearKeyFromKodi = parseKodiClearKeyLicense(raw);
    if (clearKeyFromKodi) {
      config = mergeDrmConfig(config, clearKeyFromKodi);
    } else if (/^https?:\/\//i.test(raw)) {
      config.licenseUrl = raw;
    } else {
      const pairs = parseClearKeyPairs(raw);
      if (Object.keys(pairs).length > 0) {
        config.clearKeys = { ...config.clearKeys, ...pairs };
        config.scheme = config.scheme ?? "clearkey";
      }
    }
  }

  if (canonical["X-Drm-Kid"] && canonical["X-Drm-Key"]) {
    config.clearKeys = {
      ...config.clearKeys,
      [normalizeKid(canonical["X-Drm-Kid"])]: decodeKeyMaterial(canonical["X-Drm-Key"]),
    };
    config.scheme = config.scheme ?? "clearkey";
  }

  if (canonical["X-Drm-Keys"]) {
    config.clearKeys = {
      ...config.clearKeys,
      ...parseClearKeyPairs(canonical["X-Drm-Keys"]),
    };
    config.scheme = config.scheme ?? "clearkey";
  }

  if (canonical["X-Drm-Pssh"]) {
    config.pssh = canonical["X-Drm-Pssh"];
  }

  if (canonical["X-Drm-License-Headers"]) {
    config.licenseHeaders = mergeHeaderMaps(
      config.licenseHeaders,
      parseLicenseHeaders(canonical["X-Drm-License-Headers"]),
    );
  }

  if (config.clearKeys && Object.keys(config.clearKeys).length > 0 && !config.scheme) {
    config.scheme = "clearkey";
  }

  return config;
}

export function mergeDrmConfig(
  ...configs: Array<Partial<StreamDrmConfig> | null | undefined>
): StreamDrmConfig {
  const merged: StreamDrmConfig = {};

  for (const config of configs) {
    if (!config) {
      continue;
    }
    if (config.scheme) {
      merged.scheme = config.scheme;
    }
    if (config.licenseUrl) {
      merged.licenseUrl = config.licenseUrl;
    }
    if (config.pssh) {
      merged.pssh = config.pssh;
    }
    if (config.clearKeys) {
      merged.clearKeys = { ...merged.clearKeys, ...config.clearKeys };
    }
    if (config.licenseHeaders) {
      merged.licenseHeaders = mergeHeaderMaps(merged.licenseHeaders, config.licenseHeaders);
    }
  }

  return merged;
}

export function splitHttpAndDrmHeaders(headers: StreamHeaderMap): {
  http: StreamHeaderMap;
  drm: StreamDrmConfig;
} {
  const http: StreamHeaderMap = {};
  const drmHeaders: StreamHeaderMap = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!value.trim()) {
      continue;
    }
    if (isDrmHeaderKey(key)) {
      drmHeaders[normalizeAliasKey(key)] = value.trim();
    } else {
      http[key] = value.trim();
    }
  }

  return {
    http,
    drm: parseDrmFromHeaderMap(drmHeaders),
  };
}

export function drmConfigToHeaders(drm: StreamDrmConfig): StreamHeaderMap {
  const headers: StreamHeaderMap = {};

  if (drm.scheme) {
    headers["X-Drm-Scheme"] = drm.scheme;
  }
  if (drm.licenseUrl) {
    headers["X-Drm-License-Url"] = drm.licenseUrl;
  }
  if (drm.pssh) {
    headers["X-Drm-Pssh"] = drm.pssh;
  }
  if (drm.clearKeys && Object.keys(drm.clearKeys).length === 1) {
    const [[kid, key]] = Object.entries(drm.clearKeys);
    headers["X-Drm-Kid"] = kid;
    headers["X-Drm-Key"] = key.startsWith("b64:") ? key : key;
  } else if (drm.clearKeys && Object.keys(drm.clearKeys).length > 1) {
    headers["X-Drm-Keys"] = Object.entries(drm.clearKeys)
      .map(([kid, key]) => `${kid}:${key}`)
      .join(";");
  }
  if (drm.licenseHeaders && Object.keys(drm.licenseHeaders).length > 0) {
    headers["X-Drm-License-Headers"] = Object.entries(drm.licenseHeaders)
      .map(([k, v]) => `${k}:${v}`)
      .join("|");
  }

  return headers;
}

export function encodeStreamSourceWithDrm(
  url: string,
  httpHeaders: StreamHeaderMap,
  drm: StreamDrmConfig,
): string {
  const merged = mergeHeaderMaps(httpHeaders, drmConfigToHeaders(drm));
  const auth = headersToAuthString(merged);
  if (!auth) {
    return url;
  }
  return `${url}|${auth}`;
}

export function hasDrmConfig(drm: StreamDrmConfig): boolean {
  return Boolean(
    drm.scheme ||
      drm.licenseUrl ||
      drm.pssh ||
      (drm.clearKeys && Object.keys(drm.clearKeys).length > 0),
  );
}

export function shakaDrmSystemId(scheme: DrmScheme): string {
  switch (scheme) {
    case "widevine":
      return "com.widevine.alpha";
    case "playready":
      return "com.microsoft.playready";
    case "clearkey":
      return "org.w3.clearkey";
  }
}

export type ShakaDrmConfiguration = {
  servers?: Record<string, string>;
  clearKeys?: Record<string, string>;
  advanced?: Record<string, { serverCertificate?: Uint8Array }>;
};

export function buildShakaDrmConfig(drm: StreamDrmConfig): ShakaDrmConfiguration | null {
  if (!hasDrmConfig(drm)) {
    return null;
  }

  const config: ShakaDrmConfiguration = {};

  if (drm.clearKeys && Object.keys(drm.clearKeys).length > 0) {
    config.clearKeys = {};
    for (const [kid, key] of Object.entries(drm.clearKeys)) {
      config.clearKeys[clearKeyIdForShaka(kid)] = clearKeyMaterialForShaka(key);
    }
  }

  if (
    drm.licenseUrl &&
    isStreamHttpUrl(drm.licenseUrl) &&
    drm.scheme &&
    drm.scheme !== "clearkey"
  ) {
    config.servers = {
      [shakaDrmSystemId(drm.scheme)]: drm.licenseUrl,
    };
  } else if (drm.licenseUrl && isStreamHttpUrl(drm.licenseUrl) && !drm.scheme) {
    config.servers = {
      [shakaDrmSystemId("widevine")]: drm.licenseUrl,
    };
  }

  if (!config.clearKeys && !config.servers) {
    return null;
  }

  return config;
}

export function buildLicenseRequestAuth(
  httpAuth: string,
  drm: StreamDrmConfig,
): string {
  const base = authStringToHeaders(httpAuth);
  const merged = mergeHeaderMaps(base, drm.licenseHeaders ?? {});
  return headersToAuthString(merged);
}
