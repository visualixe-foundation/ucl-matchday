import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getMatchById,
  getLineups,
  getMatchStatistics,
  getHeadToHead,
  isLive,
  isFinished,
  parseScore,
  type MatchEvent,
  type LineupSide,
  type LineupPlayer,
  type TeamStats,
  type Match
} from "@/lib/highlightly";
import { formatKickoffDateTime } from "@/lib/time";
import MatchRow from "@/app/components/MatchRow";
import LiveRefresh from "@/app/components/LiveRefresh";

export const revalidate = 3600;

function eventTeamName(e: MatchEvent): string {
  if (typeof e.team === "string") return e.team;
  return e.team?.name ?? "";
}

function eventPlayerName(e: MatchEvent): string {
  if (typeof e.player === "string") return e.player;
  return e.player?.name ?? "";
}

function eventTime(e: MatchEvent): string {
  if (e.time == null) return "";
  return typeof e.time === "number" ? `${e.time}'` : String(e.time);
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function isHomeEvent(
  e: MatchEvent,
  homeName: string,
  awayName: string
): boolean | null {
  const team = eventTeamName(e);
  if (!team) return null;
  const t = normalizeName(team);
  const h = normalizeName(homeName);
  const a = normalizeName(awayName);
  if (namesMatch(t, h)) return true;
  if (namesMatch(t, a)) return false;
  return null;
}

function eventMinuteSortKey(e: MatchEvent): number {
  if (e.time == null) return 999;
  if (typeof e.time === "number") return e.time;
  const m = String(e.time).match(/(\d+)/);
  return m ? Number(m[1]) : 999;
}

function eventTypeKey(e: MatchEvent): string {
  return (e.type || e.description || "").toLowerCase().trim();
}

function EventContent({ e }: { e: MatchEvent }) {
  const type = eventTypeKey(e);
  const player = eventPlayerName(e);
  const on = e.substituted?.trim() || null;

  if (type === "goal" || type.includes("goal")) {
    return (
      <span className="event-timeline__text">
        <span className="event-icon event-icon--ball" aria-hidden>
          ⚽
        </span>
        {player}
        {e.assist ? (
          <span className="event-timeline__assist"> ({e.assist})</span>
        ) : null}
      </span>
    );
  }

  if (type === "substitution" || type.includes("substitut")) {
    return (
      <span className="event-timeline__text event-timeline__text--sub">
        {on && (
          <span className="event-sub event-sub--in">
            <span className="event-icon event-icon--in" aria-label="on">
              ↑
            </span>
            {on}
          </span>
        )}
        {player && (
          <span className="event-sub event-sub--out">
            <span className="event-icon event-icon--out" aria-label="off">
              ↓
            </span>
            {player}
          </span>
        )}
        {!player && !on && <span>Substitution</span>}
      </span>
    );
  }

  if (type.includes("yellow")) {
    return (
      <span className="event-timeline__text">
        <span className="event-icon event-icon--yellow" aria-hidden>
          ▮
        </span>
        {player || "Yellow Card"}
      </span>
    );
  }
  if (type.includes("red")) {
    return (
      <span className="event-timeline__text">
        <span className="event-icon event-icon--red" aria-hidden>
          ▮
        </span>
        {player || "Red Card"}
      </span>
    );
  }

  const label = e.type?.trim() || e.description?.trim() || "Event";
  return (
    <span className="event-timeline__text">
      {player ? `${label} · ${player}` : label}
    </span>
  );
}

function playerLabel(p: LineupPlayer): string {
  const num = p.number != null ? `${p.number} ` : "";
  return `${num}${p.name}`;
}

function LineupBlock({ side, label }: { side: LineupSide; label: string }) {
  const rows = side.initialLineup ?? [];
  const bench = side.substitutes ?? [];
  const hasXi = rows.some((r) => r.length > 0);

  return (
    <div className="lineup-side">
      <div className="lineup-side__header">
        <span className="lineup-side__name">{side.name || label}</span>
        {side.formation && (
          <span className="lineup-side__formation">{side.formation}</span>
        )}
      </div>
      {hasXi && (
        <div className="lineup-xi">
          {rows.map((row, ri) => (
            <ul className="lineup-xi__row" key={ri}>
              {row.map((p, pi) => (
                <li className="lineup-xi__player" key={`${ri}-${pi}-${p.name}`}>
                  {playerLabel(p)}
                </li>
              ))}
            </ul>
          ))}
        </div>
      )}
      {bench.length > 0 && (
        <div className="lineup-bench">
          <div className="lineup-bench__label">Bench</div>
          <ul className="lineup-bench__list">
            {bench.map((p, i) => (
              <li key={`b-${i}-${p.name}`}>{playerLabel(p)}</li>
            ))}
          </ul>
        </div>
      )}
      {!hasXi && bench.length === 0 && (
        <p className="lineup-empty">Lineup not available</p>
      )}
    </div>
  );
}

function statLabel(s: { displayName?: string; name?: string }) {
  return s.displayName || s.name || "Stat";
}

function toNum(v: number | string): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}

function StatsBlock({
  stats,
  homeId
}: {
  stats: TeamStats[];
  homeId: number;
}) {
  const home = stats.find((s) => s.team.id === homeId) ?? stats[0];
  const away =
    stats.find((s) => s.team.id !== home?.team.id) ?? stats[1] ?? stats[0];
  if (!home || !away) return null;

  const labels = new Map<string, true>();
  for (const s of home.statistics ?? []) labels.set(statLabel(s), true);
  for (const s of away.statistics ?? []) labels.set(statLabel(s), true);

  const preferred = [
    "Ball Possession",
    "Possession",
    "Total Shots",
    "Shots",
    "Shots on Goal",
    "Shots on Target",
    "Corner Kicks",
    "Corners",
    "Fouls",
    "Yellow Cards",
    "Red Cards",
    "Offsides",
    "Passes",
    "Pass Accuracy"
  ];

  const ordered = [
    ...preferred.filter((p) => labels.has(p)),
    ...Array.from(labels.keys()).filter((l) => !preferred.includes(l))
  ].slice(0, 12);

  const val = (side: TeamStats, label: string) => {
    const item = (side.statistics ?? []).find((s) => statLabel(s) === label);
    return item?.value ?? 0;
  };

  return (
    <section className="match-detail__stats">
      <h2 className="matchday__label">Statistics</h2>
      <ul className="stats-list">
        {ordered.map((label) => {
          const hv = toNum(val(home, label));
          const av = toNum(val(away, label));
          const total = hv + av || 1;
          const hPct = Math.round((hv / total) * 100);
          const aPct = 100 - hPct;
          return (
            <li className="stats-row" key={label}>
              <div className="stats-row__values">
                <span>{val(home, label)}</span>
                <span className="stats-row__label">{label}</span>
                <span>{val(away, label)}</span>
              </div>
              <div className="stats-row__bar">
                <div
                  className="stats-row__fill stats-row__fill--home"
                  style={{ width: `${hPct}%` }}
                />
                <div
                  className="stats-row__fill stats-row__fill--away"
                  style={{ width: `${aPct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export async function generateMetadata({
  params
}: {
  params: { id: string };
}): Promise<Metadata> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return { title: "Match" };
  const match = await getMatchById(id);
  if (!match) return { title: "Match" };
  const score = parseScore(match.state.score.current);
  const title = score
    ? `${match.homeTeam.name} ${score[0]}–${score[1]} ${match.awayTeam.name}`
    : `${match.homeTeam.name} vs ${match.awayTeam.name}`;
  const description = match.round
    ? `${title} · ${match.round} · UEFA Champions League`
    : `${title} · UEFA Champions League`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description }
  };
}

export default async function MatchPage({
  params
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const matchProbe = await getMatchById(id);
  if (!matchProbe) notFound();
  const liveProbe = isLive(matchProbe.state.description);

  const [match, lineups, stats, h2h] = await Promise.all([
    getMatchById(id, liveProbe),
    getLineups(id),
    getMatchStatistics(id),
    getHeadToHead(matchProbe.homeTeam.id, matchProbe.awayTeam.id)
  ]);
  if (!match) notFound();

  const score = parseScore(match.state.score.current);
  const live = isLive(match.state.description);
  const finished = isFinished(match.state.description);
  const status = live
    ? match.state.clock != null
      ? `${match.state.clock}'`
      : match.state.description
    : finished
      ? "Full time"
      : formatKickoffDateTime(match.date);

  const events = [...(match.events ?? [])].sort(
    (a, b) => eventMinuteSortKey(a) - eventMinuteSortKey(b)
  );

  const showLineups =
    lineups &&
    (lineups.homeTeam?.initialLineup?.length ||
      lineups.awayTeam?.initialLineup?.length ||
      lineups.homeTeam?.substitutes?.length ||
      lineups.awayTeam?.substitutes?.length);

  const h2hFinished = h2h
    .filter((m) => isFinished(m.state.description))
    .slice(0, 5);

  return (
    <div className="page wrap page--with-mobile-nav">
      <LiveRefresh active={live} />
      <div className="page__heading">
        <h1 className="match-detail__title">Match</h1>
        <Link href="/" className="back-link">
          ← Fixtures
        </Link>
      </div>

      <div className="tv-board">
        <div className="tv-board__badge">UEFA Champions League</div>
        {match.round && <div className="tv-board__round">{match.round}</div>}
        <div className={`tv-board__status ${live ? "tv-board__status--live" : ""}`}>
          {live && <span className="live-banner__dot" />}
          {status}
        </div>
        <div className="tv-board__scoreboard">
          <Link href={`/team/${match.homeTeam.id}`} className="tv-board__side">
            {match.homeTeam.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={match.homeTeam.logo} alt="" className="tv-board__crest" />
            )}
            <span className="tv-board__name">{match.homeTeam.name}</span>
          </Link>
          <div className="tv-board__score">
            {score ? (
              <>
                <span>{score[0]}</span>
                <span className="tv-board__sep">–</span>
                <span>{score[1]}</span>
              </>
            ) : (
              <span className="tv-board__vs">vs</span>
            )}
            {match.state.score.penalties && (
              <div className="tv-board__pens">Pens {match.state.score.penalties}</div>
            )}
          </div>
          <Link href={`/team/${match.awayTeam.id}`} className="tv-board__side">
            {match.awayTeam.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={match.awayTeam.logo} alt="" className="tv-board__crest" />
            )}
            <span className="tv-board__name">{match.awayTeam.name}</span>
          </Link>
        </div>
        {(match.venue?.name || match.referee?.name) && (
          <div className="tv-board__meta">
            {match.venue?.name && (
              <span>
                {match.venue.name}
                {match.venue.city ? `, ${match.venue.city}` : ""}
              </span>
            )}
            {match.referee?.name && <span>Ref: {match.referee.name}</span>}
          </div>
        )}
      </div>

      <div className="match-detail match-detail--below-tv">
        {stats && stats.length >= 2 && (
          <StatsBlock stats={stats} homeId={match.homeTeam.id} />
        )}

        {showLineups && lineups && (
          <section className="match-detail__lineups">
            <h2 className="matchday__label">Lineups</h2>
            <div className="lineups-grid">
              {lineups.homeTeam && (
                <LineupBlock side={lineups.homeTeam} label={match.homeTeam.name} />
              )}
              {lineups.awayTeam && (
                <LineupBlock side={lineups.awayTeam} label={match.awayTeam.name} />
              )}
            </div>
          </section>
        )}

        {events.length > 0 && (
          <section className="match-detail__events">
            <h2 className="matchday__label">Events</h2>
            <div className="event-timeline__legend">
              <span className="event-timeline__legend-home">
                {match.homeTeam.name}
              </span>
              <span className="event-timeline__legend-mid">&apos;</span>
              <span className="event-timeline__legend-away">
                {match.awayTeam.name}
              </span>
            </div>
            <ul className="event-timeline">
              {events.map((e, i) => {
                const side = isHomeEvent(
                  e,
                  match.homeTeam.name,
                  match.awayTeam.name
                );
                const sideClass =
                  side === true
                    ? "event-timeline__row--home"
                    : side === false
                      ? "event-timeline__row--away"
                      : "event-timeline__row--neutral";
                return (
                  <li key={i} className={`event-timeline__row ${sideClass}`}>
                    <div className="event-timeline__home">
                      {side === true && <EventContent e={e} />}
                    </div>
                    <div className="event-timeline__minute">{eventTime(e)}</div>
                    <div className="event-timeline__away">
                      {side === false && <EventContent e={e} />}
                      {side === null && (
                        <span className="event-timeline__text event-timeline__text--muted">
                          <EventContent e={e} />
                          {eventTeamName(e) ? ` · ${eventTeamName(e)}` : ""}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {h2hFinished.length > 0 && (
          <section className="match-detail__h2h">
            <h2 className="matchday__label">Head to head</h2>
            {h2hFinished.map((m: Match) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
