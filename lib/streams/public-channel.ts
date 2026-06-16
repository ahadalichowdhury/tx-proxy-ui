import type { Stream, StreamStatus } from "@/db/schema";
import { inferLinkLabel, parseStreamLinks } from "@/lib/streams/channel-metadata";

export type PublicStreamLink = {
  index: number;
  label: string;
};

export type PublicChannel = {
  id: number;
  title: string;
  groupTitle: string | null;
  logo: string | null;
  channelKey: string | null;
  status: StreamStatus;
  links: PublicStreamLink[];
};

export function toPublicChannel(stream: Stream): PublicChannel {
  const links = parseStreamLinks(stream);

  return {
    id: stream.id,
    title: stream.title,
    groupTitle: stream.groupTitle,
    logo: stream.logo,
    channelKey: stream.channelKey,
    status: stream.status,
    links: links.map((link, index) => ({
      index,
      label:
        link.label?.trim() ||
        inferLinkLabel(link.url, stream.title, index, links.length),
    })),
  };
}

export function getStreamSourceAtLink(
  stream: Stream,
  linkIndex: number,
): string | null {
  const links = parseStreamLinks(stream);
  const link = links[linkIndex] ?? links[0];
  return link?.url?.trim() || null;
}

export function groupPublicChannelsByCategory(
  channels: PublicChannel[],
): Array<{ groupTitle: string; channels: PublicChannel[] }> {
  const groups = new Map<string, PublicChannel[]>();

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
