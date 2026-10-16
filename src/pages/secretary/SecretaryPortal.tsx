import { useEffect, useState, type FormEvent } from 'react'
import { BarChart3, Building2, CalendarDays, ChevronRight, CircleDot, GraduationCap, LayoutDashboard, LogOut, Megaphone, Menu, Newspaper, Radio, Settings, ShieldCheck, Table2, Trophy, Users } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { FootballLogo } from '../../components/FootballLogo'
import { supabase } from '../../lib/supabase'
import './SecretaryPortal.css'

type RecordKind = 'competitions' | 'teams' | 'players' | 'matches'
type Option = { label: string; value: string }
type Field = { name: string; label: string; type?: string; required?: boolean; options?: Option[]; full?: boolean; placeholder?: string }
type Row = Record<string, unknown>
type MatchRow = { id: string; home_team_id: string; away_team_id: string; competition_id: string; kickoff_at: string; status: string }

const navigation = [
  { to: '/secretary', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/secretary/team', label: 'University Team', icon: Building2 },
  { to: '/secretary/players', label: 'Players', icon: GraduationCap },
  { to: '/secretary/announcements', label: 'Squad Announcements', icon: Megaphone },
  { to: '/secretary/news', label: 'News Center', icon: Newspaper },
  { to: '/secretary/competitions', label: 'Competitions', icon: Trophy },
  { to: '/secretary/teams', label: 'All Teams', icon: Users },
  { to: '/secretary/matches', label: 'Fixtures & Results', icon: CalendarDays },
  { to: '/secretary/control-center', label: 'Tournament Control', icon: ShieldCheck },
  { to: '/secretary/live', label: 'Live Match Centre', icon: Radio },
  { to: '/secretary/standings', label: 'Standings', icon: Table2 },
  { to: '/secretary/statistics', label: 'Statistics', icon: BarChart3 },
  { to: '/secretary/settings', label: 'Settings', icon: Settings },
]

export function SecretaryLayout() {
  const { profile, session, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [universityName, setUniversityName] = useState('University workspace')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let active = true
    async function loadUniversity() {
      if (!supabase || !profile?.university_id) return
      const { data } = await supabase.from('universities').select('name').eq('id', profile.university_id).maybeSingle()
      if (active && data?.name) setUniversityName(data.name)
    }
    void loadUniversity()
    return () => { active = false }
  }, [profile?.university_id])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="secretary-shell">
      {mobileNavOpen && <button className="secretary-scrim" type="button" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`secretary-sidebar ${mobileNavOpen ? 'secretary-sidebar-open' : ''}`}>
        <Link className="secretary-brand" to="/secretary">
          <span className="secretary-brand-mark"><FootballLogo size={25} /></span>
          <span>FOTWEB<span>.</span><small>UNIVERSITY PORTAL</small></span>
        </Link>
        <div className="secretary-campus">
          <span className="secretary-campus-icon"><Building2 size={16} /></span>
          <span><strong>{universityName}</strong><small>Sports Secretary</small></span>
        </div>
        <span className="secretary-nav-label">CAMPUS OPERATIONS</span>
        <nav className="secretary-nav" aria-label="University portal navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `secretary-nav-link ${isActive ? 'secretary-nav-active' : ''}`}>
              <Icon size={17} /><span>{label}</span>{label !== 'Overview' && <ChevronRight className="secretary-nav-chevron" size={14} />}
            </NavLink>
          ))}
        </nav>
        <div className="secretary-sidebar-note"><span className="secretary-live-dot" /><span>University data is private to this workspace.</span></div>
        
        {/* Updated Account / Logout Card Section */}
        <div className="secretary-account flex flex-col gap-2 items-stretch">
          <div className="flex items-center gap-3">
            <span className="secretary-account-avatar">
              {(profile?.display_name || session?.user.email || 'S').slice(0, 1).toUpperCase()}
            </span>
            <span className="secretary-account-copy flex-1 min-w-0">
              <strong className="block truncate">{profile?.display_name || 'Sports Secretary'}</strong>
              <small className="block truncate text-gray-400">{session?.user.email}</small>
            </span>
          </div>
        </div>
      </aside>

      <div className="secretary-main">
        <header className="secretary-topbar">
          <div className="secretary-topbar-leading">
            <button className="icon-button secretary-menu-button" type="button" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}>
              <Menu size={19} />
            </button>
            <div className="secretary-breadcrumb">
              <span>University</span><span>/</span><strong>{navigation.find((item) => item.to === location.pathname)?.label ?? (location.pathname === '/secretary/news' ? 'News Center' : 'Operations')}</strong>
            </div>
          </div>
          <div className="secretary-topbar-actions"><span className="secretary-secure"><i /> University access</span><button className="button button-secondary portal-logout" type="button" disabled={signingOut} onClick={() => void handleSignOut()}><LogOut size={15} /><span>{signingOut ? 'Signing out…' : 'Log out'}</span></button></div>
        </header>
        <div className="secretary-content">
          <Outlet context={{ universityName }} />
        </div>
      </div>
    </div>
  )
}

export function SecretaryDashboardPage() {
  const { profile } = useAuth()
  const universityId = profile?.university_id
  const [counts, setCounts] = useState([0, 0, 0, 0])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  const [competitionNames, setCompetitionNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadDashboard() {
      if (!supabase || !universityId) { setLoading(false); return }
      const [competitions, teams, players, matchCount, upcoming, teamRows, competitionRows] = await Promise.all([
        supabase.from('competitions').select('id', { count: 'exact', head: true }).eq('university_id', universityId),
        supabase.from('teams').select('id', { count: 'exact', head: true }).eq('university_id', universityId),
        supabase.from('players').select('id', { count: 'exact', head: true }).eq('university_id', universityId),
        supabase.from('matches').select('id', { count: 'exact', head: true }).eq('university_id', universityId),
        supabase.from('matches').select('id, home_team_id, away_team_id, competition_id, kickoff_at, status').eq('university_id', universityId).gte('kickoff_at', new Date().toISOString()).order('kickoff_at').limit(5),
        supabase.from('teams').select('id, name').eq('university_id', universityId),
        supabase.from('competitions').select('id, name').eq('university_id', universityId),
      ])
      if (!active) return
      const failed = [competitions, teams, players, matchCount, upcoming, teamRows, competitionRows].find((result) => result.error)
      if (failed?.error) setError('Some university data could not be loaded. Refresh the page to try again.')
      setCounts([competitions.count ?? 0, teams.count ?? 0, players.count ?? 0, matchCount.count ?? 0])
      setMatches((upcoming.data ?? []) as MatchRow[])
      setTeamNames(Object.fromEntries((teamRows.data ?? []).map((row) => [row.id, row.name])))
      setCompetitionNames(Object.fromEntries((competitionRows.data ?? []).map((row) => [row.id, row.name])))
      setLoading(false)
    }
    void loadDashboard()
    return () => { active = false }
  }, [universityId])

  const metrics = [
    { label: 'Competitions', value: counts[0], icon: Trophy, tone: 'amber', href: '/secretary/competitions' },
    { label: 'Registered teams', value: counts[1], icon: Users, tone: 'green', href: '/secretary/teams' },
    { label: 'Player roster', value: counts[2], icon: GraduationCap, tone: 'blue', href: '/secretary/players' },
    { label: 'All fixtures', value: counts[3], icon: CalendarDays, tone: 'red', href: '/secretary/matches' },
  ]

  return (
    <section className="secretary-dashboard">
      <div className="secretary-heading">
        <div><span className="eyebrow">CAMPUS OPERATIONS</span><h1>University overview</h1><p>Your competitions, squads, players, and match schedule.</p></div>
        <Link className="button button-primary" to="/secretary/competitions"><Trophy size={15} /> New competition</Link>
      </div>
      {!supabase && <div className="inline-notice notice-warning"><CircleDot size={17} /><span>Connect Supabase to load university data.</span></div>}
      {error && <div className="inline-notice notice-error" role="alert">{error}</div>}
      <div className="secretary-metric-grid">
        {metrics.map(({ label, value, icon: Icon, tone, href }) => (
          <Link className="secretary-metric" to={href} key={label}>
            <span className={`secretary-metric-icon secretary-tone-${tone}`}><Icon size={18} /></span>
            <strong>{loading ? '—' : value.toLocaleString()}</strong><span>{label}</span>
            <ChevronRight className="secretary-metric-arrow" size={15} />
          </Link>
        ))}
      </div>
      <section className="secretary-panel secretary-fixtures">
        <div className="secretary-panel-heading">
          <div><span className="eyebrow">UP NEXT</span><h2>Upcoming fixtures</h2></div>
          <Link to="/secretary/matches">All fixtures <ChevronRight size={14} /></Link>
        </div>
        {loading ? <div className="secretary-empty">Loading fixtures…</div> : matches.length === 0 ? (
          <div className="secretary-empty">
            <CalendarDays size={22} /><strong>No upcoming fixtures</strong><span>Create a fixture to build your match calendar.</span>
            <Link className="button button-secondary" to="/secretary/matches">Schedule a match</Link>
          </div>
        ) : (
          <div className="secretary-fixture-list">
            {matches.map((match) => (
              <article className="secretary-fixture-row" key={match.id}>
                <span className="secretary-fixture-date">
                  {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(match.kickoff_at))}
                  <small>{new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(match.kickoff_at))}</small>
                </span>
                <span className="secretary-fixture-teams">
                  <strong>{teamNames[match.home_team_id] ?? 'Home side'} <i>vs</i> {teamNames[match.away_team_id] ?? 'Away side'}</strong>
                  <small>{competitionNames[match.competition_id] ?? 'University fixture'}</small>
                </span>
                <span className="secretary-match-status">{match.status.replaceAll('_', ' ')}</span>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="secretary-quick-links">
        <Link to="/secretary/teams"><Users size={17} /><span><strong>Register a team</strong><small>Set up a campus squad</small></span><ChevronRight size={15} /></Link>
        <Link to="/secretary/players"><GraduationCap size={17} /><span><strong>Add a player</strong><small>Build the university roster</small></span><ChevronRight size={15} /></Link>
      </div>
    </section>
  )
}

const optionSets: Record<string, Option[]> = {
  competitionType: [{ label: 'Inter-class', value: 'inter_class' }, { label: 'Inter-university', value: 'inter_university' }, { label: 'Inter-college', value: 'inter_college' }, { label: 'Other', value: 'other' }],
  competitionFormat: [{ label: 'League', value: 'league' }, { label: 'Group stage', value: 'group_stage' }, { label: 'Knockout', value: 'knockout' }, { label: 'League + knockout', value: 'league_knockout' }, { label: 'Round robin', value: 'round_robin' }],
  teamType: [{ label: 'University team', value: 'university_team' }, { label: 'Class team', value: 'class_team' }],
  academicYear: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'HO', 'PGr', 'Other'].map((value) => ({ label: value, value })),
  academicProgram: ['MBBS', 'BDS', 'DPT', 'Pharm-D', 'Nursing', 'Other'].map((value) => ({ label: value, value })),
  foot: [{ label: 'Right', value: 'right' }, { label: 'Left', value: 'left' }, { label: 'Both', value: 'both' }],
  position: ['Goalkeeper', 'Centre-back', 'Full-back', 'Wing-back', 'Defensive midfielder', 'Central midfielder', 'Attacking midfielder', 'Winger', 'Striker'].map((value) => ({ label: value, value })),
  injury: [{ label: 'Fit', value: 'fit' }, { label: 'Injured', value: 'injured' }, { label: 'Recovering', value: 'recovering' }],
  availability: [{ label: 'Available', value: 'true' }, { label: 'Unavailable', value: 'false' }],
  visibility: [{ label: 'Keep private', value: 'false' }, { label: 'Show publicly', value: 'true' }],
  enrollmentStatus: [{ label: 'Inactive / not confirmed', value: 'inactive' }, { label: 'Actively enrolled', value: 'active' }],
}

const fieldsByKind: Record<RecordKind, Field[]> = {
  competitions: [
    { name: 'name', label: 'Competition name', required: true },
    { name: 'season', label: 'Season', required: true, placeholder: '2026/27' },
    { name: 'type', label: 'Competition type', type: 'select', options: optionSets.competitionType, required: true },
    { name: 'format', label: 'Format', type: 'select', options: optionSets.competitionFormat, required: true },
    { name: 'start_date', label: 'Start date', type: 'date', required: true },
    { name: 'end_date', label: 'End date', type: 'date', required: true },
    { name: 'points_for_win', label: 'Points for win', type: 'number', required: true, placeholder: '3' },
    { name: 'points_for_draw', label: 'Points for draw', type: 'number', required: true, placeholder: '1' },
    { name: 'points_for_loss', label: 'Points for loss', type: 'number', required: true, placeholder: '0' },
    { name: 'venue', label: 'Primary venue', full: true },
  ],
  teams: [
    { name: 'name', label: 'Team name', required: true },
    { name: 'short_name', label: 'Short name', required: true },
    { name: 'type', label: 'Team type', type: 'select', options: optionSets.teamType, required: true },
    { name: 'academic_class', label: 'Class year', type: 'select', options: optionSets.academicYear },
    { name: 'batch_session', label: 'Batch / session', placeholder: 'e.g. 2024–2029' },
  ],
  players: [
    { name: 'full_name', label: 'Player full name', required: true, full: true },
    { name: 'student_identifier', label: 'Student ID / identifier' },
    { name: 'photo_url', label: 'Player photo URL', type: 'url' },
    { name: 'academic_program', label: 'Academic program', type: 'select', options: optionSets.academicProgram },
    { name: 'current_academic_year', label: 'Academic year', type: 'select', options: optionSets.academicYear },
    { name: 'batch_session', label: 'Batch / session', placeholder: 'e.g. 2024–2029' },
    { name: 'academic_enrollment_status', label: 'Academic enrollment', type: 'select', options: optionSets.enrollmentStatus, required: true },
    { name: 'height_cm', label: 'Height (cm)', type: 'number' },
    { name: 'position', label: 'Playing position', type: 'select', options: optionSets.position },
    { name: 'preferred_foot', label: 'Preferred foot', type: 'select', options: optionSets.foot },
    { name: 'injury_status', label: 'Injury status', type: 'select', options: optionSets.injury, required: true },
    { name: 'is_available', label: 'Match availability', type: 'select', options: optionSets.availability, required: true },
    { name: 'public_injury_status', label: 'Show injury status publicly', type: 'select', options: optionSets.visibility, required: true },
  ],
  matches: [
    { name: 'competition_id', label: 'Competition', type: 'select', required: true },
    { name: 'round', label: 'Round / matchday' },
    { name: 'home_team_id', label: 'Home team', type: 'select', required: true },
    { name: 'away_team_id', label: 'Away team', type: 'select', required: true },
    { name: 'kickoff_at', label: 'Kick-off', type: 'datetime-local', required: true },
    { name: 'venue', label: 'Venue' },
  ],
}

const pageCopy: Record<RecordKind, { title: string; description: string; table: string; select: string; order: string; columns: string[] }> = {
  competitions: { title: 'Competitions', description: 'Manage university-owned leagues, cups, formats, and seasons.', table: 'competitions', select: 'id, name, season, type, format, status, start_date, end_date, is_primary, is_locked', order: 'created_at', columns: ['name', 'season', 'type', 'status'] },
  teams: { title: 'Teams', description: 'Manage university and class teams, then register them in competitions.', table: 'teams', select: 'id, name, short_name, type, academic_class, batch_session, is_active, is_locked', order: 'name', columns: ['name', 'short_name', 'type', 'academic_class', 'batch_session', 'is_active'] },
  players: { title: 'Players', description: 'Edit one permanent student profile used across every team and competition.', table: 'players', select: 'id, full_name, student_identifier, photo_url, academic_program, current_academic_year, batch_session, academic_enrollment_status, height_cm, position, preferred_foot, injury_status, public_injury_status, is_available, is_active, is_locked', order: 'full_name', columns: ['full_name', 'academic_program', 'current_academic_year', 'batch_session', 'academic_enrollment_status', 'position', 'injury_status', 'is_available'] },
  matches: { title: 'Fixtures', description: 'Schedule, publish, and prepare fixtures for the live match centre.', table: 'matches', select: 'id, competition_id, home_team_id, away_team_id, kickoff_at, status, round, venue, referee, published_at, is_locked', order: 'kickoff_at', columns: ['kickoff_at', 'home_team_id', 'away_team_id', 'status'] },
}

const singularLabels: Record<RecordKind, string> = { competitions: 'competition', teams: 'team', players: 'player', matches: 'fixture' }

export function SecretaryRecordsPage({ kind }: { kind: RecordKind }) {
  const { profile, session } = useAuth()
  const universityId = profile?.university_id
  const config = pageCopy[kind]
  const [rows, setRows] = useState<Row[]>([])
  const [teamOptions, setTeamOptions] = useState<Option[]>([])
  const [competitionOptions, setCompetitionOptions] = useState<Option[]>([])
  const [teamRegistration, setTeamRegistration] = useState({ team_id: '', competition_id: '' })
  const [editingRow, setEditingRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadRows() {
    if (!supabase || !universityId) { setLoading(false); return }
    setLoading(true)
    const { data, error: loadError } = await supabase.from(config.table).select(config.select).eq('university_id', universityId).order(config.order, { ascending: kind === 'teams' || kind === 'players' }).limit(100)
    if (loadError) {
      setRows([])
      setError(loadError.message.includes('batch_session')
        ? 'The database is missing the batch/session fields. Apply migration 202610150003_academic_progression.sql in Supabase, then refresh this page.'
        : `Records could not be loaded: ${loadError.message}`)
    } else { setRows((data ?? []) as unknown as Row[]); setError('') }
    if (kind === 'matches' || kind === 'teams') {
      const [teams, competitions] = await Promise.all([
        supabase.from('teams').select('id, name').eq('university_id', universityId),
        supabase.from('competitions').select('id, name').eq('university_id', universityId),
      ])
      setTeamOptions((teams.data ?? []).map((team) => ({ label: team.name, value: team.id })))
      setCompetitionOptions((competitions.data ?? []).map((competition) => ({ label: competition.name, value: competition.id })))
    }
    setLoading(false)
  }

  useEffect(() => { void loadRows() }, [universityId, kind])

  function getFields() {
    return fieldsByKind[kind].map((field) => ({
      ...field,
      options: field.name === 'home_team_id' || field.name === 'away_team_id' ? teamOptions : field.name === 'competition_id' ? competitionOptions : field.options,
    }))
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId) return
    setError(''); setNotice(''); setBusy(true)
    const form = event.currentTarget
    const values = new FormData(form)
    const text = (name: string) => String(values.get(name) ?? '').trim()
    if (kind === 'teams' && text('type') === 'class_team' && !text('academic_class')) { setBusy(false); setError('Enter the class or cohort for this team.'); return }
    if (kind === 'matches' && text('home_team_id') === text('away_team_id')) { setBusy(false); setError('Choose two different teams.'); return }
    const payload = buildPayload(kind, values, universityId, session?.user.id ?? '')
    const updatePayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'created_by'))
    const saveResult = editingRow && kind === 'players'
      ? await supabase.from('players').update(updatePayload as never).eq('id', String(editingRow.id)).eq('university_id', universityId).select('id').single()
      : await supabase.from(config.table).insert(payload as never).select('id').single()
    setBusy(false)
    if (saveResult.error) { setError(friendlyRecordError(saveResult.error)); return }
    form.reset()
    setNotice(editingRow ? 'Player profile updated everywhere this permanent profile is used.' : `${singularLabels[kind][0].toUpperCase()}${singularLabels[kind].slice(1)} added.`)
    setEditingRow(null)
    await loadRows()
  }

  function editPlayer(row: Row) {
    setEditingRow(row)
    setError('')
    setNotice('')
  }

  async function registerTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId) return
    setBusy(true)
    setError('')
    setNotice('')
    const { error: registrationError } = await supabase.from('competition_teams').upsert({
      competition_id: teamRegistration.competition_id,
      team_id: teamRegistration.team_id,
      university_id: universityId,
    }, { onConflict: 'competition_id,team_id' })
    setBusy(false)
    if (registrationError) {
      setError(friendlyRecordError(registrationError))
      return
    }
    setTeamRegistration({ team_id: '', competition_id: '' })
    setNotice('Team registered for the competition.')
  }

  async function toggleFixturePublication(row: Row) {
    if (!supabase) return
    const isPublished = Boolean(row.published_at)
    setBusy(true)
    setError('')
    setNotice('')
    const { error: updateError } = await supabase.from('matches').update({
      published_at: isPublished ? null : new Date().toISOString(),
    }).eq('id', String(row.id))
    setBusy(false)
    if (updateError) {
      setError(updateError.message.includes('locked') ? 'This match or competition is locked by a platform administrator.' : 'Fixture publication could not be updated.')
      return
    }
    setNotice(isPublished ? 'Fixture withdrawn from public pages.' : 'Fixture published on public pages.')
    await loadRows()
  }

  async function promoteClassTeam(row: Row) {
    if (!supabase) return
    const currentYear = String(row.academic_class ?? '')
    const nextYear = nextAcademicYear(currentYear)
    if (!nextYear || row.type !== 'class_team') return
    const confirmed = confirm(`Promote ${String(row.name)} from ${currentYear} to ${nextYear}? Every active player profile registered to this team will be updated, including their other team and competition records.`)
    if (!confirmed) return

    setBusy(true)
    setError('')
    setNotice('')
    const { data: updatedCount, error: promotionError } = await supabase.rpc('promote_class_team', { target_team: String(row.id) })
    setBusy(false)
    if (promotionError) {
      setError(promotionError.message.includes('locked')
        ? 'The team or one of its player profiles is locked by a platform administrator.'
        : 'The team could not be promoted. Confirm it is an inter-class team with a valid year.')
      return
    }
    setNotice(`${row.name} promoted to ${nextYear}; ${Number(updatedCount ?? 0)} player profiles updated.`)
    await loadRows()
  }

  const fields = getFields()
  const names = Object.fromEntries(teamOptions.map((option) => [option.value, option.label]))
  const competitions = Object.fromEntries(competitionOptions.map((option) => [option.value, option.label]))

  return (
    <section className="secretary-record-page">
      <div className="secretary-heading">
        <div><span className="eyebrow">CAMPUS OPERATIONS</span><h1>{config.title}</h1><p>{config.description}</p></div>
        <span className="secretary-record-total">{loading ? 'Loading' : `${rows.length} ${rows.length === 1 ? 'record' : 'records'}`}</span>
      </div>
      {notice && <div className="inline-notice notice-success" role="status">{notice}</div>}
      {error && <div className="inline-notice notice-error" role="alert">{error}</div>}
      <div className="secretary-record-layout">
        <section className="secretary-panel secretary-create-panel">
          <div className="secretary-panel-heading">
            <div><span className="eyebrow">{editingRow ? 'EDIT PERMANENT PROFILE' : 'NEW RECORD'}</span><h2>{editingRow ? 'Edit player profile' : kind === 'matches' ? 'Schedule a fixture' : `Add ${singularLabels[kind]}`}</h2></div>
            <CircleDot size={17} />
          </div>
          <form key={editingRow ? `edit-${String(editingRow.id)}` : `new-${kind}`} className="secretary-record-form" onSubmit={(event) => void createRecord(event)}>
            <div className="secretary-field-grid">
              {fields.map((field) => (
                <label className={field.full ? 'secretary-field secretary-field-full' : 'secretary-field'} key={field.name}>
                  {field.label}
                  {field.options ? (
                    <select name={field.name} required={field.required} defaultValue={String(editingRow?.[field.name] ?? '')}>
                      <option value="">Choose {field.label.toLowerCase()}</option>
                      {Boolean(editingRow?.[field.name]) && !field.options.some((option) => option.value === String(editingRow?.[field.name])) && <option value={String(editingRow?.[field.name])}>{String(editingRow?.[field.name])}</option>}
                      {field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                    </select>
                  ) : (
                    <input name={field.name} type={field.type ?? 'text'} placeholder={field.placeholder} defaultValue={String(editingRow?.[field.name] ?? '')} required={field.required} minLength={field.required && field.type !== 'date' && field.type !== 'datetime-local' ? 2 : undefined} />
                  )}
                </label>
              ))}
            </div>
            {kind === 'competitions' && <p className="secretary-form-note">New competitions are saved as drafts. A platform administrator publishes them.</p>}
            {kind === 'matches' && (!teamOptions.length || !competitionOptions.length) && <p className="secretary-form-note">Add at least one competition and two teams before scheduling a fixture.</p>}
            <button className="button button-primary" type="submit" disabled={busy || (kind === 'matches' && (!teamOptions.length || !competitionOptions.length))}>
              {busy ? 'Saving…' : editingRow ? 'Save player profile' : `Save ${singularLabels[kind]}`}
            </button>
            {editingRow && <button className="button button-secondary" type="button" disabled={busy} onClick={() => setEditingRow(null)}>Cancel edit</button>}
          </form>
          {kind === 'teams' && <form className="secretary-record-form secretary-team-registration" onSubmit={(event) => void registerTeam(event)}>
            <div className="secretary-panel-heading">
              <div><span className="eyebrow">COMPETITION ENTRY</span><h2>Register an existing team</h2></div>
            </div>
            <div className="secretary-field-grid">
              <label className="secretary-field">Team<select required value={teamRegistration.team_id} onChange={(event) => setTeamRegistration((current) => ({ ...current, team_id: event.target.value }))}><option value="">Select team</option>{teamOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
              <label className="secretary-field">Competition<select required value={teamRegistration.competition_id} onChange={(event) => setTeamRegistration((current) => ({ ...current, competition_id: event.target.value }))}><option value="">Select competition</option>{competitionOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            </div>
            <button className="button button-secondary" type="submit" disabled={busy || !teamOptions.length || !competitionOptions.length}>Register team</button>
          </form>}
        </section>
        <section className="secretary-panel secretary-list-panel">
          <div className="secretary-panel-heading">
            <div><span className="eyebrow">UNIVERSITY RECORDS</span><h2>Current {config.title.toLowerCase()}</h2></div>
            <span className="secretary-list-count">{rows.length}</span>
          </div>
          {loading ? <div className="secretary-empty">Loading records…</div> : rows.length === 0 ? (
            <div className="secretary-empty">
              <Building2 size={21} /><strong>No {config.title.toLowerCase()} yet</strong><span>Your new records will appear here.</span>
            </div>
          ) : (
            <div className="secretary-table-wrap">
              <table className="secretary-table">
                <thead>
                  <tr>{config.columns.map((column) => <th key={column}>{column.replaceAll('_', ' ')}</th>)}{kind === 'matches' && <th>Public</th>}{(kind === 'players' || kind === 'teams') && <th>Actions</th>}</tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)}>
                      {config.columns.map((column) => <td key={column}>{formatCell(kind, column, row[column], names, competitions)}</td>)}
                      {kind === 'matches' && <td><button className="secretary-text-action" type="button" disabled={busy || Boolean(row.is_locked)} onClick={() => void toggleFixturePublication(row)}>{row.published_at ? 'Unpublish' : 'Publish fixture'}</button></td>}
                      {kind === 'players' && <td><button className="secretary-text-action" type="button" disabled={busy || Boolean(row.is_locked)} onClick={() => editPlayer(row)}>Edit profile</button></td>}
                      {kind === 'teams' && <td><button className="secretary-text-action" type="button" disabled={busy || Boolean(row.is_locked) || !nextAcademicYear(String(row.academic_class ?? ''))} onClick={() => void promoteClassTeam(row)}>{nextAcademicYear(String(row.academic_class ?? '')) ? `Promote to ${nextAcademicYear(String(row.academic_class))}` : row.type === 'class_team' ? 'No next year' : 'University team'}</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

function buildPayload(kind: RecordKind, values: FormData, universityId: string, userId: string) {
  const text = (name: string) => String(values.get(name) ?? '').trim()
  const base = { university_id: universityId, created_by: userId }
  if (kind === 'competitions') return {
    ...base,
    name: text('name'),
    season: text('season'),
    type: text('type'),
    format: text('format'),
    start_date: text('start_date'),
    end_date: text('end_date'),
    venue: text('venue') || null,
    points_for_win: Number(text('points_for_win') || 3),
    points_for_draw: Number(text('points_for_draw') || 1),
    points_for_loss: Number(text('points_for_loss') || 0),
    status: 'draft',
  }
  if (kind === 'teams') return { ...base, name: text('name'), short_name: text('short_name'), type: text('type'), academic_class: text('type') === 'class_team' ? text('academic_class') : null, batch_session: text('batch_session') || null }
  if (kind === 'players') return {
    ...base,
    full_name: text('full_name'),
    student_identifier: text('student_identifier') || null,
    photo_url: text('photo_url') || null,
    academic_program: text('academic_program') || null,
    current_academic_year: text('current_academic_year') || null,
    batch_session: text('batch_session') || null,
    academic_enrollment_status: text('academic_enrollment_status') || 'inactive',
    height_cm: text('height_cm') ? Number(text('height_cm')) : null,
    position: text('position') || null,
    preferred_foot: text('preferred_foot') || null,
    injury_status: text('injury_status') || 'fit',
    is_available: text('is_available') !== 'false',
    public_injury_status: text('public_injury_status') === 'true',
  }
  return { ...base, competition_id: text('competition_id'), home_team_id: text('home_team_id'), away_team_id: text('away_team_id'), kickoff_at: new Date(text('kickoff_at')).toISOString(), round: text('round') || null, venue: text('venue') || null, status: 'scheduled' }
}

function formatCell(kind: RecordKind, column: string, value: unknown, teams: Record<string, string>, competitions: Record<string, string>) {
  if (value === null || value === undefined || value === '') {
    if (column === 'type' && kind === 'teams') return 'University team'
    return '—'
  }
  if (column === 'home_team_id') return teams[String(value)] ?? 'Home side'
  if (column === 'away_team_id') return teams[String(value)] ?? 'Away side'
  if (column === 'competition_id') return competitions[String(value)] ?? 'Competition'
  if (column === 'kickoff_at' || column === 'start_date' || column === 'end_date') return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(String(value)))
  return String(value).replaceAll('_', ' ')
}

function friendlyRecordError(error: { code?: string; message: string }) {
  const message = error.message
  const normalizedMessage = message.toLowerCase()
  const diagnostic = `Supabase${error.code ? ` (${error.code})` : ''}: ${message}`

  if (error.code === '23505' || normalizedMessage.includes('unique') || normalizedMessage.includes('duplicate')) {
    return `A record with those details already exists. ${diagnostic}`
  }
  if (error.code === '23514' || normalizedMessage.includes('check constraint')) {
    return `Some details do not match the required format. Review the form. ${diagnostic}`
  }
  if (error.code === '42501' || normalizedMessage.includes('row-level security') || normalizedMessage.includes('permission denied')) {
    return `Supabase denied this save. Confirm your account is an active administrator for this university, then sign out and back in to refresh your access. ${diagnostic}`
  }
  if (
    error.code === '42703' ||
    error.code === '42P01' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205' ||
    normalizedMessage.includes('schema cache') ||
    normalizedMessage.includes('does not exist')
  ) {
    return `The Supabase database schema is missing or out of date. Apply all pending migrations from supabase/migrations, then retry. ${diagnostic}`
  }
  return `This record could not be saved. ${diagnostic}`
}

function nextAcademicYear(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^mbbs/, '')
  const nextYears: Record<string, string> = {
    year1: 'Year 2', '1styear': 'Year 2', firstyear: 'Year 2',
    year2: 'Year 3', '2ndyear': 'Year 3', secondyear: 'Year 3',
    year3: 'Year 4', '3rdyear': 'Year 4', thirdyear: 'Year 4',
    year4: 'Year 5', '4thyear': 'Year 5', fourthyear: 'Year 5',
    year5: 'HO', '5thyear': 'HO', fifthyear: 'HO', finalyear: 'HO',
  }
  return nextYears[normalized] ?? null
}
