import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTeam,
  getLastFive,
  getTeamTablePosition,
  getLeaguePhaseMatches,
  parseScore,
  isFinished,
  isLive
} from "@/lib/highlightly";
import MatchRow from "@/app/components/MatchRow";

export const revalidate = 21600;

export default async function TeamPage({
  params
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const [team, form, tablePos, allMatches] = await Promise.all([
    getTeam(id),
    getLastFive(id),
    getTeamTablePosition(id),
    getLeaguePhaseMatches().catch(() => [])
  ]);
  if (!team) notFound();

  const finished = form.filter((m) => isFinished(m.state.description));
  const nextFixture = allMatches
    .filter(
      (m) =>
        (m.homeTeam.id === id || m.awayTeam.id === id) &&
        !isFinished(m.state.description) &&
        !isLive(m.state.description)
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  return (
    <div className="page wrap page--with-mobile-nav">
      <div className="page__heading">
        <h1 className="team-page__title">
          {team.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo} alt="" className="team-page__crest" />
          )}
          {team.name}
        </h1>
        <Link href="/standings" className="back-link">
          ← Standings
        </Link>
      </div>

      {tablePos && (
        <div className="team-meta">
          <div className="team-meta__item">
            <span className="team-meta__label">Position</span>
            <span className="team-meta__value">{tablePos.position}</span>
          </div>
          <div className="team-meta__item">
            <span className="team-meta__label">Points</span>
            <span className="team-meta__value">{tablePos.points}</span>
          </div>
          <div className="team-meta__item">
            <span className="team-meta__label">Played</span>
            <span className="team-meta__value">{tablePos.played}</span>
          </div>
        </div>
      )}

      {nextFixture && (
        <section className="matchday">
          <div className="matchday__label">Next fixture</div>
          <MatchRow match={nextFixture} />
        </section>
      )}

      <section className="matchday">
        <div className="matchday__label">Recent form</div>
        {finished.length === 0 && (
          <div className="empty-state">
            <strong>No recent results</strong>
            Form data appears once matches are finished.
          </div>
        )}
        {finished.map((m) => {
          const score = parseScore(m.state.score.current);
          const isHome = m.homeTeam.id === id;
          const gf = score ? (isHome ? score[0] : score[1]) : null;
          const ga = score ? (isHome ? score[1] : score[0]) : null;
          let result: "W" | "D" | "L" | null = null;
          if (gf != null && ga != null) {
            if (gf > ga) result = "W";
            else if (gf < ga) result = "L";
            else result = "D";
          }
          return (
            <div key={m.id} className="form-row">
              {result && (
                <span
                  className={`form-badge form-badge--${result.toLowerCase()}`}
                >
                  {result}
                </span>
              )}
              <div className="form-row__match">
                <MatchRow match={m} />
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
