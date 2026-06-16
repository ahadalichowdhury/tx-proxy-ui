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

function ChannelLogo({
  title,
  logo,
  size = "md",
}: {
  title: string;
  logo: string | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const showLogo = isValidLogoUrl(logo) && !failed;
  const sizeClass =
    size === "sm"
      ? "h-10 w-10 rounded-lg"
      : size === "lg"
        ? "h-16 w-16 rounded-2xl"
        : "h-12 w-12 rounded-xl";

  if (showLogo) {
    return (
      <img
        src={logo}
        alt=""
        className={`${sizeClass} shrink-0 object-cover ring-1 ring-white/10`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-xs font-bold text-zinc-400 ring-1 ring-white/10`}
    >
      {title.charAt(0).toUpperCase()}
    </div>
  );
}

function ChannelListItem({
  channel,
  isActive,
  isPlaying,
  onSelect,
}: {
  channel: PublicChannel;
  isActive: boolean;
  isPlaying: boolean;
  onSelect: () => void;
}) {
  const linkCount = channel.links.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
        isActive
          ? "bg-rose-500/15 ring-1 ring-rose-500/40"
          : "hover:bg-white/5"
      }`}
    >
      <ChannelLogo title={channel.title} logo={channel.logo} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-sm font-semibold ${
              isActive ? "text-white" : "text-zinc-200"
            }`}
          >
            {channel.title}
          </p>
          {isPlaying ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
              <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
              Live
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500">
          {channel.groupTitle ?? "Live TV"}
          {linkCount > 1 ? ` · ${linkCount} links` : ""}
        </p>
      </div>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M13.5 13.5L17 17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TheaterIcon({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
        <path
          d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
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
      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
        isActive
          ? "bg-white text-black"
          : "border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
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
  const [searchQuery, setSearchQuery] = useState("");
  const [theaterMode, setTheaterMode] = useState(false);

  const selectedStream =
    channels.find((stream) => stream.id === selectedId) ?? null;

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return groupedChannels
      .filter(
        (group) => activeCategory === "All" || group.groupTitle === activeCategory,
      )
      .map((group) => ({
        ...group,
        channels: group.channels.filter((channel) => {
          if (!query) return true;
          return (
            channel.title.toLowerCase().includes(query) ||
            (channel.groupTitle ?? "").toLowerCase().includes(query)
          );
        }),
      }))
      .filter((group) => group.channels.length > 0);
  }, [activeCategory, groupedChannels, searchQuery]);

  const visibleCount = filteredGroups.reduce(
    (total, group) => total + group.channels.length,
    0,
  );

  const playerMaxHeight = theaterMode
    ? "max-h-[min(62vh,720px)]"
    : "max-h-[min(42vh,520px)] sm:max-h-[min(44vh,540px)]";

  const selectChannel = (id: number) => {
    setSelectedId(id);
    setSelectedLinkIndex(0);
    setPlaybackStatus("loading");
  };

  const handlePlaybackStatusChange = useCallback((status: PlaybackStatus) => {
    setPlaybackStatus(status);
  }, []);

  return (
    <div className="ott-mesh flex h-screen flex-col overflow-hidden">
      <header className="z-40 shrink-0 border-b border-white/5 bg-[#050508]/90 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-5">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-indigo-600">
              <span className="text-xs font-black text-white">TV</span>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-white">Live TV</p>
              <p className="text-[10px] text-zinc-500">{channels.length} channels</p>
            </div>
          </div>

          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search channels..."
              className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-rose-500/40 focus:ring-1 focus:ring-rose-500/30"
            />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex min-h-0 flex-1 flex-col border-t border-white/5 lg:order-1 lg:w-[min(400px,36vw)] lg:flex-none lg:border-t-0 lg:border-r">
          <div className="shrink-0 border-b border-white/5 px-3 py-2.5 sm:px-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Channels
              </p>
              <p className="text-[11px] text-zinc-500">{visibleCount} shown</p>
            </div>
            <div className="ott-scrollbar-hide flex gap-1.5 overflow-x-auto pb-0.5">
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
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
            {filteredGroups.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-zinc-500">
                No channels match your search.
              </p>
            ) : (
              <div className="space-y-4">
                {filteredGroups.map(({ groupTitle, channels: groupItems }) => (
                  <section key={groupTitle}>
                    {activeCategory === "All" ? (
                      <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        {groupTitle}
                      </p>
                    ) : null}
                    <ul className="space-y-0.5">
                      {groupItems.map((channel) => (
                        <li key={channel.id}>
                          <ChannelListItem
                            channel={channel}
                            isActive={channel.id === selectedId}
                            isPlaying={
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
        </aside>

        <section className="order-1 flex min-h-0 flex-col lg:order-2 lg:min-w-0 lg:flex-1">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {selectedStream && isValidLogoUrl(selectedStream.logo) ? (
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                aria-hidden
              >
                <img
                  src={selectedStream.logo!}
                  alt=""
                  className="h-full w-full scale-110 object-cover blur-3xl"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#050508]/40 via-[#050508]/70 to-[#050508]" />
              </div>
            ) : (
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-indigo-500/5"
                aria-hidden
              />
            )}

            <div className="relative flex min-h-0 flex-1 flex-col justify-center px-3 py-3 sm:px-6 sm:py-5">
              {selectedStream ? (
                <div
                  className={`relative mx-auto w-full transition-all duration-500 ease-out ${
                    theaterMode ? "max-w-none" : "max-w-4xl"
                  }`}
                >
                  <div
                    className={`overflow-hidden rounded-2xl bg-black shadow-2xl transition-all duration-500 ${
                      playbackStatus === "live"
                        ? "shadow-rose-500/20 ring-1 ring-rose-500/35"
                        : "ring-1 ring-white/10 shadow-black/50"
                    }`}
                  >
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

                  <button
                    type="button"
                    onClick={() => setTheaterMode((value) => !value)}
                    className="absolute right-3 top-3 hidden rounded-full border border-white/15 bg-black/60 p-2 text-zinc-200 backdrop-blur-md transition hover:bg-black/80 hover:text-white lg:inline-flex"
                    title={theaterMode ? "Compact player" : "Theater mode"}
                  >
                    <TheaterIcon expanded={theaterMode} />
                  </button>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-2xl">
                  <div
                    className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/30 px-6 py-16 backdrop-blur-sm"
                    style={{ aspectRatio: 16 / 9 }}
                  >
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="h-7 w-7 text-zinc-400"
                          aria-hidden
                        >
                          <polygon
                            points="10,8 16,12 10,16"
                            fill="currentColor"
                          />
                        </svg>
                      </div>
                      <p className="text-base font-semibold text-white">
                        Select a channel
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Full stream · no crop · channel list stays visible
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedStream ? (
              <div className="relative shrink-0 border-t border-white/10 bg-black/40 px-3 py-3 backdrop-blur-xl sm:px-6">
                <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChannelLogo
                      title={selectedStream.title}
                      logo={selectedStream.logo}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={playbackStatus} variant="broadcast" />
                        {selectedStream.groupTitle ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            {selectedStream.groupTitle}
                          </span>
                        ) : null}
                      </div>
                      <h1 className="truncate text-sm font-bold text-white sm:text-base">
                        {selectedStream.title}
                      </h1>
                    </div>
                  </div>

                  {selectedStream.links.length > 1 ? (
                    <div className="flex flex-wrap gap-1.5">
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
                            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                              isActive
                                ? "bg-white text-black"
                                : "border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                            }`}
                          >
                            {link.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
