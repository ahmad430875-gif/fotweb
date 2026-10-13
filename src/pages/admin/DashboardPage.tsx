import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Building2, CalendarClock, CheckCircle2, CircleDot, GraduationCap, Users, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type Metric = { label: string; value: number | null; icon: typeof Building2; tone: string; href?: string }
type ActivityRow = { id: number; action: string; entity_table: string; entity_id: string | null; created_at: string; university_id: string | null }
const iconByTable: Record<string, typeof Building2> = { universities: Building2, competitions: Trophy, teams: Users, players: GraduationCap }

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'Universities', value: null, icon: Building2, tone: 'green', href: '/admin/universities' },
    { label: 'Active competitions', value: null, icon: Trophy, tone: 'amber' },
    { label: 'Registered teams', value: null, icon: Users, tone: 'blue' },
    { label: 'Registered players', value: null, icon: GraduationCap, tone: 'violet' },
    { label: 'Scheduled matches', value: null, icon: CalendarClock, tone: 'blue' },
    { label: 'Live matches', value: null, icon: CircleDot, tone: 'red' },
    { label: 'Completed matches', value: null, icon: CheckCircle2, tone: 'green' },
  ])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function loadDashboard() {
      if (!supabase) { setLoading(false); return }
      const requests = await Promise.all([
        supabase.from('universities').select('id', { count: 'exact', head: true }),
        supabase.from('competitions').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('teams').select('id', { count: 'exact', head: true }),
        supabase.from('players').select('id', { count: 'exact', head: true }),
        supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
        supabase.from('matches').select('id', { count: 'exact', head: true }).in('status', ['live', 'half_time']),
        supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'full_time'),
        supabase.from('audit_logs').select('id, action, entity_table, entity_id, created_at, university_id').order('created_at', { ascending: false }).limit(8),
      ])
      if (!active) return
      const failed = requests.find((request) => request.error)
      if (failed?.error) setError(failed.error.message)
      setMetrics((current) => current.map((metric, index) => ({ ...metric, value: requests[index]?.count ?? 0 })))
      if (requests[7].data) setActivity(requests[7].data as ActivityRow[])
      setLoading(false)
    }
    void loadDashboard()
    return () => { active = false }
  }, [])

  return <section className="dashboard-page">
    <div className="page-heading"><div><span className="eyebrow">PLATFORM OVERVIEW</span><h1>Good to have you back.</h1><p>A clear view of university football across the platform.</p></div><Link className="button button-secondary dashboard-action" to="/admin/universities"><Building2 size={16} /> Manage universities</Link></div>
    {!supabase && <div className="inline-notice notice-warning"><CircleDot size={17} /><span><strong>Connect Supabase to load platform data.</strong> Add the project URL and public anon key in <code>.env.local</code>.</span></div>}
    {error && <div className="inline-notice notice-error" role="alert">Dashboard data could not be loaded: {error}</div>}
    <div className="metric-grid">{metrics.map((metric) => { const Icon = metric.icon; const content = <><span className={`metric-icon metric-${metric.tone}`}><Icon size={19} /></span><span className="metric-value">{loading ? '—' : metric.value?.toLocaleString() ?? '0'}</span><span className="metric-label">{metric.label}</span><span className="metric-foot">{loading ? 'Loading data' : 'Across all universities'}</span></>; return metric.href ? <Link to={metric.href} className="metric-card metric-card-link" key={metric.label}>{content}<ArrowRight className="metric-arrow" size={16} /></Link> : <article className="metric-card" key={metric.label}>{content}</article> })}</div>
    <div className="dashboard-lower"><section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent activity</h2></div><Activity size={17} /></div>{loading ? <div className="panel-empty">Loading recent activity…</div> : activity.length === 0 ? <div className="panel-empty"><span className="empty-activity-icon"><Activity size={19} /></span><strong>No activity yet</strong><span>University and account changes will appear here.</span></div> : <div className="activity-list">{activity.map((item) => { const Icon = iconByTable[item.entity_table] ?? Activity; return <article className="activity-item" key={item.id}><span className="activity-icon"><Icon size={15} /></span><span className="activity-copy"><strong>{activityLabel(item)}</strong><small>{item.entity_table.replaceAll('_', ' ')}</small></span><time>{relativeTime(item.created_at)}</time></article> })}</div>}</section>
      <section className="panel quick-panel"><div className="panel-heading"><div><span className="eyebrow">GET STARTED</span><h2>Build the platform</h2></div><GraduationCap size={18} /></div><p className="quick-copy">Start with the universities that host local football, then invite each Sports Secretary to manage their own institution.</p><Link to="/admin/universities/new" className="quick-link"><span className="quick-link-icon"><Building2 size={16} /></span><span><strong>Add a university</strong><small>Create an institution and its profile</small></span><ArrowRight size={16} /></Link><div className="milestone-note"><span className="milestone-dot" /><span>First milestone · University directory and access</span></div></section></div>
  </section>
}

function activityLabel(item: ActivityRow) {
  const noun = item.entity_table.replaceAll('_', ' ').replace(/s$/, '')
  return `${item.action[0]?.toUpperCase()}${item.action.slice(1)} ${noun}`
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}
