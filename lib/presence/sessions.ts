import { count, gt, lt } from "drizzle-orm";
import { getDb } from "@/db/index";
import { presenceSessions } from "@/db/schema";
import {
  ACTIVE_USER_WINDOW_MS,
  PRESENCE_STALE_MS,
} from "@/lib/presence/constants";

export { ACTIVE_USER_WINDOW_MS, PRESENCE_STALE_MS } from "@/lib/presence/constants";

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

export async function recordPresenceHeartbeat(
  sessionId: string,
  path?: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db
    .insert(presenceSessions)
    .values({
      sessionId,
      lastSeen: now,
      path: path?.slice(0, 255) ?? null,
    })
    .onConflictDoUpdate({
      target: presenceSessions.sessionId,
      set: {
        lastSeen: now,
        path: path?.slice(0, 255) ?? null,
      },
    });

  await pruneStalePresenceSessions();
}

export async function getActiveUserCount(
  windowMs = ACTIVE_USER_WINDOW_MS,
): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - windowMs);

  const [result] = await db
    .select({ total: count() })
    .from(presenceSessions)
    .where(gt(presenceSessions.lastSeen, cutoff));

  return result?.total ?? 0;
}

async function pruneStalePresenceSessions(): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - PRESENCE_STALE_MS);

  await db
    .delete(presenceSessions)
    .where(lt(presenceSessions.lastSeen, cutoff));
}
