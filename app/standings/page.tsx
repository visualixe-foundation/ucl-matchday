import {
  getStandings,
  sortStandings,
  qualificationZone,
  type StandingRow
} from "@/lib/highlightly";

// Cache hard — standings barely change between matchdays
export const revalidate = 86400; // 24 hours

function gd(row: StandingRow) {
  return row.total.scoredGoals - row.total.receivedGoals;
}

function zoneClass(pos: number): string {
  const z = qualificationZone(pos);
  if (z === "r16") return "standings-row--r16";
  if (z === "playoff") return "standings-row--playoff";
  if (z === "out") return "standings-row--out";
  return "";
}

export default async function StandingsPage() {
  let errorMessage: string | null = null;
  let groups: { name: string; standings: StandingRow[] }[] = [];
  let leagueName = "Champions League";

  try {
    const data = await getStandings();
    if (data) {
      leagueName = data.league?.name ?? leagueName;
      groups = (data.groups ?? []).map((g) => ({
        name: g.name,
        standings: sortStandings(g.standings ?? [])
      }));
    }
  } catch (err) {
    // Cache error page — do not noStore (that re-hit the API on every visit)
    errorMessage = err instanceof Error ? err.message : "Failed to load standings.";
  }

  const quotaHit =
    errorMessage?.includes("429") ||
    errorMessage?.toLowerCase().includes("daily request");

  return (
    <div className="page wrap page--with-mobile-nav">
      <div className="page__heading">
        <h1>Standings</h1>
      </div>

      {!errorMessage && groups.length > 0 && (
        <div className="standings-legend">
          <span className="standings-legend__item standings-legend__item--r16">
            1–8 Round of 16
          </span>
          <span className="standings-legend__item standings-legend__item--playoff">
            9–24 Playoff
          </span>
          <span className="standings-legend__item standings-legend__item--out">
            25–36 Out
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="empty-state">
          <strong>
            {quotaHit ? "API daily limit reached" : "Couldn't load standings"}
          </strong>
          {quotaHit
            ? "Highlightly free tier is exhausted for today. Table returns after the daily reset (around 03:00 EAT)."
            : errorMessage}
        </div>
      )}

      {!errorMessage && groups.length === 0 && (
        <div className="empty-state">
          <strong>No standings yet</strong>
          Table data appears once the league phase is underway.
        </div>
      )}

      {groups.map((group) => (
        <section className="matchday" key={group.name}>
          <div className="matchday__label">{group.name || leagueName}</div>
          <div className="standings-scroll">
            <table className="standings-table">
              <thead>
                <tr>
                  <th className="standings-table__pos">#</th>
                  <th style={{ textAlign: "left" }}>Team</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GD</th>
                  <th className="standings-table__pts">Pts</th>
                </tr>
              </thead>
              <tbody>
                {group.standings.map((row) => (
                  <tr key={row.team.id} className={zoneClass(row.position)}>
                    <td className="standings-table__pos">{row.position}</td>
                    <td>
                      <a
                        href={`/team/${row.team.id}`}
                        className="standings-table__team-link"
                      >
                        {row.team.logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.team.logo}
                            alt=""
                            width={20}
                            height={20}
                            style={{ objectFit: "contain" }}
                          />
                        )}
                        <span className="standings-table__team">{row.team.name}</span>
                      </a>
                    </td>
                    <td>{row.total.games}</td>
                    <td>{row.total.wins}</td>
                    <td>{row.total.draws}</td>
                    <td>{row.total.loses}</td>
                    <td>{gd(row)}</td>
                    <td className="standings-table__pts">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
