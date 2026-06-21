import {
  countActivePresenceSessions,
  upsertPresenceHeartbeat,
} from "@/db/repositories";
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
  await upsertPresenceHeartbeat(sessionId, path?.slice(0, 255) ?? null);
}

export async function getActiveUserCount(
  windowMs = ACTIVE_USER_WINDOW_MS,
): Promise<number> {
  return countActivePresenceSessions(windowMs);
}
