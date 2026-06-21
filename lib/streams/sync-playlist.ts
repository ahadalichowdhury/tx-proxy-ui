import type { PlaylistSource } from "@/db/schema";
import {
  deleteStreamById,
  insertStream,
  listStreamsBySourceId,
  updatePlaylistSourceById,
  updateStreamById,
} from "@/db/repositories";
import {
  extractChannelsFromSource,
  type ExtractedChannel,
} from "@/lib/streams/extract";

export type PlaylistSyncResult = {
  importedCount: number;
  updatedCount: number;
  removedCount: number;
};

function serializeChannel(channel: ExtractedChannel) {
  return {
    title: channel.title.trim(),
    url: channel.url.trim(),
    groupTitle: channel.groupTitle?.trim() || null,
    logo: channel.logo?.trim() || null,
    channelKey: channel.channelKey,
    links: JSON.stringify(channel.links),
    status: "live" as const,
  };
}

function channelNeedsUpdate(
  existing: {
    title: string;
    url: string;
    groupTitle: string | null;
    logo: string | null;
    links: string | null;
  },
  channel: ExtractedChannel,
): boolean {
  const next = serializeChannel(channel);

  return (
    existing.title !== next.title ||
    existing.url !== next.url ||
    (existing.groupTitle ?? null) !== next.groupTitle ||
    (existing.logo ?? null) !== next.logo ||
    (existing.links ?? null) !== next.links
  );
}

export async function syncPlaylistSource(
  source: PlaylistSource,
): Promise<PlaylistSyncResult> {
  const extracted = source.sourceSnapshot?.trim()
    ? await extractChannelsFromSource({
        sourceText: source.sourceSnapshot,
        baseUrl: source.baseUrl ?? undefined,
        defaultTitle: source.title,
      })
    : await extractChannelsFromSource({
        sourceUrl: source.sourceUrl,
        baseUrl: source.baseUrl ?? undefined,
        defaultTitle: source.title,
      });

  const existing = await listStreamsBySourceId(source.id);

  const existingByKey = new Map<
    string,
    {
      id: number;
      title: string;
      url: string;
      groupTitle: string | null;
      logo: string | null;
      links: string | null;
    }
  >();

  for (const row of existing) {
    if (row.channelKey) {
      existingByKey.set(row.channelKey, row);
    }
  }

  const syncedKeys = new Set<string>();
  let importedCount = 0;
  let updatedCount = 0;

  for (const channel of extracted) {
    syncedKeys.add(channel.channelKey);
    const payload = serializeChannel(channel);
    const existingChannel = existingByKey.get(channel.channelKey);

    if (existingChannel) {
      if (channelNeedsUpdate(existingChannel, channel)) {
        await updateStreamById(existingChannel.id, payload);
        updatedCount += 1;
      }

      continue;
    }

    await insertStream({
      ...payload,
      sourceId: source.id,
    });

    importedCount += 1;
  }

  let removedCount = 0;

  for (const row of existing) {
    if (row.channelKey && syncedKeys.has(row.channelKey)) {
      continue;
    }

    await deleteStreamById(row.id);
    removedCount += 1;
  }

  await updatePlaylistSourceById(source.id, {
    lastRefreshedAt: new Date(),
  });

  return { importedCount, updatedCount, removedCount };
}
