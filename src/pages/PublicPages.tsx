import { useEffect, useRef, useState } from 'react'
import { ArrowDownRight, ArrowRight, CalendarDays, ChevronDown, ChevronRight, CircleDot, Goal, MapPin, Search, ShieldCheck, SlidersHorizontal, Trophy, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FootballLogo } from '../components/FootballLogo'
import { PwaInstallButton } from '../components/PwaInstallPrompt'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { publicImageUrl } from '../lib/imageUrl'

type PublicCompetition = {
  id: string
  name: string
  season: string
  type: string
  start_date: string
  end_date: string
  ended_at: string | null
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

type MatchFilter = 'all' | 'upcoming' | 'results' | 'delayed'
type MatchSort = 'time' | 'priority'

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
        supabase.from('competitions').select('id, name, season, type, start_date, end_date, ended_at, venue, format, university_id, description').eq('status', 'published').order('start_date', { ascending: false }),
        supabase.from('universities').select('id, name, short_name, logo_url, location').eq('is_active', true).order('name'),
        supabase.from('teams').select('id, name, short_name, logo_url'),
        supabase.from('matches').select('id, competition_id, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, round, venue, published_at').not('published_at', 'is', null).order('kickoff_at', { ascending: true }),
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

type PublicSearchResult = { id: string; name: string; kind: string; detail: string; path: string }

function PublicHeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  useEffect(() => {
    const term = query.trim()
    if (!open || term.length < 2) {
      setResults([])
      setLoading(false)
      setError('')
      return
    }

    let active = true
    setResults([])
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!supabase) {
          if (active) {
            setLoading(false)
            setError('Search is temporarily unavailable.')
          }
          return
        }
        const pattern = `%${term}%`
        const [universities, universityShortNames, teams, teamShortNames, competitions, players] = await Promise.all([
          supabase.from('universities').select('id, name, short_name').eq('is_active', true).ilike('name', pattern).limit(5),
          supabase.from('universities').select('id, name, short_name').eq('is_active', true).ilike('short_name', pattern).limit(5),
          supabase.from('teams').select('id, name, short_name').ilike('name', pattern).limit(5),
          supabase.from('teams').select('id, name, short_name').ilike('short_name', pattern).limit(5),
          supabase.from('competitions').select('id, name, season, format').eq('status', 'published').ilike('name', pattern).limit(5),
          supabase.from('public_player_profiles').select('id, full_name, position, academic_program').ilike('full_name', pattern).limit(5),
        ])
        if (!active) return
        const failed = [universities, universityShortNames, teams, teamShortNames, competitions, players].find((result) => result.error)
        if (failed?.error) {
          setLoading(false)
          setError('Search is temporarily unavailable.')
          return
        }

        const uniqueRows = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((row) => [row.id, row])).values()]
        setResults([
          ...uniqueRows([...(universities.data ?? []), ...(universityShortNames.data ?? [])]).map((row) => ({
            id: row.id,
            name: row.name,
            kind: 'University',
            detail: row.short_name,
            path: `/universities/${row.id}`,
          })),
          ...uniqueRows([...(teams.data ?? []), ...(teamShortNames.data ?? [])]).map((row) => ({
            id: row.id,
            name: row.name,
            kind: 'Team',
            detail: row.short_name,
            path: `/teams/${row.id}`,
          })),
          ...(competitions.data ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            kind: row.format === 'league' ? 'League' : 'Competition',
            detail: row.season,
            path: `/competitions/${row.id}`,
          })),
          ...(players.data ?? []).map((row) => ({
            id: row.id,
            name: row.full_name,
            kind: 'Player',
            detail: [row.position, row.academic_program].filter(Boolean).join(' · '),
            path: `/players/${row.id}`,
          })),
        ])
        setLoading(false)
      })()
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [open, query])

  return <div className="public-header-search" ref={rootRef}>
    <button
      className="public-search-toggle"
      type="button"
      aria-label={open ? 'Close search' : 'Search FOTWEB'}
      aria-expanded={open}
      aria-controls="public-header-search-panel"
      onClick={() => setOpen((current) => !current)}
    >
      {open ? <X size={18} /> : <Search size={18} />}
    </button>
    {open && <div className="public-header-search-panel" id="public-header-search-panel" role="region" aria-label="Search profiles">
      <label className="public-header-search-field">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search universities, teams, competitions, and players</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search FOTWEB"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
        />
      </label>
      {loading && <p className="public-search-status">Searching…</p>}
      {error && <p className="public-search-status" role="status">{error}</p>}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && <p className="public-search-status">No matching profiles.</p>}
      {results.length > 0 && <div className="public-search-results">
        {results.map((result) => <Link className="public-search-result" to={result.path} key={`${result.kind}-${result.id}`} onClick={() => setOpen(false)}>
          <span className="public-search-result-copy"><strong>{result.name}</strong><small>{result.detail || result.kind}</small></span>
          <span className="public-search-result-kind">{result.kind}</span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>)}
      </div>}
    </div>}
  </div>
}

export function PublicFrame({ children, showSearch = false }: { children: React.ReactNode; showSearch?: boolean }) {
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
        {showSearch && <PublicHeaderSearch />}
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
  const [liveOnly, setLiveOnly] = useState(false)
  const [matchSort, setMatchSort] = useState<MatchSort>('time')
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [collapsedCompetitions, setCollapsedCompetitions] = useState<Set<string>>(() => new Set())
  const filteredMatches = data.matches.filter((match) => {
    if (liveOnly && !['live', 'half_time'].includes(match.status)) return false
    const matchesStatus = matchFilter === 'all'
      || matchFilter === 'upcoming' && ['scheduled', 'warm_up'].includes(match.status)
      || matchFilter === 'results' && match.status === 'full_time'
      || matchFilter === 'delayed' && ['postponed', 'cancelled'].includes(match.status)
    return matchesStatus && (!selectedDate || localDateKey(new Date(match.kickoff_at)) === selectedDate)
  })
  const visibleMatches = filteredMatches.sort((first, second) => matchSort === 'time'
    ? first.kickoff_at.localeCompare(second.kickoff_at)
    : matchPriority(first) - matchPriority(second) || first.kickoff_at.localeCompare(second.kickoff_at))
  const matchGroups = groupMatchesByCompetition(visibleMatches)

  function toggleCompetition(competitionId: string) {
    setCollapsedCompetitions((current) => {
      const next = new Set(current)
      if (next.has(competitionId)) next.delete(competitionId)
      else next.add(competitionId)
      return next
    })
  }

  return (
    <PublicFrame showSearch>
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
            <div className="public-home-install"><PwaInstallButton /></div>
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
            <div className="public-match-control-strip" role="group" aria-label="Match centre controls">
              <button className={`public-match-filter ${liveOnly ? 'public-match-filter-active' : ''}`} type="button" aria-pressed={liveOnly} onClick={() => setLiveOnly((current) => !current)}><span className="public-live-control-dot" />Live</button>
              <button className={`public-match-filter ${matchSort === 'time' ? 'public-match-filter-active' : ''}`} type="button" aria-pressed={matchSort === 'time'} onClick={() => setMatchSort((current) => current === 'time' ? 'priority' : 'time')}><CalendarDays size={13} />{matchSort === 'time' ? 'By time' : 'Live first'}</button>
              <button className={`public-match-filter ${filterOpen || matchFilter !== 'all' ? 'public-match-filter-active' : ''}`} type="button" aria-expanded={filterOpen} onClick={() => setFilterOpen((current) => !current)}><SlidersHorizontal size={13} />Filter</button>
            </div>
            <div className="public-match-days" role="group" aria-label="Filter fixtures by date">
              <button className={`public-match-day ${selectedDate === '' ? 'public-match-day-active' : ''}`} type="button" aria-pressed={selectedDate === ''} onClick={() => setSelectedDate('')}>All dates</button>
              {([-1, 0, 1] as const).map((offset) => {
                const day = dateOffset(offset)
                return <button className={`public-match-day ${selectedDate === day.value ? 'public-match-day-active' : ''}`} type="button" key={offset} aria-pressed={selectedDate === day.value} onClick={() => setSelectedDate(day.value)}>{day.label}</button>
              })}
              <label className="public-match-date-picker"><CalendarDays size={13} /><span className="sr-only">Choose match date</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Choose match date" /></label>
            </div>
            {filterOpen && <label className="public-match-filter-menu">Match status<select value={matchFilter} onChange={(event) => setMatchFilter(event.target.value as MatchFilter)}>
              <option value="all">All matches</option><option value="upcoming">Upcoming</option><option value="results">Results</option><option value="delayed">Postponed or cancelled</option>
            </select></label>}
          </div>
          {data.error && <PublicNotice message="Match data is temporarily unavailable." />}
          {!data.error && !data.loading && visibleMatches.length === 0 && (
            <div className="public-empty">
              <CircleDot size={20} />
              <strong>{matchFilter === 'all' ? 'No published fixtures yet' : `No ${matchFilter} matches`}</strong>
              <span>{matchFilter === 'all' ? 'Match schedules and results will appear here.' : 'Try another match filter.'}</span>
            </div>
          )}
          {data.loading ? <div className="public-loading">Loading the latest from campus football…</div> : <div className="public-match-groups">{matchGroups.map(([competitionId, matches]) => {
            const competition = data.competitions.find((item) => item.id === competitionId)
            const university = data.universities.find((item) => item.id === competition?.university_id)
            return <section className="public-match-group" key={competitionId}>
              <div className="public-match-group-heading">
                <Link className="public-match-group-link" to={`/competitions/${competitionId}`}>
                  <span className="public-match-group-mark"><Trophy size={16} /></span>
                  <span className="public-match-group-copy"><strong>{competition?.name ?? 'University football'}</strong><small>{university?.name ?? 'Competition fixtures'}</small></span>
                </Link>
                <span className="public-match-group-count">{matches.length}</span>
                <button className="public-match-collapse" type="button" aria-label={`${collapsedCompetitions.has(competitionId) ? 'Expand' : 'Collapse'} ${competition?.name ?? 'competition'} fixtures`} aria-expanded={!collapsedCompetitions.has(competitionId)} onClick={() => toggleCompetition(competitionId)}>{collapsedCompetitions.has(competitionId) ? <ChevronRight size={17} /> : <ChevronDown size={17} />}</button>
              </div>
              {!collapsedCompetitions.has(competitionId) && <div className="public-match-list">{matches.map((match) => <MatchRow key={match.id} match={match} teams={data.teams} />)}</div>}
            </section>
          })}</div>}
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
          <span className="public-overline">UNIVERSITY TOURNAMENT HISTORY</span>
          <h1>Competitions &amp; records</h1>
          <p>Explore university tournaments, results and player records from across the network.</p>
          <div className="public-directory-meta">
            <span><Trophy size={15} /> {data.loading ? 'Loading' : data.competitions.length} tournaments</span>
            <span>Current and completed records</span>
          </div>
        </section>
        <section className="public-directory-content" aria-label="University tournament history">
          <label className="public-search">
            <span className="sr-only">Search competitions</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search competition, season or university" />
          </label>
          {data.error ? <PublicNotice message="Competition data is temporarily unavailable." /> : data.loading ? <div className="public-loading">Loading tournament history…</div> : visible.length === 0 ? (
            <div className="public-empty">
              <Trophy size={20} />
              <strong>{data.competitions.length ? 'No matching competitions' : 'No tournament history yet'}</strong>
              <span>{data.competitions.length ? 'Try another search.' : 'University tournaments will appear here when they are published.'}</span>
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
                <Link className="public-university-card" to={`/universities/${university.id}`} key={university.id}>
                  <UniversityMark university={university} large />
                  <div>
                    <span className="public-overline">{university.short_name}</span>
                    <h2>{university.name}</h2>
                    <span className="public-location"><MapPin size={14} />{university.location}</span>
                  </div>
                  <span className="public-card-arrow"><ArrowRight size={16} /></span>
                </Link>
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
          <span className="public-season">{competition.ended_at ? `COMPLETED · ${competition.season}` : competition.season}</span>
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

function MatchRow({ match, teams }: { match: PublicMatch; teams: PublicTeam[] }) {
  const home = teams.find((team) => team.id === match.home_team_id)
  const away = teams.find((team) => team.id === match.away_team_id)
  const live = ['live', 'half_time'].includes(match.status)
  const finished = match.status === 'full_time'
  const state = live ? 'live' : finished ? 'finished' : ['postponed', 'cancelled'].includes(match.status) ? 'delayed' : 'upcoming'
  const status = match.status === 'half_time' ? 'HT' : live ? 'Live' : finished ? 'FT' : match.status === 'postponed' ? 'Postponed' : match.status === 'cancelled' ? 'Cancelled' : 'Upcoming'
  const showScore = live || finished
  const centerValue = showScore ? `${match.home_score} - ${match.away_score}` : formatKickoffClock(match.kickoff_at)
  const centerDetail = live
    ? match.round || 'In progress'
    : finished
      ? formatDate(match.kickoff_at)
      : [formatDate(match.kickoff_at), match.round || match.venue].filter(Boolean).join(' · ')

  return (
    <Link className={`public-match-card public-match-card-${state}`} to={`/matches/${match.id}`}>
      <div className="public-match-card-team public-match-card-home">
        <strong>{home?.name ?? 'Team to be announced'}</strong>
        <span className="public-team-crest">{home?.logo_url ? <img src={publicImageUrl(home.logo_url)} alt="" /> : (home?.short_name ?? 'TBC').slice(0, 3)}</span>
      </div>
      <div className="public-match-card-result">
        <span className={`public-match-state public-match-state-${state}`}>{live && <i />}{status}</span>
        <strong>{centerValue}</strong>
        <span>{centerDetail}</span>
      </div>
      <div className="public-match-card-team public-match-card-away">
        <span className="public-team-crest">{away?.logo_url ? <img src={publicImageUrl(away.logo_url)} alt="" /> : (away?.short_name ?? 'TBC').slice(0, 3)}</span>
        <strong>{away?.name ?? 'Team to be announced'}</strong>
      </div>
    </Link>
  )
}

function UniversityMark({ university, large = false }: { university?: PublicUniversity; large?: boolean }) {
  return (
    <span className={`public-university-mark ${large ? 'public-university-mark-large' : ''}`}>
      {university?.logo_url ? <img src={publicImageUrl(university.logo_url)} alt="" /> : <Goal size={large ? 23 : 16} />}
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

function formatKickoffClock(value: string) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateOffset(offset: -1 | 0 | 1) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const label = offset === -1 ? 'Yesterday' : offset === 0 ? 'Today' : 'Tomorrow'
  return { label, value: localDateKey(date) }
}

function groupMatchesByCompetition(matches: PublicMatch[]) {
  const groups = new Map<string, PublicMatch[]>()
  matches.forEach((match) => groups.set(match.competition_id, [...(groups.get(match.competition_id) ?? []), match]))
  return [...groups.entries()]
}

function matchPriority(match: PublicMatch) {
  if (match.status === 'live' || match.status === 'half_time') return 0
  if (match.status === 'scheduled' || match.status === 'warm_up') return 1
  return 2
}
