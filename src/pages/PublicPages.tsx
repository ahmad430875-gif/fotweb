import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowRight, CalendarDays, CircleDot, Goal, MapPin, ShieldCheck, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FootballLogo } from '../components/FootballLogo'
import { supabase, supabaseConfigured } from '../lib/supabase'

type PublicCompetition = {
  id: string
  name: string
  season: string
  type: string
  start_date: string
  end_date: string
  venue: string | null
  format: string
  university_id: string
  description: string
}

type PublicUniversity = {
  id: string
  name: string
  short_name: string
  logo_url: string | null
  location: string
}

type PublicTeam = {
  id: string
  name: string
  short_name: string
  logo_url: string | null
}

type MatchFilter = 'all' | 'live' | 'upcoming' | 'results'

type PublicMatch = {
  id: string
  competition_id: string
  home_team_id: string
  away_team_id: string
  kickoff_at: string
  status: string
  home_score: number
  away_score: number
  round: string | null
  venue: string | null
  published_at: string | null
}

type PublicData = {
  competitions: PublicCompetition[]
  universities: PublicUniversity[]
  teams: PublicTeam[]
  matches: PublicMatch[]
  loading: boolean
  error: string
}

function usePublicData() {
  const [state, setState] = useState<PublicData>({
    competitions: [],
    universities: [],
    teams: [],
    matches: [],
    loading: true,
    error: '',
  })

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) {
        setState((current) => ({
          ...current,
          loading: false,
          error: supabaseConfigured ? '' : 'Connect Supabase to load public football data.',
        }))
        return
      }
      const [competitions, universities, teams, matches] = await Promise.all([
        supabase.from('competitions').select('id, name, season, type, start_date, end_date, venue, format, university_id, description').eq('status', 'published').order('start_date', { ascending: false }),
        supabase.from('universities').select('id, name, short_name, logo_url, location').eq('is_active', true).order('name'),
        supabase.from('teams').select('id, name, short_name, logo_url'),
        supabase.from('matches').select('id, competition_id, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, round, venue, published_at').not('published_at', 'is', null).order('kickoff_at', { ascending: false }).limit(12),
      ])
      if (!active) return
      const failed = competitions.error ?? universities.error ?? teams.error ?? matches.error
      setState({
        competitions: (competitions.data ?? []) as PublicCompetition[],
        universities: (universities.data ?? []) as PublicUniversity[],
        teams: (teams.data ?? []) as PublicTeam[],
        matches: (matches.data ?? []) as PublicMatch[],
        loading: false,
        error: failed?.message ?? '',
      })
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  return state
}

function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site">
      <header className="public-header">
        <Link className="public-brand" to="/" aria-label="FOTWEB home">
          <span className="public-brand-mark"><FootballLogo size={25} /></span>
          <span>FOTWEB<span>.</span></span>
        </Link>
        <nav className="public-nav" aria-label="Main navigation">
          <Link to="/competitions">Competitions</Link>
          <Link to="/universities">Universities</Link>
        </nav>
        <Link className="public-admin-link" to="/admin/login">
          <ShieldCheck size={15} />
          <span>Admin sign in</span>
          <ArrowRight size={14} />
        </Link>
      </header>
      {children}
      <footer className="public-footer">
        <Link className="public-footer-brand" to="/"><FootballLogo size={21} /> FOTWEB<span>.</span></Link>
        <span>University football, shared.</span>
        <Link to="/admin/login">Platform administration <ArrowRight size={13} /></Link>
      </footer>
    </div>
  )
}

export function PublicHomePage() {
  const data = usePublicData()
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all')
  const sortedMatches = [...data.matches].sort((first, second) => matchPriority(first) - matchPriority(second))
  const filteredMatches = sortedMatches.filter((match) => {
    if (matchFilter === 'live') return match.status === 'live' || match.status === 'half_time'
    if (matchFilter === 'upcoming') return match.status === 'scheduled' || match.status === 'warm_up'
    if (matchFilter === 'results') return match.status === 'full_time'
    return true
  })
  const featuredMatches = filteredMatches.slice(0, 4)

  return (
    <PublicFrame>
      <main>
        <section className="public-hero">
          <img className="public-hero-image" src="https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=2400&q=85" alt="Floodlit football stadium ready for a match" />
          <div className="public-hero-wash" />
          <div className="public-hero-content">
            <span className="public-kicker"><i /> UNIVERSITY FOOTBALL NETWORK</span>
            <h1>FOTWEB<span>.</span></h1>
            <p className="public-hero-lede">The game belongs to every campus.</p>
            <p className="public-hero-copy">Find the competitions, teams and match days bringing university football to life.</p>
            <div className="public-hero-actions">
              <Link className="public-button public-button-light" to="/competitions">Explore competitions <ArrowRight size={16} /></Link>
              <a className="public-text-link" href="#latest">See the latest <ArrowDownRight size={16} /></a>
            </div>
          </div>
          <div className="public-hero-index"><span>01</span><span>THE UNIVERSITY GAME</span></div>
          <div className="public-hero-stats" aria-label="Platform totals">
            <div><strong>{data.loading || data.error ? '—' : data.universities.length}</strong><span>universities</span></div>
            <div><strong>{data.loading || data.error ? '—' : data.competitions.length}</strong><span>published competitions</span></div>
            <div><strong>{data.loading || data.error ? '—' : data.matches.filter((match) => ['live', 'half_time'].includes(match.status)).length}</strong><span>live matches</span></div>
          </div>
        </section>

        <section className="public-section public-latest" id="latest">
          <div className="public-section-heading">
            <div><span className="public-overline">ON THE PITCH</span><h2>Match centre</h2></div>
            <Link className="public-inline-link" to="/competitions">Browse competitions <ArrowRight size={15} /></Link>
          </div>
          <div className="public-match-toolbar">
            <div className="public-match-filters" role="group" aria-label="Filter fixtures">
              {([{ label: 'All', value: 'all' }, { label: 'Live', value: 'live' }, { label: 'Upcoming', value: 'upcoming' }, { label: 'Results', value: 'results' }] as const).map((filter) => (
                <button className={`public-match-filter ${matchFilter === filter.value ? 'public-match-filter-active' : ''}`} type="button" key={filter.value} aria-pressed={matchFilter === filter.value} onClick={() => setMatchFilter(filter.value)}>
                  {filter.label}
                </button>
              ))}
            </div>
            <span className="public-match-sort"><CalendarDays size={14} /> By kickoff time</span>
          </div>
          {data.error && <PublicNotice message="Match data is temporarily unavailable." />}
          {!data.error && !data.loading && featuredMatches.length === 0 && (
            <div className="public-empty">
              <CircleDot size={20} />
              <strong>{matchFilter === 'all' ? 'No published fixtures yet' : `No ${matchFilter} matches`}</strong>
              <span>{matchFilter === 'all' ? 'Match schedules and results will appear here.' : 'Try another match filter.'}</span>
            </div>
          )}
          {data.loading ? <div className="public-loading">Loading the latest from campus football…</div> : <div className="public-match-list">{featuredMatches.map((match) => <MatchRow key={match.id} match={match} teams={data.teams} competitions={data.competitions} />)}</div>}
        </section>

        <section className="public-section public-competitions-section">
          <div className="public-section-heading">
            <div><span className="public-overline">THE SEASON</span><h2>Find your competition</h2></div>
            <Link className="public-inline-link" to="/competitions">All competitions <ArrowRight size={15} /></Link>
          </div>
          {data.error ? (
            <PublicNotice message="Competition data is temporarily unavailable." />
          ) : data.loading ? (
            <div className="public-loading">Loading published competitions…</div>
          ) : data.competitions.length === 0 ? (
            <div className="public-empty">
              <Trophy size={20} />
              <strong>The fixture list is taking shape</strong>
              <span>Published university competitions will be listed here.</span>
            </div>
          ) : (
            <div className="public-competition-grid">
              {data.competitions.slice(0, 3).map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} universities={data.universities} />
              ))}
            </div>
          )}
        </section>

        <section className="public-university-band">
          <div><span className="public-overline">ROOTED ON CAMPUS</span><h2>Every university has a story.</h2><p>Meet the institutions and places behind the teams.</p></div>
          <Link className="public-button public-button-dark" to="/universities">Explore universities <ArrowRight size={16} /></Link>
          <div className="public-university-count">
            <strong>{data.loading || data.error ? '—' : data.universities.length.toString().padStart(2, '0')}</strong>
            <span>on FOTWEB</span>
          </div>
        </section>
      </main>
    </PublicFrame>
  )
}

export function PublicCompetitionsPage() {
  const data = usePublicData()
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const visible = data.competitions.filter((competition) => {
    const university = data.universities.find((item) => item.id === competition.university_id)
    return `${competition.name} ${competition.season} ${competition.type} ${university?.name ?? ''}`.toLowerCase().includes(search)
  })

  return (
    <PublicFrame>
      <main className="public-directory">
        <section className="public-directory-heading">
          <span className="public-overline">THE SEASON, IN ONE PLACE</span>
          <h1>Competitions</h1>
          <p>Explore published university leagues, tournaments and campus rivalries.</p>
          <div className="public-directory-meta">
            <span><Trophy size={15} /> {data.loading ? 'Loading' : data.competitions.length} published</span>
            <span>Open to everyone</span>
          </div>
        </section>
        <section className="public-directory-content" aria-label="Published competitions">
          <label className="public-search">
            <span className="sr-only">Search competitions</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search competition, season or university" />
          </label>
          {data.error ? <PublicNotice message="Competition data is temporarily unavailable." /> : data.loading ? <div className="public-loading">Loading published competitions…</div> : visible.length === 0 ? (
            <div className="public-empty">
              <Trophy size={20} />
              <strong>{data.competitions.length ? 'No matching competitions' : 'No published competitions yet'}</strong>
              <span>{data.competitions.length ? 'Try another search.' : 'New competitions will appear here when they are published.'}</span>
            </div>
          ) : (
            <div className="public-competition-grid public-competition-grid-wide">
              {visible.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} universities={data.universities} />
              ))}
            </div>
          )}
        </section>
      </main>
    </PublicFrame>
  )
}

export function PublicUniversitiesPage() {
  const data = usePublicData()
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const visible = data.universities.filter((university) => `${university.name} ${university.short_name} ${university.location}`.toLowerCase().includes(search))

  return (
    <PublicFrame>
      <main className="public-directory">
        <section className="public-directory-heading">
          <span className="public-overline">THE CAMPUSES BEHIND THE GAME</span>
          <h1>Universities</h1>
          <p>Discover the places growing the next generation of university football.</p>
          <div className="public-directory-meta">
            <span><MapPin size={15} /> {data.loading ? 'Loading' : data.universities.length} active institutions</span>
            <span>Across the network</span>
          </div>
        </section>
        <section className="public-directory-content" aria-label="Active universities">
          <label className="public-search">
            <span className="sr-only">Search universities</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search university or location" />
          </label>
          {data.error ? <PublicNotice message="University data is temporarily unavailable." /> : data.loading ? <div className="public-loading">Loading active universities…</div> : visible.length === 0 ? (
            <div className="public-empty">
              <MapPin size={20} />
              <strong>{data.universities.length ? 'No matching universities' : 'No active universities yet'}</strong>
              <span>{data.universities.length ? 'Try another search.' : 'Active universities will appear here.'}</span>
            </div>
          ) : (
            <div className="public-university-grid">
              {visible.map((university) => (
                <article className="public-university-card" key={university.id}>
                  <UniversityMark university={university} large />
                  <div>
                    <span className="public-overline">{university.short_name}</span>
                    <h2>{university.name}</h2>
                    <span className="public-location"><MapPin size={14} />{university.location}</span>
                  </div>
                  <span className="public-card-arrow"><ArrowRight size={16} /></span>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </PublicFrame>
  )
}

function CompetitionCard({ competition, universities }: { competition: PublicCompetition; universities: PublicUniversity[] }) {
  const university = universities.find((item) => item.id === competition.university_id)
  
  return (
    <Link to={`/competitions/${competition.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <article className="public-competition-card">
        <div className="public-competition-top">
          <span className="public-type-tag">{formatLabel(competition.type)}</span>
          <span className="public-season">{competition.season}</span>
        </div>
        <h3>{competition.name}</h3>
        <div className="public-host">
          <UniversityMark university={university} />
          <span>{university?.name ?? 'University competition'}</span>
        </div>
        <p>{competition.description || `${formatLabel(competition.format)} · ${formatDate(competition.start_date)} to ${formatDate(competition.end_date)}`}</p>
        <div className="public-card-bottom">
          <span><CalendarDays size={14} />{formatDate(competition.start_date)}</span>
          <span>{formatLabel(competition.format)}</span>
        </div>
      </article>
    </Link>
  )
}

function MatchRow({ match, teams, competitions }: { match: PublicMatch; teams: PublicTeam[]; competitions: PublicCompetition[] }) {
  const home = teams.find((team) => team.id === match.home_team_id)
  const away = teams.find((team) => team.id === match.away_team_id)
  const competition = competitions.find((item) => item.id === match.competition_id)
  const live = ['live', 'half_time'].includes(match.status)
  const scored = live || match.status === 'full_time'
  const status = live ? (match.status === 'half_time' ? 'Half-time' : 'Live') : (match.status === 'full_time' ? 'Full time' : formatDate(match.kickoff_at))

  return (
    <article className="public-match-row">
      <div className="public-match-context">
        <span className={live ? 'public-live-label' : 'public-match-date'}>
          {live && <i />}
          {status}
        </span>
        <span>{competition?.name ?? 'University football'}</span>
      </div>
      <div className="public-match-teams">
        <div>
          <span className="public-team-crest">{home?.logo_url ? <img src={home.logo_url} alt="" /> : (home?.short_name ?? 'TBC').slice(0, 3)}</span>
          <strong>{home?.name ?? 'Team to be announced'}</strong>
        </div>
        <div>
          <span className="public-team-crest">{away?.logo_url ? <img src={away.logo_url} alt="" /> : (away?.short_name ?? 'TBC').slice(0, 3)}</span>
          <strong>{away?.name ?? 'Team to be announced'}</strong>
        </div>
      </div>
      <div className="public-match-score">
        <strong>{scored ? `${match.home_score} : ${match.away_score}` : 'v'}</strong>
        <span>{match.round || (match.venue ? match.venue : 'Match day')}</span>
      </div>
    </article>
  )
}

function UniversityMark({ university, large = false }: { university?: PublicUniversity; large?: boolean }) {
  return (
    <span className={`public-university-mark ${large ? 'public-university-mark-large' : ''}`}>
      {university?.logo_url ? <img src={university.logo_url} alt="" /> : <Goal size={large ? 23 : 16} />}
    </span>
  )
}

function PublicNotice({ message }: { message: string }) {
  return (
    <div className="public-notice" role="status">
      <CircleDot size={16} />
      <span>{message}</span>
    </div>
  )
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function matchPriority(match: PublicMatch) {
  if (match.status === 'live' || match.status === 'half_time') return 0
  if (match.status === 'scheduled' || match.status === 'warm_up') return 1
  return 2
}
