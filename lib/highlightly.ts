// Thin wrapper around the Highlightly Football API (UEFA Champions League).
//
// Free tier = 100 req/day. Prefer known matchday dates over scanning every day.

const SOURCE = process.env.HIGHLIGHTLY_SOURCE === "rapidapi" ? "rapidapi" : "direct";
const API_KEY = process.env.HIGHLIGHTLY_API_KEY;
const LEAGUE_ID = process.env.UCL_LEAGUE_ID || "2486";

const BASE_URL =
  SOURCE === "rapidapi"
    ? "https://football-highlights-api.p.rapidapi.com"
    : "https://soccer.highlightly.net";

const REVALIDATE_MATCHES = 6 * 60 * 60; // 6 hours
const REVALIDATE_MATCH = 60 * 60;
const REVALIDATE_LINEUPS = 24 * 60 * 60; // 24 hours — lineups don't change after the match
const REVALIDATE_STANDINGS = 24 * 60 * 60;
const REVALIDATE_HIGHLIGHTS = 12 * 60 * 60;
const REVALIDATE_TEAM = 24 * 60 * 60;

/** 2026/27 UCL league-phase matchday dates (from UEFA schedule). */
const UCL_MATCHDAY_DATES: string[] = [
  // Matchday 1
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  // Matchday 2
  "2026-10-13",
  "2026-10-14",
  // Matchday 3
  "2026-10-20",
  "2026-10-21",
  // Matchday 4
  "2026-11-03",
  "2026-11-04",
  // Matchday 5
  "2026-11-24",
  "2026-11-25",
  // Matchday 6
  "2026-12-08",
  "2026-12-09",
  // Matchday 7
  "2027-01-19",
  "2027-01-20",
  // Matchday 8
  "2027-01-27"
];

function headers(): HeadersInit {
  if (!API_KEY) {
    throw new Error(
      "Missing HIGHLIGHTLY_API_KEY. Add it to .env.local (see .env.local.example)."
    );
  }
  const h: HeadersInit = {
    "x-rapidapi-key": API_KEY
  };
  if (SOURCE === "rapidapi") {
    h["x-rapidapi-host"] = "football-highlights-api.p.rapidapi.com";
  }
  return h;
}

async function get<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  revalidate = REVALIDATE_MATCHES
): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    headers: headers(),
    next: { revalidate }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Highlightly ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

function currentSeason(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
}

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysUTC(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

type Team = {
  id: number;
  logo?: string;
  name: string;
  type?: string;
};

type MatchState = {
  description: string;
  clock?: number | null;
  score: {
    current: string | null;
    penalties?: string | null;
  };
};

export type Match = {
  id: number;
  round?: string;
  date: string;
  homeTeam: Team;
  awayTeam: Team;
  state: MatchState;
  venue?: { name?: string; city?: string };
  referee?: { name?: string };
  events?: MatchEvent[];
};

export type MatchEvent = {
  type?: string;
  time?: string | number;
  player?: string | { name?: string };
  team?: string | { name?: string };
  description?: string;
  substituted?: string | null;
  assist?: string | null;
};

export type Highlight = {
  id: number | string;
  title: string;
  date: string;
  embedUrl?: string;
  url: string;
  homeTeam?: string;
  awayTeam?: string;
  match?: { id?: number };
};

export type LineupPlayer = {
  id?: number;
  name: string;
  number: number;
  position: string;
};

export type LineupSide = {
  id: number;
  logo?: string;
  name: string;
  formation?: string;
  /** Rows of players; first row is always the goalkeeper. */
  initialLineup?: LineupPlayer[][];
  substitutes?: LineupPlayer[];
};

export type MatchLineups = {
  homeTeam?: LineupSide;
  awayTeam?: LineupSide;
};

export async function getMatches(date?: string): Promise<Match[]> {
  if (!LEAGUE_ID) return [];
  const day = date ?? new Date().toISOString().slice(0, 10);
  const data = await get<{ data?: Match[] } | Match[]>(
    "/matches",
    {
      leagueId: LEAGUE_ID,
      date: day,
      season: currentSeason(),
      timezone: "Etc/UTC"
    },
    REVALIDATE_MATCHES
  );
  return Array.isArray(data) ? data : data.data ?? [];
}

/**
 * Last completed + next upcoming league-phase matchday clusters only.
 */
export async function getLeaguePhaseMatches(): Promise<Match[]> {
  if (!LEAGUE_ID) return [];
  const today = new Date().toISOString().slice(0, 10);

  const past = UCL_MATCHDAY_DATES.filter((d) => d <= today).slice(-4);
  const upcoming = UCL_MATCHDAY_DATES.filter((d) => d > today).slice(0, 4);
  const dates = Array.from(new Set([...past, ...upcoming]));

  const start = new Date(today + "T00:00:00.000Z");
  for (let i = -1; i <= 2; i++) {
    dates.push(isoDateUTC(addDaysUTC(start, i)));
  }
  const unique = Array.from(new Set(dates)).sort();

  const results = await Promise.all(
    unique.map((d) => getMatches(d).catch(() => [] as Match[]))
  );
  const byId = new Map<number, Match>();
  for (const batch of results) {
    for (const m of batch) byId.set(m.id, m);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

export async function getMatchesWindow(
  startDate: string,
  days = 3,
  pastDays = 14
): Promise<Match[]> {
  if (!LEAGUE_ID) return [];
  const start = new Date(startDate + "T00:00:00.000Z");
  const back = Math.min(Math.max(pastDays, 0), 21);
  const forward = Math.min(Math.max(days, 1), 7);
  const offsets: number[] = [];
  for (let i = -back; i < forward; i++) offsets.push(i);

  const results = await Promise.all(
    offsets.map((i) =>
      getMatches(isoDateUTC(addDaysUTC(start, i))).catch(() => [] as Match[])
    )
  );
  const byId = new Map<number, Match>();
  for (const batch of results) {
    for (const m of batch) byId.set(m.id, m);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

export async function getMatchById(id: number): Promise<Match | null> {
  if (!LEAGUE_ID) return null;
  try {
    const data = await get<Match | Match[] | { data?: Match }>(
      `/matches/${id}`,
      {},
      REVALIDATE_MATCH
    );
    if (Array.isArray(data)) return data[0] ?? null;
    if (data && typeof data === "object" && "data" in data) {
      return (data as { data?: Match }).data ?? null;
    }
    return data as Match;
  } catch {
    return null;
  }
}

/** Starting XI + bench for one match. Returns null if unavailable. */
export async function getLineups(matchId: number): Promise<MatchLineups | null> {
  try {
    const data = await get<MatchLineups>(
      `/lineups/${matchId}`,
      {},
      REVALIDATE_LINEUPS
    );
    if (!data?.homeTeam && !data?.awayTeam) return null;
    return data;
  } catch {
    return null;
  }
}

export async function getHighlights(date?: string): Promise<Highlight[]> {
  if (!LEAGUE_ID) return [];
  const params: Record<string, string | number> = {
    leagueId: LEAGUE_ID,
    season: currentSeason()
  };
  if (date) params.date = date;
  const data = await get<{ data?: Highlight[] } | Highlight[]>(
    "/highlights",
    params,
    REVALIDATE_HIGHLIGHTS
  );
  return Array.isArray(data) ? data : data.data ?? [];
}

export async function getTeam(id: number): Promise<Team | null> {
  try {
    const data = await get<Team | Team[]>(`/teams/${id}`, {}, REVALIDATE_TEAM);
    if (Array.isArray(data)) return data[0] ?? null;
    return data;
  } catch {
    return null;
  }
}

export async function getLastFive(teamId: number): Promise<Match[]> {
  try {
    const data = await get<Match[] | { data?: Match[] }>(
      "/last-five-games",
      { teamId },
      REVALIDATE_MATCHES
    );
    return Array.isArray(data) ? data : data.data ?? [];
  } catch {
    return [];
  }
}

const LIVE_DESCRIPTIONS = [
  "first half",
  "second half",
  "half time",
  "extra time",
  "break time",
  "penalties",
  "in progress"
];

const FINISHED_DESCRIPTIONS = [
  "finished",
  "finished after penalties",
  "finished after extra time",
  "awarded",
  "ft",
  "full time",
  "full-time",
  "match finished",
  "ended"
];

export function isLive(description: string): boolean {
  const d = description.toLowerCase().trim();
  return LIVE_DESCRIPTIONS.some((x) => d === x || d.includes(x));
}

export function isFinished(description: string): boolean {
  const d = description.toLowerCase().trim();
  if (FINISHED_DESCRIPTIONS.some((x) => d === x || d.includes(x))) return true;
  return d.includes("finished");
}

export function parseScore(current: string | null): [number, number] | null {
  if (!current) return null;
  const m = current.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

type StandingsSplit = {
  wins: number;
  draws: number;
  games: number;
  loses: number;
  scoredGoals: number;
  receivedGoals: number;
};

export type StandingRow = {
  team: { id: number; logo?: string; name: string };
  total: StandingsSplit;
  home: StandingsSplit;
  away: StandingsSplit;
  points: number;
  position: number;
};

export type StandingsGroup = {
  name: string;
  standings: StandingRow[];
};

export type Standings = {
  groups: StandingsGroup[];
  league: { id: number; logo?: string; name: string; season: number };
};

export function sortStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.total.scoredGoals - a.total.receivedGoals;
    const gdB = b.total.scoredGoals - b.total.receivedGoals;
    if (gdB !== gdA) return gdB - gdA;
    return b.total.scoredGoals - a.total.scoredGoals;
  });
}

export async function getStandings(): Promise<Standings | null> {
  if (!LEAGUE_ID) return null;
  const data = await get<Standings>(
    "/standings",
    {
      leagueId: LEAGUE_ID,
      season: currentSeason()
    },
    REVALIDATE_STANDINGS
  );
  return data;
}
