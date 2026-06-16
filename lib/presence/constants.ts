/** How often each visitor pings the server. */
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;

/** How often the admin panel refreshes the count. */
export const ADMIN_COUNT_POLL_INTERVAL_MS = 10 * 60 * 1000;

/** Count users seen within this window (2× heartbeat + buffer). */
export const ACTIVE_USER_WINDOW_MS = 24 * 60 * 1000;

/** Delete presence rows older than this on heartbeat cleanup. */
export const PRESENCE_STALE_MS = 60 * 60 * 1000;
