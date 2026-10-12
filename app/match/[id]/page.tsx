import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getMatchById,
  getLineups,
  isLive,
  isFinished,
  parseScore,
  type MatchEvent,
  type LineupSide,
  type LineupPlayer
} from "@/lib/highlightly";
import { formatKickoffDateTime } from "@/lib/time";

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

export default async function MatchPage({
  params
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const [match, lineups] = await Promise.all([
    getMatchById(id),
    getLineups(id)
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

  return (
    <div className="page wrap">
      <div className="page__heading">
        <h1 className="match-detail__title">Match</h1>
        <Link href="/" className="back-link">
          ← Fixtures
        </Link>
      </div>

      <div className="match-detail">
        <div
          className={`match-detail__status ${live ? "match-detail__status--live" : ""}`}
        >
          {status}
          {match.round && (
            <span className="match-detail__round">{match.round}</span>
          )}
        </div>

        <div className="match-detail__scoreboard">
          <Link href={`/team/${match.homeTeam.id}`} className="match-detail__side">
            {match.homeTeam.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={match.homeTeam.logo}
                alt=""
                className="match-detail__crest"
              />
            )}
            <span className="match-detail__name">{match.homeTeam.name}</span>
          </Link>
          <div className="match-detail__score">
            {score ? (
              <>
                <span>{score[0]}</span>
                <span className="match-detail__sep">–</span>
                <span>{score[1]}</span>
              </>
            ) : (
              <span className="match-detail__vs">vs</span>
            )}
            {match.state.score.penalties && (
              <div className="match-detail__pens">
                Pens {match.state.score.penalties}
              </div>
            )}
          </div>
          <Link
            href={`/team/${match.awayTeam.id}`}
            className="match-detail__side match-detail__side--away"
          >
            {match.awayTeam.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={match.awayTeam.logo}
                alt=""
                className="match-detail__crest"
              />
            )}
            <span className="match-detail__name">{match.awayTeam.name}</span>
          </Link>
        </div>

        {(match.venue?.name || match.referee?.name) && (
          <div className="match-detail__meta">
            {match.venue?.name && (
              <span>
                {match.venue.name}
                {match.venue.city ? `, ${match.venue.city}` : ""}
              </span>
            )}
            {match.referee?.name && <span>Ref: {match.referee.name}</span>}
          </div>
        )}

        {showLineups && (
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
      </div>
    </div>
  );
}
