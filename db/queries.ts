import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "./index";
import { playlistSources, streams } from "./schema";

export async function getAllStreams() {
  const db = getDb();
  return db.select().from(streams).orderBy(desc(streams.createdAt));
}

export async function getManualStreams() {
  const db = getDb();
  return db
    .select()
    .from(streams)
    .where(isNull(streams.sourceId))
    .orderBy(desc(streams.createdAt));
}

export async function getAllPlaylistSources() {
  const db = getDb();
  return db
    .select()
    .from(playlistSources)
    .orderBy(desc(playlistSources.createdAt));
}

export async function getPlaylistSourceById(id: number) {
  const db = getDb();
  const [source] = await db
    .select()
    .from(playlistSources)
    .where(eq(playlistSources.id, id))
    .limit(1);

  return source ?? null;
}

export async function getStreamById(id: number) {
  const db = getDb();
  const [stream] = await db
    .select()
    .from(streams)
    .where(eq(streams.id, id))
    .limit(1);

  return stream ?? null;
}
