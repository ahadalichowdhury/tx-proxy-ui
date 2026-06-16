const GAMES_API = "https://worldcup26.ir/get/games";
/** API local_date is US Eastern (WC 2026 host kickoff time). */
const SOURCE_TIMEZONE = "America/New_York";
const DISPLAY_TIMEZONE = "Asia/Dhaka";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const UPCOMING_MATCH_LIMIT = 4;

export type RawGame = {
  id: string;
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_team_label?: string;
  away_team_label?: string;
  home_score?: string;
  away_score?: string;
  group?: string;
  local_date?: string;
  finished?: string;
  time_elapsed?: string;
  type?: string;
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

type GamesResponse = {
  games?: RawGame[];
};

type CacheEntry = {
  expiresAt: number;
  matches: TodayMatch[];
  fetchedAt: string;
};

let memoryCache: CacheEntry | null = null;

function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utcMs));

    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? "0");

    const zonedYear = read("year");
    const zonedMonth = read("month");
    const zonedDay = read("day");
    const zonedHour = read("hour");
    const zonedMinute = read("minute");

    const desiredTotal = Date.UTC(year, month - 1, day, hour, minute);
    const actualTotal = Date.UTC(
      zonedYear,
      zonedMonth - 1,
      zonedDay,
      zonedHour,
      zonedMinute,
    );
    const diffMs = desiredTotal - actualTotal;

    if (diffMs === 0) {
      break;
    }

    utcMs += diffMs;
  }

  return new Date(utcMs);
}

function parseLocalDate(value: string | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, month, day, year, hour, minute] = match;
  const parsed = zonedWallClockToUtc(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    SOURCE_TIMEZONE,
  );

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

function parseScore(value: string | undefined): number | null {
  if (!value || value === "null") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function teamName(game: RawGame, side: "home" | "away"): string {
  if (side === "home") {
    return (
      game.home_team_name_en?.trim() ||
      game.home_team_label?.trim() ||
      "TBD"
    );
  }

  return (
    game.away_team_name_en?.trim() ||
    game.away_team_label?.trim() ||
    "TBD"
  );
}

function isFinished(game: RawGame): boolean {
  const finished = game.finished?.toUpperCase() === "TRUE";
  const elapsed = game.time_elapsed?.toLowerCase() ?? "";
  return finished || elapsed === "finished";
}

function matchStatus(game: RawGame): {
  status: TodayMatch["status"];
  statusLabel: string;
} {
  if (isFinished(game)) {
    return { status: "finished", statusLabel: "Full time" };
  }

  const elapsed = game.time_elapsed?.toLowerCase() ?? "";

  if (elapsed === "notstarted") {
    return { status: "upcoming", statusLabel: "Upcoming" };
  }

  if (elapsed) {
    return { status: "live", statusLabel: elapsed };
  }

  return { status: "upcoming", statusLabel: "Upcoming" };
}

export function mapGameToTodayMatch(game: RawGame, kickoff: Date): TodayMatch {
  const { status, statusLabel } = matchStatus(game);

  return {
    id: game.id,
    homeTeam: teamName(game, "home"),
    awayTeam: teamName(game, "away"),
    homeScore: parseScore(game.home_score),
    awayScore: parseScore(game.away_score),
    group: game.group?.trim() || game.type?.trim() || "—",
    status,
    statusLabel,
    kickoffDhaka: formatKickoffDhaka(kickoff),
    kickoffTimestamp: kickoff.getTime(),
  };
}

export function filterUpcomingMatches(
  games: RawGame[],
  limit = UPCOMING_MATCH_LIMIT,
): TodayMatch[] {
  return games
    .map((game) => {
      if (isFinished(game)) {
        return null;
      }

      const kickoff = parseLocalDate(game.local_date);
      if (!kickoff) {
        return null;
      }

      return mapGameToTodayMatch(game, kickoff);
    })
    .filter((match): match is TodayMatch => match !== null)
    .sort((left, right) => left.kickoffTimestamp - right.kickoffTimestamp)
    .slice(0, limit);
}

async function fetchAllGames(): Promise<RawGame[]> {
  const response = await fetch(GAMES_API, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      "User-Agent": "tv-proxy-ui/1.0",
    },
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    throw new Error(`Games API failed (${response.status})`);
  }

  const payload = (await response.json()) as GamesResponse;
  return payload.games ?? [];
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

  const games = await fetchAllGames();
  const matches = filterUpcomingMatches(games, limit);
  const fetchedAt = new Date().toISOString();

  memoryCache = {
    expiresAt: now + CACHE_TTL_MS,
    matches,
    fetchedAt,
  };

  return { matches, fetchedAt, fromCache: false };
}
