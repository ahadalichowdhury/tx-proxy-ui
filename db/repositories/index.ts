import type { PlaylistSource, Stream, StreamStatus } from "@/db/schema";
import { dataFetch } from "@/lib/data-api/client";

type RawPlaylistSource = Omit<PlaylistSource, "createdAt" | "lastRefreshedAt"> & {
  createdAt: string;
  lastRefreshedAt: string | null;
};

type RawStream = Omit<Stream, "createdAt"> & {
  createdAt: string;
};

function parsePlaylistSource(raw: RawPlaylistSource): PlaylistSource {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    lastRefreshedAt: raw.lastRefreshedAt ? new Date(raw.lastRefreshedAt) : null,
  };
}

function parseStream(raw: RawStream): Stream {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
  };
}

export async function listAllPlaylistSources(): Promise<PlaylistSource[]> {
  const rows = await dataFetch<RawPlaylistSource[]>("/data/playlist-sources");
  return rows.map(parsePlaylistSource);
}

export async function getPlaylistSourceById(id: number): Promise<PlaylistSource | null> {
  try {
    const row = await dataFetch<RawPlaylistSource>(`/data/playlist-sources/${id}`);
    return parsePlaylistSource(row);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return null;
    }
    throw error;
  }
}

export async function getPlaylistSourceByUrl(
  sourceUrl: string,
): Promise<PlaylistSource | null> {
  try {
    const row = await dataFetch<RawPlaylistSource>(
      `/data/playlist-sources/by-url?url=${encodeURIComponent(sourceUrl)}`,
      { auth: true },
    );
    return parsePlaylistSource(row);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return null;
    }
    throw error;
  }
}

export async function findPlaylistSourceIdByUrl(
  sourceUrl: string,
): Promise<number | null> {
  const source = await getPlaylistSourceByUrl(sourceUrl);
  return source?.id ?? null;
}

export async function insertPlaylistSource(input: {
  title: string;
  sourceUrl: string;
  sourceSnapshot?: string | null;
  baseUrl?: string | null;
}): Promise<PlaylistSource> {
  const row = await dataFetch<RawPlaylistSource>("/data/playlist-sources", {
    method: "POST",
    auth: true,
    body: JSON.stringify(input),
  });
  return parsePlaylistSource(row);
}

export async function updatePlaylistSourceById(
  id: number,
  patch: Partial<Omit<PlaylistSource, "id">>,
): Promise<void> {
  await dataFetch(`/data/playlist-sources/${id}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(patch),
  });
}

export async function deletePlaylistSourceById(id: number): Promise<void> {
  await dataFetch(`/data/playlist-sources/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function listAllStreams(): Promise<Stream[]> {
  const rows = await dataFetch<RawStream[]>("/data/streams");
  return rows.map(parseStream);
}

export async function listManualStreams(): Promise<Stream[]> {
  const rows = await dataFetch<RawStream[]>("/data/streams/manual");
  return rows.map(parseStream);
}

export async function getStreamById(id: number): Promise<Stream | null> {
  try {
    const row = await dataFetch<RawStream>(`/data/streams/${id}`);
    return parseStream(row);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return null;
    }
    throw error;
  }
}

export async function listStreamsBySourceId(sourceId: number) {
  return dataFetch<
    Array<{
      id: number;
      title: string;
      url: string;
      groupTitle: string | null;
      logo: string | null;
      channelKey: string | null;
      links: string | null;
    }>
  >(`/data/streams/by-source/${sourceId}`, { auth: true });
}

export async function listStreamsForManualImport() {
  return dataFetch<
    Array<{
      id: number;
      url: string;
      title: string;
      sourceId: number | null;
    }>
  >("/data/streams/manual-import", { auth: true });
}

export async function insertStream(
  input: Omit<Stream, "id" | "createdAt"> & { createdAt?: Date },
): Promise<Stream> {
  const row = await dataFetch<RawStream>("/data/streams", {
    method: "POST",
    auth: true,
    body: JSON.stringify(input),
  });
  return parseStream(row);
}

export async function updateStreamById(
  id: number,
  patch: Partial<Omit<Stream, "id">>,
): Promise<void> {
  await dataFetch(`/data/streams/${id}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(patch),
  });
}

export async function deleteStreamById(id: number): Promise<void> {
  await dataFetch(`/data/streams/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function deleteStreamsBySourceId(sourceId: number): Promise<void> {
  const rows = await listStreamsBySourceId(sourceId);
  await Promise.all(rows.map((row) => deleteStreamById(row.id)));
}

export async function updateStreamStatus(
  id: number,
  status: StreamStatus,
): Promise<void> {
  await updateStreamById(id, { status });
}

export async function upsertPresenceHeartbeat(
  sessionId: string,
  path: string | null,
): Promise<void> {
  await dataFetch("/data/presence/heartbeat", {
    method: "POST",
    body: JSON.stringify({ sessionId, path }),
  });
}

export async function countActivePresenceSessions(windowMs: number): Promise<number> {
  const result = await dataFetch<{ count: number }>(
    `/data/presence/active-count?windowMs=${windowMs}`,
    { auth: true },
  );
  return result.count;
}

export async function deleteStalePresenceSessions(_cutoff: Date): Promise<void> {
  // Stale rows are pruned by the Go API during heartbeat.
}
