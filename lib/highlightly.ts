// Thin wrapper around the Highlightly Football API (UEFA Champions League).
// Free tier = 100 req/day — cache aggressively; prefer known matchday dates.

const SOURCE = process.env.HIGHLIGHTLY_SOURCE === "rapidapi" ? "rapidapi" : "direct";
const API_KEY = process.env.HIGHLIGHTLY_API_KEY;
const LEAGUE_ID = process.env.UCL_LEAGUE_ID || "2486";

const BASE_URL =
  SOURCE === "rapidapi"
    ? "https://football-highlights-api.p.rapidapi.com"
    : "https://soccer.highlightly.net";

const REVALIDATE_MATCHES = 5 * 60;
const REVALIDATE_MATCH = 60 * 60;
const REVALIDATE_MATCH_LIVE = 60;
const REVALIDATE_LINEUPS = 24 * 60 * 60;
const REVALIDATE_STATS = 6 * 60 * 60;
const REVALIDATE_H2H = 24 * 60 * 60;
const REVALIDATE_STANDINGS = 60 * 60;
const REVALIDATE_HIGHLIGHTS = 12 * 60 * 60;
const REVALIDATE_TEAM = 24 * 60 * 60;

/** 2026/27 UCL league-phase matchday date clusters. */
export const UCL_MATCHDAY_CLUSTERS: { label: string; dates: string[] }[] = [
  { label: "Matchday 1", dates: ["2026-09-08", "2026-09-09", "2026-09-10"] },
  { label: "Matchday 2", dates: ["2026-10-13", "2026-10-14"] },
  { label: "Matchday 3", dates: ["2026-10-20", "2026-10-21"] },
  { label: "Matchday 4", dates: ["2026-11-03", "2026-11-04"] },
  { label: "Matchday 5", dates: ["2026-11-24", "2026-11-25"] },
  { label: "Matchday 6", dates: ["2026-12-08", "2026-12-09"] },
  { label: "Matchday 7", dates: ["2027-01-19", "2027-01-20"] },
  { label: "Matchday 8", dates: ["2027-01-27"] }
];

function headers(): HeadersInit {
  if (!API_KEY) {
    throw new Error(
      "Missing HIGHLIGHTLY_API_KEY. Add it to .env.local (see .env.local.example)."
    );
  }
  const h: HeadersInit = { "x-rapidapi-key": API_KEY };
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

export function formatMatchdayRange(dates: string[]): string {
  if (!dates.length) return "";
  const fmt = (iso: string) =>
    new Date(iso + "T12:00:00.000Z").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "Africa/Nairobi"
    });
  if (dates.length === 1) return fmt(dates[0]);
  return `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`;
}

export function getLastAndNextClusters(today = new Date().toISOString().slice(0, 10)) {
  let last: (typeof UCL_MATCHDAY_CLUSTERS)[0] | null = null;
  let next: (typeof UCL_MATCHDAY_CLUSTERS)[0] | null = null;
  for (const c of UCL_MATCHDAY_CLUSTERS) {
    const end = c.dates[c.dates.length - 1];
    if (end < today) last = c;
    else if (!next && c.dates[0] >= today) next = c;
    else if (!next && c.dates.some((d) => d >= today)) next = c;
  }
  const current = UCL_MATCHDAY_CLUSTERS.find((c) =>
    c.dates.some((d) => d === today)
  );
  if (current) next = current;
  return { last, next };
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
  initialLineup?: LineupPlayer[][];
  substitutes?: LineupPlayer[];
};

export type MatchLineups = {
  homeTeam?: LineupSide;
  awayTeam?: LineupSide;
};

export type StatItem = {
  value: number | string;
  displayName?: string;
  name?: string;
};

export type TeamStats = {
  team: { id: number; name: string; logo?: string };
  statistics: StatItem[];
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
 * Fetch matchday clusters with minimal API usage.
 * On a matchday (today in next cluster): only that cluster (usually 2 days).
 * Between matchdays: last + next.
 */
export async function getLeaguePhaseMatches(): Promise<Match[]> {
  if (!LEAGUE_ID) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { last, next } = getLastAndNextClusters(today);
  const onMatchday = Boolean(next?.dates.includes(today));

  // Prefer current matchday only while games are on — saves ~3 requests/day
  const dates = Array.from(
    new Set(
      onMatchday
        ? [...(next?.dates ?? [])]
        : [...(last?.dates ?? []), ...(next?.dates ?? [])]
    )
  ).sort();

  if (!dates.length) return [];

  const results = await Promise.all(
    dates.map(async (d) => {
      try {
        return { ok: true as const, matches: await getMatches(d) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false as const, error: msg, matches: [] as Match[] };
      }
    })
  );

  const failures = results.filter((r) => !r.ok);
  const byId = new Map<number, Match>();
  for (const batch of results) {
    for (const m of batch.matches) byId.set(m.id, m);
  }
  const matches = Array.from(byId.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (matches.length === 0 && failures.length === dates.length) {
    const sample = failures[0]?.error ?? "";
    if (sample.includes("429") || /daily request|rate limit/i.test(sample)) {
      throw new Error(
        "Highlightly 429: daily request limit reached. Resets around 03:00 EAT."
      );
    }
    throw new Error(sample || "Failed to load fixtures from Highlightly.");
  }

  return matches;
}

export async function getMatchById(
  id: number,
  live = false
): Promise<Match | null> {
  if (!LEAGUE_ID) return null;
  try {
    const data = await get<Match | Match[] | { data?: Match }>(
      `/matches/${id}`,
      {},
      live ? REVALIDATE_MATCH_LIVE : REVALIDATE_MATCH
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

export async function getLineups(matchId: number): Promise<MatchLineups | null> {
  try {
    const data = await get<MatchLineups>(`/lineups/${matchId}`, {}, REVALIDATE_LINEUPS);
    if (!data?.homeTeam && !data?.awayTeam) return null;
    return data;
  } catch {
    return null;
  }
}

export async function getMatchStatistics(
  matchId: number
): Promise<TeamStats[] | null> {
  try {
    const data = await get<TeamStats[] | { data?: TeamStats[] }>(
      `/statistics/${matchId}`,
      {},
      REVALIDATE_STATS
    );
    const list = Array.isArray(data) ? data : data.data ?? [];
    return list.length ? list : null;
  } catch {
    return null;
  }
}

export async function getHeadToHead(
  teamIdOne: number,
  teamIdTwo: number
): Promise<Match[]> {
  try {
    const data = await get<Match[] | { data?: Match[] }>(
      "/head-2-head",
      { teamIdOne, teamIdTwo },
      REVALIDATE_H2H
    );
    return Array.isArray(data) ? data : data.data ?? [];
  } catch {
    return [];
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

export function qualificationZone(position: number): "r16" | "playoff" | "out" | null {
  if (position <= 0) return null;
  if (position <= 8) return "r16";
  if (position <= 24) return "playoff";
  return "out";
}

export async function getStandings(): Promise<Standings | null> {
  if (!LEAGUE_ID) return null;
  const data = await get<Standings>(
    "/standings",
    { leagueId: LEAGUE_ID, season: currentSeason() },
    REVALIDATE_STANDINGS
  );
  return data;
}

export async function getTeamTablePosition(
  teamId: number
): Promise<{ position: number; points: number; played: number } | null> {
  try {
    const data = await getStandings();
    if (!data) return null;
    for (const g of data.groups ?? []) {
      const row = (g.standings ?? []).find((r) => r.team.id === teamId);
      if (row) {
        return {
          position: row.position,
          points: row.points,
          played: row.total.games
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
