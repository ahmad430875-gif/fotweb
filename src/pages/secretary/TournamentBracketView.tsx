import { ArrowRight, CalendarClock, GitBranch } from 'lucide-react'

export type BracketFixture = {
  id: string
  home_team_id: string
  away_team_id: string
  home_score: number
  away_score: number
  match_status: string
  winner_team_id: string | null
  match_date: string | null
  next_match_id: string | null
  venue: string | null
}

export type BracketRound = {
  id: string
  name: string
  round_number: number
  fixtures: BracketFixture[]
}

export function TournamentBracketView({
  rounds,
  teamNames,
  fixtureNames,
  onSelectFixture,
}: {
  rounds: BracketRound[]
  teamNames: Record<string, string>
  fixtureNames: Record<string, string>
  onSelectFixture: (matchId: string) => void
}) {
  if (!rounds.length) {
    return <div className="tcc-empty-state"><GitBranch size={22} /><strong>No tournament rounds yet</strong><span>Create a stage and round to start building the bracket.</span></div>
  }

  return (
    <div className="tcc-bracket-scroll">
      <div className="tcc-bracket">
        {rounds.map((round) => (
          <section className="tcc-bracket-round" key={round.id}>
            <div className="tcc-round-heading">
              <span>ROUND {round.round_number}</span>
              <strong>{round.name}</strong>
            </div>
            <div className="tcc-round-matches">
              {round.fixtures.length ? round.fixtures.map((fixture) => {
                const home = teamNames[fixture.home_team_id] ?? 'Home team'
                const away = teamNames[fixture.away_team_id] ?? 'Away team'
                return (
                  <article className="tcc-bracket-match" id={`bracket-${fixture.id}`} key={fixture.id}>
                    <button type="button" className="tcc-match-select" onClick={() => onSelectFixture(fixture.id)} aria-label={`Manage ${home} versus ${away}`}>
                      <span className={`tcc-match-team ${fixture.winner_team_id === fixture.home_team_id ? 'tcc-match-winner' : ''}`}>
                        <span>{home}</span><strong>{fixture.home_score}</strong>
                      </span>
                      <span className={`tcc-match-team ${fixture.winner_team_id === fixture.away_team_id ? 'tcc-match-winner' : ''}`}>
                        <span>{away}</span><strong>{fixture.away_score}</strong>
                      </span>
                      <span className="tcc-match-meta">
                        <span>{fixture.match_status.replaceAll('_', ' ')}</span>
                        {fixture.match_date && <span><CalendarClock size={12} />{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(fixture.match_date))}</span>}
                      </span>
                    </button>
                    {fixture.next_match_id && (
                      <a className="tcc-progression" href={`#bracket-${fixture.next_match_id}`} onClick={() => onSelectFixture(fixture.next_match_id!)}>
                        <span>Progresses to {fixtureNames[fixture.next_match_id] ?? 'next fixture'}</span><ArrowRight size={13} />
                      </a>
                    )}
                  </article>
                )
              }) : <div className="tcc-round-empty">No fixtures in this round.</div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
