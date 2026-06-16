"use client";

import { useTransition } from "react";
import { deleteStream } from "@/app/actions/streams";
import { hasDrmConfig, parseStreamSourceFull } from "@/lib/proxy/parse";
import type { Stream } from "@/db/schema";

type AdminChannelListProps = {
  channels: Stream[];
};

function StreamUrlDetails({ storedUrl }: { storedUrl: string }) {
  const { url, httpAuth, drm } = parseStreamSourceFull(storedUrl);
  const drmEnabled = hasDrmConfig(drm);

  return (
    <div className="mt-2 space-y-2">
      <p className="break-all font-mono text-xs text-zinc-500">{url}</p>
      {drmEnabled ? (
        <div className="flex flex-wrap gap-2">
          {drm.scheme ? (
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
              DRM: {drm.scheme}
            </span>
          ) : null}
          {drm.licenseUrl ? (
            <span className="max-w-full truncate rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 font-mono text-[11px] text-violet-200">
              License: {drm.licenseUrl}
            </span>
          ) : null}
          {drm.clearKeys
            ? Object.entries(drm.clearKeys).map(([kid]) => (
                <span
                  key={kid}
                  className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 font-mono text-[11px] text-violet-200"
                >
                  KID: {kid}
                </span>
              ))
            : null}
        </div>
      ) : null}
      {httpAuth ? (
        <div className="flex flex-wrap gap-2">
          {httpAuth.split("|").map((part) => (
            <span
              key={part}
              className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 font-mono text-[11px] text-cyan-200"
            >
              {part}
            </span>
          ))}
        </div>
      ) : !drmEnabled ? (
        <p className="text-[11px] text-amber-400/90">
          No playlist headers stored (Referer / User-Agent missing)
        </p>
      ) : null}
    </div>
  );
}

export function AdminChannelList({ channels }: AdminChannelListProps) {
  const [isPending, startTransition] = useTransition();

  if (channels.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-12 text-center">
        <p className="text-sm text-zinc-400">
          No manual channels yet. Playlist channels are managed from the sources
          section above.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl shadow-black/20">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h2 className="text-lg font-semibold text-zinc-100">Manual Channels</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {channels.length} manually added channel{channels.length === 1 ? "" : "s"}
        </p>
      </div>

      <ul className="divide-y divide-zinc-800">
        {channels.map((channel) => (
          <li
            key={channel.id}
            className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
          >
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-medium text-zinc-100">
                {channel.title}
              </h3>
              <StreamUrlDetails storedUrl={channel.url} />
            </div>

            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(() => {
                  void deleteStream(channel.id);
                })
              }
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
