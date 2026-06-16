import type { Stream } from "@/db/schema";

export type StreamLinkVariant = {
  label: string;
  url: string;
};

export type DashboardChannel = Omit<Stream, "links"> & {
  links: StreamLinkVariant[];
};

export function buildChannelKey(
  groupTitle: string | undefined,
  title: string,
): string {
  return `${(groupTitle ?? "").trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

export function inferLinkLabel(
  url: string,
  channelTitle: string,
  index: number,
  total: number,
): string {
  if (total === 1) {
    const qualityFromTitle = channelTitle.match(/\((\d+p|4k|uhd|fhd|hd|sd)\)/i);
    if (qualityFromTitle?.[1]) {
      return qualityFromTitle[1].toUpperCase();
    }
    return "Primary";
  }

  const urlLower = url.toLowerCase();
  if (urlLower.includes("1080")) return "1080p";
  if (urlLower.includes("720")) return "720p";
  if (urlLower.includes("480")) return "480p";
  if (urlLower.includes("4k") || urlLower.includes("2160")) return "4K";
  if (urlLower.endsWith(".mpd") || urlLower.includes(".mpd?")) return "DASH";
  if (urlLower.endsWith(".ts") || urlLower.includes(".ts?")) return "MPEG-TS";
  if (urlLower.includes("_hd") || urlLower.includes("/hd/")) return "HD";
  if (urlLower.includes("_sd") || urlLower.includes("/sd/")) return "SD";

  const linkNumInTitle = channelTitle.match(/link\s*(\d+)/i);
  if (linkNumInTitle?.[1]) {
    return `Link ${linkNumInTitle[1]}`;
  }

  return `Link ${index + 1}`;
}

export function parseStreamLinks(
  stream: Pick<Stream, "url" | "links">,
): StreamLinkVariant[] {
  if (stream.links?.trim()) {
    try {
      const parsed = JSON.parse(stream.links) as StreamLinkVariant[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(
          (entry) =>
            typeof entry?.url === "string" &&
            entry.url.trim() &&
            typeof entry?.label === "string" &&
            entry.label.trim(),
        );
      }
    } catch {
      // Fall back to primary URL below.
    }
  }

  return [{ label: "Primary", url: stream.url }];
}

export function toDashboardChannel(stream: Stream): DashboardChannel {
  return {
    ...stream,
    links: parseStreamLinks(stream),
  };
}

export function groupChannelsByCategory(
  channels: DashboardChannel[],
): Array<{ groupTitle: string; channels: DashboardChannel[] }> {
  const groups = new Map<string, DashboardChannel[]>();

  for (const channel of channels) {
    const groupTitle = channel.groupTitle?.trim() || "Other";
    const bucket = groups.get(groupTitle);

    if (bucket) {
      bucket.push(channel);
    } else {
      groups.set(groupTitle, [channel]);
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupTitle, groupedChannels]) => ({
      groupTitle,
      channels: groupedChannels,
    }));
}

export function isValidLogoUrl(logo: string | null | undefined): logo is string {
  if (!logo?.trim() || logo.trim() === "#") {
    return false;
  }

  return /^https?:\/\//i.test(logo.trim());
}
