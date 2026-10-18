import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { publicImageUrl } from '../lib/imageUrl'

type BracketTeam = { id: string; name: string; logo_url: string | null }
export type PublicBracketFixture = {
  id: string
  match_id: string | null
  round_id: string
  home_team_id: string
  away_team_id: string
  home_score: number
  away_score: number
  match_status: string
  winner_team_id: string | null
  match_date: string | null
}
export type PublicBracketRound = { id: string; name: string; round_number: number; fixtures: PublicBracketFixture[] }
export type PublicBracketStage = { id: string; name: string; sequence_order: number; rounds: PublicBracketRound[] }

type DisplayRound = { id: string; name: string; fixtures: PublicBracketFixture[]; previousRoundName?: string; placeholderCount?: number }

export function PublicKnockoutBracket({ stages, teams }: { stages: PublicBracketStage[]; teams: Record<string, BracketTeam> }) {
  if (!stages.length) return <BracketEmpty message="Knockout fixtures have not been added yet." />

  return <div className="league-knockout-stages">{stages.map((stage) => {
    const actualRounds = [...stage.rounds].sort((first, second) => first.round_number - second.round_number)
    const displayRounds: DisplayRound[] = []
    let previousRoundName = ''
    let previousMatchCount = 0

    actualRounds.forEach((round) => {
      const matchCount = round.fixtures.length || Math.ceil(previousMatchCount / 2)
      displayRounds.push({
        id: round.id,
        name: round.name,
        fixtures: round.fixtures,
        previousRoundName,
        placeholderCount: round.fixtures.length ? 0 : matchCount,
      })
      if (matchCount) previousMatchCount = matchCount
      previousRoundName = round.name
    })

    const finalHasBye = previousRoundName.toLowerCase().includes('preliminary') && previousMatchCount === 1
    while (previousMatchCount > 1 || finalHasBye && !displayRounds.some((round) => round.name === 'Final')) {
      const matchCount = previousMatchCount > 1 ? Math.ceil(previousMatchCount / 2) : 1
      const name = projectedRoundName(matchCount)
      displayRounds.push({
        id: `${stage.id}-${name}`,
        name,
        fixtures: [],
        previousRoundName,
        placeholderCount: matchCount,
      })
      previousMatchCount = matchCount
      previousRoundName = name
      if (matchCount === 1) break
    }

    const finalRound = actualRounds.at(-1)
    const isFinalRound = Boolean(finalRound && /final/i.test(finalRound.name) && !/(quarter|semi|preliminary)/i.test(finalRound.name))
    const finalFixture = isFinalRound && finalRound?.fixtures.length === 1 ? finalRound.fixtures[0] : undefined
    const champion = finalFixture?.match_status === 'full_time' && finalFixture.winner_team_id
      ? teams[finalFixture.winner_team_id]
      : undefined

    return <section className="league-knockout-stage" key={stage.id}>
      <div className="league-section-heading"><div><span className="public-overline">KNOCKOUT BRACKET</span><h2>{stage.name}</h2></div><span className="league-team-total">{actualRounds.reduce((total, round) => total + round.fixtures.length, 0)} matches</span></div>
      {displayRounds.length ? <div className="league-knockout-scroll"><div className="league-knockout-bracket">
        {displayRounds.map((round) => <section className="league-knockout-round" key={round.id}>
          <h3>{round.name}</h3>
          <div className="league-knockout-round-matches">
            {round.fixtures.map((fixture) => <BracketMatch fixture={fixture} teams={teams} key={fixture.id} />)}
            {!round.fixtures.length && Array.from({ length: round.placeholderCount ?? 0 }, (_, index) => <article className="league-knockout-placeholder" key={`${round.id}-${index}`}>
              <span>{round.previousRoundName?.toLowerCase().includes('preliminary') ? 'Winner of preliminary round' : `Winner of ${round.previousRoundName || 'previous round'} ${index * 2 + 1}`}</span><strong>VS</strong><span>{round.previousRoundName?.toLowerCase().includes('preliminary') ? 'Group winner (bye)' : `Winner of ${round.previousRoundName || 'previous round'} ${index * 2 + 2}`}</span>
            </article>)}
            {!round.fixtures.length && !round.placeholderCount && <BracketEmpty message="Round awaiting qualifiers" />}
          </div>
        </section>)}
      </div></div> : <BracketEmpty message="Knockout rounds are ready for fixtures." />}
      {champion && <div className="league-knockout-champion"><Trophy size={22} /><span><small>FINAL · CHAMPION</small><strong>{champion.name}</strong></span>{champion.logo_url && <img src={publicImageUrl(champion.logo_url)} alt="" />}</div>}
    </section>
  })}</div>
}

function BracketMatch({ fixture, teams }: { fixture: PublicBracketFixture; teams: Record<string, BracketTeam> }) {
  const home = teams[fixture.home_team_id]
  const away = teams[fixture.away_team_id]
  const complete = fixture.match_status === 'full_time'
  return <Link className="league-knockout-match" to={`/matches/${fixture.match_id ?? fixture.id}`}>
    {[{ team: home, teamId: fixture.home_team_id, score: fixture.home_score }, { team: away, teamId: fixture.away_team_id, score: fixture.away_score }].map((entry) => {
      const winner = complete && fixture.winner_team_id === entry.teamId
      return <div className={`league-knockout-team ${winner ? 'league-knockout-team-winner' : ''}`} key={entry.teamId}>
        {entry.team?.logo_url ? <img src={publicImageUrl(entry.team.logo_url)} alt="" /> : <span className="league-knockout-team-mark">{entry.team?.name.slice(0, 2) ?? 'TBC'}</span>}
        <strong>{entry.team?.name ?? 'To be determined'}</strong>
        <b>{complete || ['live', 'half_time'].includes(fixture.match_status) ? entry.score : '—'}</b>
      </div>
    })}
    <small>{complete ? 'FT' : fixture.match_status.replaceAll('_', ' ')}{fixture.match_date ? ` · ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(fixture.match_date))}` : ''}</small>
  </Link>
}

function BracketEmpty({ message }: { message: string }) {
  return <div className="league-knockout-empty"><Trophy size={17} /><span>{message}</span></div>
}

function projectedRoundName(matchCount: number) {
  if (matchCount === 1) return 'Final'
  if (matchCount === 2) return 'Semi-finals'
  if (matchCount === 4) return 'Quarter-finals'
  return `Round of ${matchCount * 2}`
}