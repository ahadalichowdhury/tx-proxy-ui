"use client";

import { useEffect, useState } from "react";
import {
  getActiveUserCountForAdmin,
  type ActiveUserCountState,
} from "@/app/actions/presence";
import {
  ADMIN_COUNT_POLL_INTERVAL_MS,
  ACTIVE_USER_WINDOW_MS,
} from "@/lib/presence/constants";

function formatWindowMinutes(windowMs: number): number {
  return Math.max(1, Math.round(windowMs / 60_000));
}

export function ActiveUsersPanel() {
  const [count, setCount] = useState<number | null>(null);
  const [windowMs, setWindowMs] = useState(ACTIVE_USER_WINDOW_MS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      try {
        const payload: ActiveUserCountState = await getActiveUserCountForAdmin();

        if (cancelled) {
          return;
        }

        if ("error" in payload) {
          throw new Error(payload.error);
        }

        setCount(payload.count);
        setWindowMs(payload.windowMs);
        setError(null);
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load active users.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCount();
    const intervalId = window.setInterval(() => {
      void loadCount();
    }, ADMIN_COUNT_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const activeCount = count ?? 0;
  const windowMinutes = formatWindowMinutes(windowMs);
  const pollMinutes = formatWindowMinutes(ADMIN_COUNT_POLL_INTERVAL_MS);

  return (
    <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Live Visitors
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Active in the last {windowMinutes} minutes · updates every{" "}
            {pollMinutes} minutes
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              loading
                ? "animate-pulse bg-zinc-500"
                : activeCount > 0
                  ? "animate-pulse bg-emerald-400"
                  : "bg-zinc-600"
            }`}
            aria-hidden
          />
          {loading ? (
            <p className="text-3xl font-bold tabular-nums text-zinc-300">--</p>
          ) : (
            <p className="text-3xl font-bold tabular-nums text-white">
              {activeCount}
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
