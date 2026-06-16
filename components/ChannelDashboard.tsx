"use client";

import { useCallback, useMemo, useState } from "react";
import { StreamPlayer, type PlaybackStatus } from "@/components/StreamPlayer";
import { StatusBadge } from "@/components/StatusBadge";
import {
  groupPublicChannelsByCategory,
  type PublicChannel,
} from "@/lib/streams/public-channel";
import { isValidLogoUrl } from "@/lib/streams/channel-metadata";

type ChannelDashboardProps = {
  channels: PublicChannel[];
  proxyBaseUrl: string;
};

function ChannelCardLogo({
  title,
  logo,
}: {
  title: string;
  logo: string | null | undefined;
}) {
  const [failed, setFailed] = useState(false);
  const showLogo = isValidLogoUrl(logo) && !failed;

  if (showLogo) {
    return (
      <img
        src={logo}
        alt=""
        className="h-10 w-full max-w-[88px] object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="text-lg font-bold text-zinc-500">
      {title.charAt(0).toUpperCase()}
    </span>
  );
}

function ChannelCard({
  channel,
  isActive,
  isLive,
  onSelect,
}: {
  channel: PublicChannel;
  isActive: boolean;
  isLive: boolean;
  onSelect: () => void;
}) {
  const sourceCount = channel.links.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex h-[140px] w-full flex-col overflow-hidden rounded-xl bg-[#111827] text-left ring-1 transition hover:bg-[#151f31] ${
        isActive
          ? "ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)]"
          : "ring-white/5 hover:ring-white/10"
      }`}
    >
      <div className="relative flex h-[72px] shrink-0 items-center justify-center bg-[#0a0f18] px-3">
        {isActive && isLive ? (
          <>
            <div className="absolute inset-0 bg-emerald-500/15" aria-hidden />
            <span className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-md bg-emerald-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black">
              Live
            </span>
          </>
        ) : null}
        <ChannelCardLogo title={channel.title} logo={channel.logo} />
      </div>

      <div className="flex h-[68px] shrink-0 flex-col px-2.5 py-2">
        <p
          className={`line-clamp-2 h-[34px] text-[11px] font-semibold leading-[17px] ${
            isActive ? "text-white" : "text-zinc-200"
          }`}
        >
          {channel.title}
        </p>
        <p className="mt-auto h-[14px] text-[10px] leading-[14px] text-zinc-500">
          {sourceCount > 1 ? `${sourceCount} sources` : "\u00A0"}
        </p>
      </div>
    </button>
  );
}

function CategorySectionHeader({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="h-px flex-1 bg-emerald-500/35" />
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
          {title}
        </span>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#1a1f2e] px-1.5 text-[10px] font-semibold text-zinc-400 ring-1 ring-white/5">
          {count}
        </span>
      </div>
      <div className="h-px flex-1 bg-emerald-500/35" />
    </div>
  );
}

function CategoryPill({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
        isActive
          ? "bg-emerald-400 text-black shadow-[0_0_16px_rgba(52,211,153,0.25)]"
          : "bg-[#111827] text-zinc-400 ring-1 ring-white/5 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

export function ChannelDashboard({ channels, proxyBaseUrl }: ChannelDashboardProps) {
  const groupedChannels = useMemo(
    () => groupPublicChannelsByCategory(channels),
    [channels],
  );
  const categories = useMemo(
    () => groupedChannels.map((group) => group.groupTitle),
    [groupedChannels],
  );

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedLinkIndex, setSelectedLinkIndex] = useState(0);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("loading");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const selectedStream =
    channels.find((stream) => stream.id === selectedId) ?? null;

  const filteredGroups = useMemo(() => {
    return groupedChannels
      .filter(
        (group) => activeCategory === "All" || group.groupTitle === activeCategory,
      )
      .filter((group) => group.channels.length > 0);
  }, [activeCategory, groupedChannels]);

  const playerMaxHeight = "max-h-[min(38vh,420px)] lg:max-h-none lg:min-h-0";

  const selectChannel = (id: number) => {
    setSelectedId(id);
    setSelectedLinkIndex(0);
    setPlaybackStatus("loading");
  };

  const handlePlaybackStatusChange = useCallback((status: PlaybackStatus) => {
    setPlaybackStatus(status);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black">
      <header className="z-40 shrink-0 border-b border-white/5 bg-black/95 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 shadow-[0_0_20px_rgba(52,211,153,0.3)]">
            <span className="text-sm font-black text-black">TV</span>
          </div>
          <div>
            <p className="text-base font-bold text-white">Live TV</p>
            <p className="text-[11px] text-zinc-500">
              {channels.length} channels
            </p>
          </div>
        </div>

        <div className="ott-scrollbar-hide mt-3 flex gap-2 overflow-x-auto pb-0.5">
          <CategoryPill
            label="All"
            isActive={activeCategory === "All"}
            onClick={() => setActiveCategory("All")}
          />
          {categories.map((category) => (
            <CategoryPill
              key={category}
              label={category}
              isActive={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            />
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="order-2 flex min-h-0 flex-1 flex-col lg:order-1">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
            {filteredGroups.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-500">
                No channels in this category.
              </p>
            ) : (
              <div className="space-y-8">
                {filteredGroups.map(({ groupTitle, channels: groupItems }) => (
                  <section key={groupTitle}>
                    <CategorySectionHeader
                      title={groupTitle}
                      count={groupItems.length}
                    />
                    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                      {groupItems.map((channel) => (
                        <li key={channel.id} className="min-h-[140px]">
                          <ChannelCard
                            channel={channel}
                            isActive={channel.id === selectedId}
                            isLive={
                              channel.id === selectedId &&
                              playbackStatus === "live"
                            }
                            onSelect={() => selectChannel(channel.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </main>

        <aside className="order-1 flex w-full shrink-0 flex-col border-b border-white/5 bg-[#050508] lg:order-2 lg:sticky lg:top-0 lg:h-[calc(100vh-7.25rem)] lg:w-[min(400px,34vw)] lg:self-start lg:border-b-0 lg:border-l lg:overflow-y-auto">
          <div className="flex flex-col p-3 sm:p-4">
            {selectedStream ? (
              <>
                <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                  <StreamPlayer
                    key={`${selectedStream.id}-${selectedLinkIndex}`}
                    streamId={selectedStream.id}
                    linkIndex={selectedLinkIndex}
                    title={selectedStream.title}
                    proxyBaseUrl={proxyBaseUrl}
                    onStatusChange={handlePlaybackStatusChange}
                    adaptiveFit
                    maxHeightClass={playerMaxHeight}
                  />
                </div>

                <div className="mt-3 rounded-xl bg-[#111827] px-3 py-2.5 ring-1 ring-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {selectedStream.title}
                      </p>
                      {selectedStream.groupTitle ? (
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">
                          {selectedStream.groupTitle}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge
                      status={playbackStatus}
                      variant={playbackStatus === "live" ? "broadcast" : "default"}
                      className="shrink-0 px-2.5 py-1 text-[10px] tracking-wide"
                    />
                  </div>
                </div>

                {selectedStream.links.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedStream.links.map((link) => {
                      const isActive = link.index === selectedLinkIndex;

                      return (
                        <button
                          key={`${selectedStream.id}-${link.label}-${link.index}`}
                          type="button"
                          onClick={() => {
                            setSelectedLinkIndex(link.index);
                            setPlaybackStatus("loading");
                          }}
                          className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
                            isActive
                              ? "bg-emerald-400 text-black"
                              : "bg-[#111827] text-zinc-400 ring-1 ring-white/5 hover:text-white"
                          }`}
                        >
                          {link.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : (
              <div
                className="flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#111827]/50"
                style={{ aspectRatio: 16 / 9 }}
              >
                <div className="px-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0a0f18] ring-1 ring-white/10">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-6 w-6 text-zinc-500"
                      aria-hidden
                    >
                      <polygon points="10,8 16,12 10,16" fill="currentColor" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    Select a channel
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Pick from the grid to start watching
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
