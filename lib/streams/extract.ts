import { parseStreamSource } from "@/lib/proxy/parse";
import {
  buildChannelKey,
  inferLinkLabel,
  type StreamLinkVariant,
} from "@/lib/streams/channel-metadata";
import {
  drmConfigToHeaders,
  mergeDrmConfig,
  type StreamDrmConfig,
} from "@/lib/streams/drm";
import {
  parseAdvancedStreamLine,
  parseExtHttpLine,
  parseKodiLicenseLine,
} from "@/lib/streams/parse-advanced-stream";
import {
  finalizeStreamSource,
  mergeHeaderMaps,
  parseExtVlcOptLine,
  parseKodiPropLine,
  unwrapEmbeddedStreamUrl,
  type StreamHeaderMap,
} from "@/lib/streams/stream-source";

export type ExtractedChannel = {
  title: string;
  url: string;
  groupTitle?: string;
  logo?: string;
  channelKey: string;
  links: StreamLinkVariant[];
};

export type SourceInput = {
  sourceUrl?: string;
  sourceText?: string;
  sourceFile?: File | null;
  baseUrl?: string;
  defaultTitle?: string;
};

const PLAYLIST_EXTENSIONS = [".m3u", ".m3u8", ".txt"];
const MANIFEST_EXTENSIONS = [".mpd"];
const DIRECT_STREAM_EXTENSIONS = [
  ".m3u8",
  ".mpd",
  ".mp4",
  ".ts",
  ".m4s",
  ".ism",
  ".isml",
];

export async function extractChannelsFromSource(
  input: SourceInput,
): Promise<ExtractedChannel[]> {
  const { content, baseUrl, sourceKind } = await resolveSourceContent(input);

  if (!content.trim()) {
    throw new Error("Source is empty. Provide a URL, upload a file, or paste content.");
  }

  const extracted = extractFromContent(
    content,
    baseUrl,
    sourceKind,
    input.defaultTitle,
    input.sourceUrl,
  );

  if (extracted.length === 0) {
    throw new Error(
      "No playable streams found. Check the source format or provide a base URL for relative links.",
    );
  }

  return dedupeChannels(extracted);
}

type SourceKind = "playlist" | "mpd" | "direct-url" | "unknown";

async function resolveSourceContent(input: SourceInput): Promise<{
  content: string;
  baseUrl: string;
  sourceKind: SourceKind;
}> {
  if (input.sourceFile && input.sourceFile.size > 0) {
    const content = (await input.sourceFile.text()).replace(/^\uFEFF/, "");
    const fileName = input.sourceFile.name.toLowerCase();
    const baseUrl = normalizeBaseUrl(input.baseUrl ?? input.sourceUrl ?? "");

    return {
      content,
      baseUrl,
      sourceKind: detectSourceKind(content, fileName, baseUrl),
    };
  }

  if (input.sourceText?.trim()) {
    const content = input.sourceText.trim().replace(/^\uFEFF/, "");
    const baseUrl = normalizeBaseUrl(input.baseUrl ?? guessBaseUrlFromContent(content));

    return {
      content,
      baseUrl,
      sourceKind: detectSourceKind(content, undefined, baseUrl),
    };
  }

  if (input.sourceUrl?.trim()) {
    const normalizedUrl = normalizeRemoteUrl(input.sourceUrl.trim());
    const baseUrl = normalizeBaseUrl(input.baseUrl ?? normalizedUrl);

    if (shouldTreatUrlAsDirectStream(normalizedUrl)) {
      return {
        content: normalizedUrl,
        baseUrl,
        sourceKind: "direct-url",
      };
    }

    const { content } = await fetchRemoteSource(normalizedUrl);

    if (isMasterHLSPlaylist(content)) {
      return {
        content: normalizedUrl,
        baseUrl,
        sourceKind: "direct-url",
      };
    }

    return {
      content,
      baseUrl,
      sourceKind: detectSourceKind(content, getPathFromUrl(normalizedUrl), baseUrl),
    };
  }

  throw new Error("Provide a source URL, upload a file, or paste playlist content.");
}

function extractFromContent(
  content: string,
  baseUrl: string,
  sourceKind: SourceKind,
  defaultTitle?: string,
  sourceUrl?: string,
): ExtractedChannel[] {
  const trimmed = content.trim();

  if (sourceKind === "direct-url" && isHttpUrl(trimmed)) {
    const advanced = parseAdvancedStreamLine(trimmed);
    const resolvedUrl = advanced?.url ?? trimmed;
    const url = advanced
      ? finalizeStreamSource(
          resolvedUrl,
          advanced.headers,
          drmConfigToHeaders(advanced.drm),
        )
      : trimmed;
    const title = defaultTitle?.trim() || titleFromUrl(resolvedUrl);

    return [toSingleExtractedChannel(title, url)];
  }

  if (sourceKind === "mpd" || looksLikeMpd(trimmed)) {
    const manifestUrl = resolveManifestUrl(sourceUrl, baseUrl) ?? streamUrlCandidate(trimmed);
    if (!isHttpUrl(manifestUrl)) {
      throw new Error(
        "DASH (.mpd) URL required. Provide the manifest URL in the Source URL field.",
      );
    }

    const title = defaultTitle?.trim() || titleFromUrl(manifestUrl);
    const url = trimmed.includes(".mpd") ? trimmed : manifestUrl;

    return [toSingleExtractedChannel(title, url)];
  }

  if (
    (sourceKind === "playlist" || looksLikePlaylist(trimmed)) &&
    isMasterHLSPlaylist(trimmed)
  ) {
    const manifestUrl = resolveManifestUrl(sourceUrl, baseUrl);
    if (!manifestUrl) {
      throw new Error(
        "Master HLS playlist detected. Provide the manifest URL in the Source URL field.",
      );
    }

    const title = defaultTitle?.trim() || titleFromUrl(manifestUrl);

    return [toSingleExtractedChannel(title, manifestUrl)];
  }

  if (sourceKind === "playlist" || looksLikePlaylist(trimmed)) {
    return parsePlaylist(trimmed, baseUrl, defaultTitle);
  }

  if (isHttpUrl(trimmed)) {
    const title = defaultTitle?.trim() || titleFromUrl(trimmed);
    return [toSingleExtractedChannel(title, trimmed)];
  }

  const urls = extractHttpUrls(trimmed);

  if (urls.length > 0) {
    return urls.map((url, index) => {
      const title =
        defaultTitle?.trim() || titleFromUrl(url) || `Channel ${index + 1}`;
      return toSingleExtractedChannel(title, url);
    });
  }

  return [];
}

type PendingStreamHeaders = StreamHeaderMap;
type PendingStreamDrm = StreamDrmConfig;

function resolveStreamUrl(
  value: string,
  baseUrl: string,
  pendingHeaders: PendingStreamHeaders = {},
  pendingDrm: PendingStreamDrm = {},
): string | null {
  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const advanced = parseAdvancedStreamLine(trimmed);
  const urlPart = advanced?.url ?? parseStreamSource(trimmed).url;
  const inlineHeaders = advanced?.headers ?? {};
  const inlineDrm = advanced?.drm ?? {};

  const urlToResolve = urlPart || trimmed;

  let resolvedUrl: string;
  if (isHttpUrl(urlToResolve)) {
    resolvedUrl = unwrapEmbeddedStreamUrl(urlToResolve);
  } else if (baseUrl) {
    try {
      resolvedUrl = new URL(urlToResolve, baseUrl).toString();
    } catch {
      return null;
    }
  } else {
    return null;
  }

  if (!isHttpUrl(resolvedUrl)) {
    return null;
  }

  const mergedDrm = mergeDrmConfig(inlineDrm, pendingDrm);
  const merged = mergeHeaderMaps(
    inlineHeaders,
    pendingHeaders,
    drmConfigToHeaders(mergedDrm),
  );
  if (Object.keys(merged).length > 0) {
    return finalizeStreamSource(resolvedUrl, merged);
  }

  const { auth } = parseStreamSource(trimmed);
  if (auth) {
    return `${resolvedUrl}|${auth}`;
  }

  return resolvedUrl;
}

type ParsedExtInf = {
  title: string;
  groupTitle?: string;
  logo?: string;
};

function toSingleExtractedChannel(
  title: string,
  url: string,
  metadata: Omit<ParsedExtInf, "title"> = {},
): ExtractedChannel {
  const links = [{ label: inferLinkLabel(url, title, 0, 1), url }];

  return {
    title,
    url,
    groupTitle: metadata.groupTitle,
    logo: metadata.logo,
    channelKey: buildChannelKey(metadata.groupTitle, title),
    links,
  };
}

function parseExtInfLine(
  line: string,
  defaultTitle?: string,
  autoIndex = 1,
): ParsedExtInf {
  const groupMatch = line.match(/group-title="([^"]*)"/i);
  const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
  const tvgNameMatch = line.match(/tvg-name="([^"]+)"/i);
  const commaIndex = line.lastIndexOf(",");
  const commaTitle =
    commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : undefined;

  const title =
    commaTitle ||
    tvgNameMatch?.[1]?.trim() ||
    defaultTitle?.trim() ||
    `Channel ${autoIndex}`;

  let logo = logoMatch?.[1]?.trim();
  if (!logo || logo === "#") {
    logo = undefined;
  }

  const groupTitle = groupMatch?.[1]?.trim() || undefined;

  return { title, groupTitle, logo };
}

function parsePlaylist(
  content: string,
  baseUrl: string,
  defaultTitle?: string,
): ExtractedChannel[] {
  const lines = content.split(/\r?\n/);
  const channels: ExtractedChannel[] = [];
  let pendingMeta: ParsedExtInf | null = null;
  let pendingHeaders: PendingStreamHeaders = {};
  let pendingDrm: PendingStreamDrm = {};
  let pendingUrls: string[] = [];
  let autoIndex = 1;

  const flushPendingChannel = () => {
    if (!pendingMeta || pendingUrls.length === 0) {
      pendingMeta = null;
      pendingHeaders = {};
      pendingDrm = {};
      pendingUrls = [];
      return;
    }

    const links: StreamLinkVariant[] = [];

    for (const [index, rawUrl] of pendingUrls.entries()) {
      const resolvedUrl = resolveStreamUrl(
        rawUrl,
        baseUrl,
        pendingHeaders,
        pendingDrm,
      );

      if (!resolvedUrl) {
        continue;
      }

      links.push({
        label: inferLinkLabel(
          resolvedUrl,
          pendingMeta.title,
          index,
          pendingUrls.length,
        ),
        url: resolvedUrl,
      });
    }

    if (links.length > 0) {
      channels.push({
        title: pendingMeta.title,
        groupTitle: pendingMeta.groupTitle,
        logo: pendingMeta.logo,
        channelKey: buildChannelKey(
          pendingMeta.groupTitle,
          pendingMeta.title,
        ),
        url: links[0].url,
        links,
      });
      autoIndex += 1;
    }

    pendingMeta = null;
    pendingHeaders = {};
    pendingDrm = {};
    pendingUrls = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("#EXTINF:")) {
      flushPendingChannel();
      pendingMeta = parseExtInfLine(line, defaultTitle, autoIndex);
      continue;
    }

    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      continue;
    }

    const extHttpHeaders = parseExtHttpLine(line);
    if (extHttpHeaders && Object.keys(extHttpHeaders).length > 0) {
      pendingHeaders = { ...pendingHeaders, ...extHttpHeaders };
      continue;
    }

    const vlcHeaders = parseExtVlcOptLine(line);
    if (vlcHeaders && Object.keys(vlcHeaders).length > 0) {
      pendingHeaders = { ...pendingHeaders, ...vlcHeaders };
      continue;
    }

    const kodiHeaders = parseKodiPropLine(line);
    if (kodiHeaders && Object.keys(kodiHeaders).length > 0) {
      pendingHeaders = { ...pendingHeaders, ...kodiHeaders };
      continue;
    }

    const kodiLicense = parseKodiLicenseLine(line);
    if (kodiLicense) {
      pendingDrm = mergeDrmConfig(pendingDrm, kodiLicense);
      continue;
    }

    if (/^KODIPROP:/i.test(line)) {
      const normalizedLine = `#${line}`;
      const normalizedHeaders = parseKodiPropLine(normalizedLine);
      if (normalizedHeaders && Object.keys(normalizedHeaders).length > 0) {
        pendingHeaders = { ...pendingHeaders, ...normalizedHeaders };
        continue;
      }
      const normalizedLicense = parseKodiLicenseLine(normalizedLine);
      if (normalizedLicense) {
        pendingDrm = mergeDrmConfig(pendingDrm, normalizedLicense);
        continue;
      }
    }

    if (line.startsWith("#")) {
      continue;
    }

    if (!pendingMeta) {
      pendingMeta = {
        title: defaultTitle?.trim() || `Channel ${autoIndex}`,
      };
    }

    pendingUrls.push(line);
  }

  flushPendingChannel();

  return channels;
}

function extractHttpUrls(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[,\)]+$/, "")))];
}

function detectSourceKind(
  content: string,
  fileName?: string,
  baseUrl?: string,
): SourceKind {
  const lowerName = fileName?.toLowerCase() ?? "";
  const lowerBase = baseUrl?.toLowerCase() ?? "";

  if (
    looksLikeMpd(content) ||
    MANIFEST_EXTENSIONS.some((ext) => lowerName.endsWith(ext) || lowerBase.endsWith(ext))
  ) {
    return "mpd";
  }

  if (
    looksLikePlaylist(content) ||
    PLAYLIST_EXTENSIONS.some((ext) => lowerName.endsWith(ext) || lowerBase.endsWith(ext))
  ) {
    return "playlist";
  }

  if (isHttpUrl(content.trim()) && shouldTreatUrlAsDirectStream(content.trim())) {
    return "direct-url";
  }

  return "unknown";
}

function looksLikePlaylist(content: string): boolean {
  return (
    content.includes("#EXTM3U") ||
    content.includes("#EXTINF:") ||
    content.includes("#EXT-X-STREAM-INF:")
  );
}

export function shouldManageAsPlaylistSource(content: string, url: string): boolean {
  const trimmed = content.trim();

  if (shouldTreatUrlAsDirectStream(url)) {
    return false;
  }

  if (looksLikeMpd(trimmed)) {
    return false;
  }

  if (isMasterHLSPlaylist(trimmed)) {
    return false;
  }

  if (looksLikePlaylist(trimmed)) {
    return true;
  }

  const path = getPathFromUrl(url);
  if (PLAYLIST_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return true;
  }

  return extractHttpUrls(trimmed).length > 1;
}

function isMasterHLSPlaylist(content: string): boolean {
  return (
    content.includes("#EXT-X-STREAM-INF:") && !content.includes("#EXTINF:")
  );
}

function resolveManifestUrl(
  sourceUrl?: string,
  baseUrl?: string,
): string | null {
  const candidates = [sourceUrl, baseUrl]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];

  for (const candidate of candidates) {
    const streamUrl = streamUrlCandidate(candidate);
    if (!isHttpUrl(streamUrl)) {
      continue;
    }

    const lower = streamUrl.toLowerCase();
    if (
      lower.includes(".m3u8") ||
      lower.includes(".mpd") ||
      lower.includes("/manifest") ||
      lower.includes("format=m3u8")
    ) {
      return streamUrl;
    }
  }

  return null;
}

function looksLikeMpd(content: string): boolean {
  return /<MPD[\s>]/i.test(content) || content.includes("urn:mpeg:dash:schema:MPD");
}

export function shouldTreatUrlAsDirectStream(url: string): boolean {
  const lower = url.toLowerCase();

  if (DIRECT_STREAM_EXTENSIONS.some((ext) => lower.includes(ext))) {
    return true;
  }

  if (lower.includes("/manifest") || lower.includes("format=m3u8")) {
    return true;
  }

  return false;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(streamUrlCandidate(value));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function streamUrlCandidate(value: string): string {
  const { url } = parseStreamSource(value.trim());
  return url || value.trim();
}

function normalizeBaseUrl(value: string): string {
  if (!value.trim()) {
    return "";
  }

  try {
    const parsed = new URL(value);
    if (parsed.pathname.endsWith("/")) {
      return parsed.toString();
    }

    const segments = parsed.pathname.split("/");
    segments.pop();
    parsed.pathname = `${segments.join("/")}/`;
    return parsed.toString();
  } catch {
    return value.endsWith("/") ? value : `${value}/`;
  }
}

function guessBaseUrlFromContent(content: string): string {
  const firstUrl = extractHttpUrls(content)[0];
  return firstUrl ? normalizeBaseUrl(firstUrl) : "";
}

function getPathFromUrl(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean).pop();
    if (!segment) {
      return parsed.hostname;
    }

    return decodeURIComponent(segment)
      .replace(/\.(m3u8|m3u|mpd|mp4|ts)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
  } catch {
    return "Stream";
  }
}

export function normalizeRemoteUrl(url: string): string {
  let normalized = url.trim();

  const githubBlobMatch = normalized.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i,
  );

  if (githubBlobMatch) {
    const [, owner, repo, branch, path] = githubBlobMatch;
    normalized = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }

  const githubRawMatch = normalized.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/i,
  );

  if (githubRawMatch) {
    const [, owner, repo, branch, path] = githubRawMatch;
    normalized = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }

  const pastebinMatch = normalized.match(/^https:\/\/pastebin\.com\/(?!raw\/)([A-Za-z0-9]+)$/i);
  if (pastebinMatch?.[1]) {
    normalized = `https://pastebin.com/raw/${pastebinMatch[1]}`;
  }

  const gistMatch = normalized.match(/^https:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)$/i);
  if (gistMatch) {
    normalized = `${normalized}/raw`;
  }

  return normalized;
}

export async function fetchRemoteSource(url: string): Promise<{ content: string }> {
  const response = await fetch(url, {
    headers: {
      Accept: "*/*",
      "User-Agent": "IPTV-Proxy-Dashboard/1.0",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source (${response.status}): ${url}`);
  }

  const content = await response.text();

  if (!content.trim()) {
    throw new Error("Fetched source is empty.");
  }

  return { content };
}

function dedupeChannels(channels: ExtractedChannel[]): ExtractedChannel[] {
  const seen = new Map<string, ExtractedChannel>();

  for (const channel of channels) {
    const existing = seen.get(channel.channelKey);

    if (!existing) {
      seen.set(channel.channelKey, channel);
      continue;
    }

    const mergedLinks = [...existing.links];

    for (const link of channel.links) {
      if (!mergedLinks.some((entry) => entry.url.trim() === link.url.trim())) {
        mergedLinks.push(link);
      }
    }

    seen.set(channel.channelKey, {
      ...existing,
      url: existing.url || channel.url,
      logo: existing.logo ?? channel.logo,
      groupTitle: existing.groupTitle ?? channel.groupTitle,
      links: mergedLinks.map((link, index) => ({
        ...link,
        label: inferLinkLabel(
          link.url,
          existing.title,
          index,
          mergedLinks.length,
        ),
      })),
    });
  }

  return [...seen.values()];
}
