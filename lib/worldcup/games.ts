const MATCHES_API =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const DISPLAY_TIMEZONE = "Asia/Dhaka";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const UPCOMING_MATCH_LIMIT = 4;
const LIVE_WINDOW_MS = 105 * 60 * 1000;

export type RawMatch = {
  round?: string;
  date?: string;
  time?: string;
  team1?: string;
  team2?: string;
  score?: { ft?: [number, number]; ht?: [number, number] };
  group?: string;
  ground?: string;
};

export type TodayMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  group: string;
  status: "upcoming" | "live" | "finished";
  statusLabel: string;
  kickoffDhaka: string;
  kickoffTimestamp: number;
};

type WorldCupResponse = {
  name?: string;
  matches?: RawMatch[];
};

type CacheEntry = {
  expiresAt: number;
  matches: TodayMatch[];
  fetchedAt: string;
};

let memoryCache: CacheEntry | null = null;

function parseUtcOffsetMinutes(value: string): number | null {
  const match = value.trim().match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/i);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return sign * (hours * 60 + minutes);
}

export function parseMatchKickoff(
  date: string | undefined,
  time: string | undefined,
): Date | null {
  if (!date?.trim() || !time?.trim()) {
    return null;
  }

  const dateMatch = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.trim().match(/^(\d{2}):(\d{2})\s+(UTC[+-]\d{1,2}(?::\d{2})?)$/i);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const [, year, month, day] = dateMatch;
  const [, hour, minute, offsetLabel] = timeMatch;
  const offsetMinutes = parseUtcOffsetMinutes(offsetLabel);

  if (offsetMinutes === null) {
    return null;
  }

  const utcMs =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ) -
    offsetMinutes * 60 * 1000;

  const parsed = new Date(utcMs);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatKickoffDhaka(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function normalizeGroup(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "—";
  }

  return trimmed.replace(/^Group\s+/i, "");
}

function matchId(match: RawMatch): string {
  return [
    match.date ?? "unknown-date",
    match.time ?? "unknown-time",
    match.team1 ?? "tbd",
    match.team2 ?? "tbd",
  ]
    .join("-")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function isFinished(match: RawMatch): boolean {
  const ft = match.score?.ft;
  return Array.isArray(ft) && ft.length === 2;
}

function matchStatus(
  match: RawMatch,
  kickoff: Date,
  now = Date.now(),
): {
  status: TodayMatch["status"];
  statusLabel: string;
} {
  if (isFinished(match)) {
    return { status: "finished", statusLabel: "Full time" };
  }

  const kickoffMs = kickoff.getTime();
  if (kickoffMs <= now && now - kickoffMs < LIVE_WINDOW_MS) {
    return { status: "live", statusLabel: "Live" };
  }

  return { status: "upcoming", statusLabel: "Upcoming" };
}

export function mapMatchToTodayMatch(
  match: RawMatch,
  kickoff: Date,
  now = Date.now(),
): TodayMatch {
  const { status, statusLabel } = matchStatus(match, kickoff, now);
  const ft = match.score?.ft;

  return {
    id: matchId(match),
    homeTeam: match.team1?.trim() || "TBD",
    awayTeam: match.team2?.trim() || "TBD",
    homeScore: ft?.[0] ?? null,
    awayScore: ft?.[1] ?? null,
    group: normalizeGroup(match.group) || match.round?.trim() || "—",
    status,
    statusLabel,
    kickoffDhaka: formatKickoffDhaka(kickoff),
    kickoffTimestamp: kickoff.getTime(),
  };
}

export function filterUpcomingMatches(
  matches: RawMatch[],
  limit = UPCOMING_MATCH_LIMIT,
  now = Date.now(),
): TodayMatch[] {
  return matches
    .map((match) => {
      if (isFinished(match)) {
        return null;
      }

      const kickoff = parseMatchKickoff(match.date, match.time);
      if (!kickoff) {
        return null;
      }

      if (kickoff.getTime() + LIVE_WINDOW_MS < now) {
        return null;
      }

      return mapMatchToTodayMatch(match, kickoff, now);
    })
    .filter((match): match is TodayMatch => match !== null)
    .sort((left, right) => left.kickoffTimestamp - right.kickoffTimestamp)
    .slice(0, limit);
}

async function fetchAllMatches(): Promise<RawMatch[]> {
  const response = await fetch(MATCHES_API, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      "User-Agent": "tv-proxy-ui/1.0",
    },
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    throw new Error(`World Cup matches API failed (${response.status})`);
  }

  const payload = (await response.json()) as WorldCupResponse;
  return payload.matches ?? [];
}

export async function getUpcomingMatches(options?: {
  forceRefresh?: boolean;
  limit?: number;
}): Promise<{ matches: TodayMatch[]; fetchedAt: string; fromCache: boolean }> {
  const now = Date.now();
  const limit = options?.limit ?? UPCOMING_MATCH_LIMIT;

  if (!options?.forceRefresh && memoryCache && memoryCache.expiresAt > now) {
    return {
      matches: memoryCache.matches,
      fetchedAt: memoryCache.fetchedAt,
      fromCache: true,
    };
  }

  const matches = await fetchAllMatches();
  const upcoming = filterUpcomingMatches(matches, limit, now);
  const fetchedAt = new Date().toISOString();

  memoryCache = {
    expiresAt: now + CACHE_TTL_MS,
    matches: upcoming,
    fetchedAt,
  };

  return { matches: upcoming, fetchedAt, fromCache: false };
}
