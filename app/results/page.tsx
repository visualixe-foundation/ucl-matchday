import {
  getLeaguePhaseMatches,
  getHighlights,
  isFinished,
  type Match,
  type Highlight
} from "@/lib/highlightly";
import { dayKeyEAT, formatDayLabelEAT } from "@/lib/time";
import MatchRow from "@/app/components/MatchRow";

export const revalidate = 21600;

const SUPERSPORT_UCL =
  "https://www.supersport.com/football/uefa-champions-league";

function formatHighlightDate(dateIso: string) {
  return new Date(dateIso).toLocaleDateString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Africa/Nairobi"
  });
}

export default async function ResultsPage() {
  let finished: Match[] = [];
  let highlights: Highlight[] = [];
  let errorMessage: string | null = null;

  try {
    const [window, hl] = await Promise.all([
      getLeaguePhaseMatches(),
      getHighlights().catch(() => [] as Highlight[])
    ]);
    finished = window
      .filter((m) => isFinished(m.state.description))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    highlights = hl;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Failed to load highlights.";
  }

  const byDay = finished.reduce<Record<string, Match[]>>((acc, m) => {
    const key = dayKeyEAT(m.date);
    acc[key] = acc[key] ?? [];
    acc[key].push(m);
    return acc;
  }, {});
  const dayKeys = Object.keys(byDay).sort();

  return (
    <div className="page wrap page--with-mobile-nav">
      <div className="page__heading">
        <h1>Highlights</h1>
        <a
          href={SUPERSPORT_UCL}
          className="external-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Watch on SuperSport →
        </a>
      </div>

      <p className="page__intro">
        Full-time scores below. For video highlights, open{" "}
        <a
          href={SUPERSPORT_UCL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-link"
        >
          SuperSport
        </a>
        .
      </p>

      {errorMessage && (
        <div className="empty-state">
          <strong>Couldn&apos;t load data</strong>
          {errorMessage}
        </div>
      )}

      {dayKeys.length > 0 && (
        <section className="matchday" style={{ marginBottom: 48 }}>
          <div className="matchday__label">Full-time results</div>
          {dayKeys.map((day) => (
            <div key={day} style={{ marginBottom: 20 }}>
              <div className="matchday__sublabel">{formatDayLabelEAT(day)}</div>
              {byDay[day].map((match) => (
                <MatchRow key={match.id} match={match} />
              ))}
            </div>
          ))}
        </section>
      )}

      {highlights.length > 0 && (
        <section className="matchday">
          <div className="matchday__label">Clips</div>
          {highlights.map((h) => (
            <article className="result-card" key={h.id}>
              <div className="result-card__meta">
                <div className="result-card__teams">{h.title}</div>
                <div className="result-card__date">{formatHighlightDate(h.date)}</div>
              </div>
              {h.embedUrl ? (
                <div className="result-card__video">
                  <iframe
                    src={h.embedUrl}
                    title={h.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <a href={h.url} target="_blank" rel="noopener noreferrer">
                  Watch highlight →
                </a>
              )}
            </article>
          ))}
        </section>
      )}

      <div className="supersport-cta">
        <a
          href={SUPERSPORT_UCL}
          target="_blank"
          rel="noopener noreferrer"
          className="supersport-cta__btn"
        >
          More UCL highlights on SuperSport →
        </a>
      </div>
    </div>
  );
}
