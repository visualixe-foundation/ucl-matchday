import { unstable_noStore as noStore } from "next/cache";
import {
  getLeaguePhaseMatches,
  getLastAndNextClusters,
  formatMatchdayRange,
  isFinished,
  isLive,
  type Match
} from "@/lib/highlightly";
import { dayKeyEAT, formatDayLabelEAT } from "@/lib/time";
import RefreshButton from "./components/RefreshButton";
import KickoffCountdown from "./components/KickoffCountdown";
import MatchRow from "./components/MatchRow";
import LiveRefresh from "./components/LiveRefresh";

// Matchdays need fresher data; also prevents a 6h-stuck "API limit" page
export const revalidate = 300;

function splitLastNext(matches: Match[], today: string) {
  const { last, next } = getLastAndNextClusters(today);
  const inDates = (m: Match, dates: string[]) => {
    const day = m.date.slice(0, 10);
    return dates.includes(day);
  };
  const lastMatches = last
    ? matches.filter((m) => inDates(m, last.dates) && isFinished(m.state.description))
    : [];
  const nextMatches = next
    ? matches.filter((m) => inDates(m, next.dates))
    : matches.filter((m) => !isFinished(m.state.description));
  return { last, next, lastMatches, nextMatches };
}

export default async function HomePage() {
  const today = new Date().toISOString().slice(0, 10);
  let matches: Match[] = [];
  let errorMessage: string | null = null;

  try {
    matches = await getLeaguePhaseMatches();
  } catch (err) {
    // Do not ISR-cache error/quota pages for hours
    noStore();
    errorMessage = err instanceof Error ? err.message : "Failed to load fixtures.";
  }

  const hasLive = matches.some((m) => isLive(m.state.description));
  const { last, next, lastMatches, nextMatches } = splitLastNext(matches, today);

  const byDay = (list: Match[]) => {
    const map = list.reduce<Record<string, Match[]>>((acc, m) => {
      const key = dayKeyEAT(m.date);
      acc[key] = acc[key] ?? [];
      acc[key].push(m);
      return acc;
    }, {});
    return Object.keys(map)
      .sort()
      .map((day) => ({ day, matches: map[day] }));
  };

  const nextMatch = matches
    .filter((m) => m.state.description.toLowerCase() === "not started")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  const quotaHit =
    errorMessage?.includes("429") ||
    errorMessage?.toLowerCase().includes("daily request");

  return (
    <div className="page wrap page--with-mobile-nav">
      <LiveRefresh active={hasLive} />
      <div className="page__heading">
        <h1>Fixtures &amp; live scores</h1>
        <RefreshButton />
      </div>

      {hasLive && (
        <div className="live-banner">
          <span className="live-banner__dot" /> Live matches — scores auto-refresh every minute
        </div>
      )}

      {nextMatch && (
        <KickoffCountdown
          targetIso={nextMatch.date}
          label={`${nextMatch.homeTeam.name} vs ${nextMatch.awayTeam.name}`}
        />
      )}

      {errorMessage && (
        <div className="empty-state">
          <strong>
            {quotaHit ? "API daily limit reached" : "Couldn't load fixtures"}
          </strong>
          {quotaHit
            ? "Highlightly free tier is exhausted for today. Scores return after the daily reset (around 03:00 EAT). Hard-refresh after that."
            : errorMessage}
        </div>
      )}

      {/* Last matchday first so the page is never blank between weeks */}
      {!errorMessage && last && (
        <section className="matchday">
          <div className="matchday__label">
            Last results · {last.label}
            <span className="matchday__range">
              {" "}
              · {formatMatchdayRange(last.dates)}
            </span>
          </div>
          {lastMatches.length === 0 ? (
            <p className="section-note">
              Scores for this matchday are not available right now.
            </p>
          ) : (
            byDay(lastMatches).map(({ day, matches: dayMatches }) => (
              <div key={day}>
                <div className="matchday__sublabel">{formatDayLabelEAT(day)}</div>
                {dayMatches.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            ))
          )}
        </section>
      )}

      {!errorMessage && next && (
        <section className="matchday">
          <div className="matchday__label">
            {next.label}
            <span className="matchday__range">
              {" "}
              · {formatMatchdayRange(next.dates)}
            </span>
          </div>
          {nextMatches.length === 0 ? (
            <p className="section-note">Fixtures appear closer to kickoff.</p>
          ) : (
            byDay(nextMatches).map(({ day, matches: dayMatches }) => (
              <div key={day}>
                <div className="matchday__sublabel">{formatDayLabelEAT(day)}</div>
                {dayMatches.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            ))
          )}
        </section>
      )}

      {!errorMessage && !next && !last && matches.length === 0 && (
        <div className="empty-state">
          <strong>Between matchdays</strong>
          Next league-phase fixtures load when scheduled. Check standings or SuperSport for
          highlights.
        </div>
      )}
    </div>
  );
}
