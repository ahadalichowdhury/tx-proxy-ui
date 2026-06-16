"use client";

import { useState, useTransition } from "react";
import {
  deletePlaylistSource,
  refreshPlaylistSource,
  type StreamActionState,
} from "@/app/actions/streams";
import type { PlaylistSource } from "@/db/schema";

type AdminPlaylistSourceListProps = {
  sources: PlaylistSource[];
};

function formatTimestamp(value: Date | null | undefined): string {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function SyncMessage({ result }: { result: StreamActionState }) {
  if (result.error) {
    return (
      <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {result.error}
      </p>
    );
  }

  if (!result.success) {
    return null;
  }

  const parts: string[] = [];

  if (result.importedCount) {
    parts.push(
      `Added ${result.importedCount} channel${result.importedCount === 1 ? "" : "s"}`,
    );
  }

  if (result.updatedCount) {
    parts.push(
      `Updated ${result.updatedCount} channel${result.updatedCount === 1 ? "" : "s"}`,
    );
  }

  if (result.removedCount) {
    parts.push(
      `Removed ${result.removedCount} channel${result.removedCount === 1 ? "" : "s"}`,
    );
  }

  return (
    <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
      {parts.length > 0 ? parts.join(". ") + "." : "Playlist is already up to date."}
    </p>
  );
}

export function AdminPlaylistSourceList({ sources }: AdminPlaylistSourceListProps) {
  const [isPending, startTransition] = useTransition();
  const [activeSourceId, setActiveSourceId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<StreamActionState | null>(null);

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl shadow-black/20">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h2 className="text-lg font-semibold text-zinc-100">Playlist Sources</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Remote playlist URLs sync on refresh. Channels appear on the public
          dashboard after you refresh a source.
        </p>
      </div>

      {lastResult && <div className="px-6 pt-4"><SyncMessage result={lastResult} /></div>}

      <ul className="divide-y divide-zinc-800">
        {sources.map((source) => (
          <li
            key={source.id}
            className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
          >
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-medium text-zinc-100">
                {source.title}
              </h3>
              <p className="mt-2 break-all font-mono text-xs text-zinc-500">
                {source.sourceSnapshot
                  ? "Stored snapshot (local refresh)"
                  : source.sourceUrl}
              </p>
              {source.baseUrl ? (
                <p className="mt-2 break-all font-mono text-xs text-zinc-600">
                  Base URL: {source.baseUrl}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-zinc-500">
                Last refreshed: {formatTimestamp(source.lastRefreshedAt)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setActiveSourceId(source.id);
                  startTransition(async () => {
                    const result = await refreshPlaylistSource(source.id);
                    setLastResult(result);
                    setActiveSourceId(null);
                  });
                }}
                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {isPending && activeSourceId === source.id
                  ? "Refreshing..."
                  : "Refresh"}
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Delete this playlist source and all synced channels?",
                    )
                  ) {
                    return;
                  }

                  setActiveSourceId(source.id);
                  startTransition(async () => {
                    const result = await deletePlaylistSource(source.id);
                    setLastResult(result);
                    setActiveSourceId(null);
                  });
                }}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
