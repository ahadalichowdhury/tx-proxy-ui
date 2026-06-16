"use server";

import { requireAdminSession } from "@/lib/auth/session";
import {
  ACTIVE_USER_WINDOW_MS,
  getActiveUserCount,
} from "@/lib/presence/sessions";

export type ActiveUserCountState =
  | {
      count: number;
      windowMs: number;
      checkedAt: string;
    }
  | {
      error: string;
    };

export async function getActiveUserCountForAdmin(): Promise<ActiveUserCountState> {
  try {
    await requireAdminSession();
    const count = await getActiveUserCount();

    return {
      count,
      windowMs: ACTIVE_USER_WINDOW_MS,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to load active users.",
    };
  }
}
