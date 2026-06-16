"use client";

import { useEffect, useRef, useState } from "react";
import type { TodayMatch } from "@/lib/worldcup/games";

type MatchesResponse = {
  matches: TodayMatch[];
  fetchedAt?: string;
  error?: string;
};

function statusStyles(status: TodayMatch["status"]): string {
  switch (status) {
    case "live":
      return "border-red-500/40 bg-red-500/15 text-red-200";
    case "finished":
      return "border-zinc-600/40 bg-zinc-800/60 text-zinc-400";
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
}

function FootballIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 3.5 8.5 8.5 12 12l3.5-3.5L12 3.5ZM8.5 15.5 12 20.5l3.5-5M3.5 12h5M15.5 12H20.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M5 5l10 10M15 5 5 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MatchRow({ match }: { match: TodayMatch }) {
  const showScore =
    match.status !== "upcoming" &&
    match.homeScore !== null &&
    match.awayScore !== null;

  return (
    <article className="rounded-xl border border-white/10 bg-white/4 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          {match.group.startsWith("R") ? match.group : `Group ${match.group}`}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusStyles(match.status)}`}
        >
          {match.status === "live" ? "Live" : match.statusLabel}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {match.homeTeam}
          </p>
          <p className="truncate text-sm text-zinc-400">vs {match.awayTeam}</p>
        </div>

        {showScore ? (
          <p className="shrink-0 text-base font-bold tabular-nums text-white">
            {match.homeScore}
            <span className="mx-1 text-zinc-500">-</span>
            {match.awayScore}
          </p>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-zinc-500">{match.kickoffDhaka} BDT</p>
    </article>
  );
}

function MatchesSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-[92px] animate-pulse rounded-xl border border-white/5 bg-white/3"
        />
      ))}
    </div>
  );
}

export function TodayMatches() {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<TodayMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMatches() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/matches/today");
        const payload = (await response.json()) as MatchesResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load matches.");
        }

        setMatches(payload.matches ?? []);
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load matches.",
          );
          setMatches([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMatches();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  const matchCount = matches.length;

  return (
    <div ref={panelRef} className="pointer-events-none fixed bottom-4 right-4 z-50 sm:bottom-5 sm:right-5">
      {open ? (
        <section
          id="upcoming-matches-panel"
          className="pointer-events-auto mb-3 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0f]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
          aria-label="Upcoming World Cup matches"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Upcoming Matches</p>
              <p className="text-[11px] text-zinc-500">Next 4 · Dhaka time (BDT)</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-white/10 p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-white"
              aria-label="Close matches panel"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="max-h-[min(52vh,420px)] overflow-y-auto px-3 py-3">
            {loading ? <MatchesSkeleton /> : null}

            {!loading && error ? (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            ) : null}

            {!loading && !error && matchCount === 0 ? (
              <p className="rounded-xl border border-white/8 bg-white/3 px-3 py-4 text-center text-xs text-zinc-500">
                No upcoming World Cup matches right now.
              </p>
            ) : null}

            {!loading && !error && matchCount > 0 ? (
              <div className="space-y-2">
                {matches.map((match) => (
                  <MatchRow key={match.id} match={match} />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a0f]/90 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xl shadow-black/40 backdrop-blur-xl transition hover:border-rose-500/40 hover:bg-[#12121a]"
        aria-expanded={open}
        aria-controls="upcoming-matches-panel"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <FootballIcon />
        </span>
        <span className="hidden sm:inline">Matches</span>
        {!loading && !error && matchCount > 0 ? (
          <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {matchCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
