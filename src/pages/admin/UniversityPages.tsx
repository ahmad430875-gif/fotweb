import { useDeferredValue, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Building2, Check, ChevronRight, CircleDot, Edit3, GraduationCap, Mail, MapPin, Plus, Search, ShieldCheck, ToggleLeft, ToggleRight, Trash2, Trophy, Users, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { publicImageUrl } from '../../lib/imageUrl'

type University = {
  id: string; name: string; short_name: string; logo_url: string | null; location: string
  contact_email: string | null; contact_phone: string | null; is_active: boolean
  created_at: string; updated_at: string; competition_count: number; team_count: number
  player_count: number; match_count: number; secretary_count: number
}
type Secretary = { id: string; display_name: string; email: string; is_active: boolean }
type UniversityValues = Pick<University, 'name' | 'short_name' | 'location' | 'contact_email' | 'contact_phone' | 'logo_url'>
const emptyValues: UniversityValues = { name: '', short_name: '', location: '', contact_email: '', contact_phone: '', logo_url: '' }

export function UniversityListPage() {
  const [rows, setRows] = useState<University[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const deferredQuery = useDeferredValue(query)

  async function load() {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    const { data, error: loadError } = await supabase.from('university_summaries').select('*').order('name')
    if (loadError) setError(loadError.message)
    else { setRows((data ?? []) as University[]); setError('') }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const filtered = rows.filter((row) => {
    const searchMatch = `${row.name} ${row.short_name} ${row.location}`.toLowerCase().includes(deferredQuery.trim().toLowerCase())
    return searchMatch && (status === 'all' || row.is_active === (status === 'active'))
  })

  async function toggleStatus(university: University) {
    if (!supabase) return
    const next = !university.is_active
    const { error: updateError } = await supabase.from('universities').update({ is_active: next }).eq('id', university.id)
    if (updateError) setError(updateError.message)
    else { setNotice(`${university.short_name} ${next ? 'activated' : 'deactivated'}. ${next ? '' : 'Secretary access is blocked while the university is inactive.'}`); await load() }
  }

  return <section className="universities-page">
    <div className="page-heading universities-heading"><div><span className="eyebrow">PLATFORM DIRECTORY</span><h1>Universities</h1><p>Institutions, account access, and football activity in one place.</p></div><Link to="/admin/universities/new" className="button button-primary"><Plus size={16} /> Add university</Link></div>
    {!supabase && <div className="inline-notice notice-warning"><CircleDot size={17} /><span><strong>Connect Supabase to manage universities.</strong> Add the project URL and public anon key in <code>.env.local</code>.</span></div>}
    {notice && <div className="inline-notice notice-success" role="status"><Check size={16} /><span>{notice}</span><button className="notice-dismiss" type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}
    {error && <div className="inline-notice notice-error" role="alert">{error}</div>}
    <div className="directory-toolbar"><label className="directory-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by university or location" aria-label="Search universities" /></label><div className="status-tabs" aria-label="Filter universities by status">{(['all', 'active', 'inactive'] as const).map((item) => <button key={item} type="button" className={status === item ? 'status-tab active' : 'status-tab'} onClick={() => setStatus(item)} aria-pressed={status === item}>{item === 'all' ? 'All' : item === 'active' ? 'Active' : 'Inactive'}{item === 'all' && <span>{rows.length}</span>}</button>)}</div><span className="directory-total">{filtered.length} {filtered.length === 1 ? 'institution' : 'institutions'}</span></div>
    <div className="university-table-wrap"><table className="university-table"><thead><tr><th scope="col">UNIVERSITY</th><th scope="col">LOCATION</th><th scope="col">COMPETITIONS</th><th scope="col">TEAMS</th><th scope="col">PLAYERS</th><th scope="col">SECRETARY</th><th scope="col">STATUS</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {loading ? <tr><td colSpan={8}><div className="table-empty">Loading university directory…</div></td></tr> : filtered.length === 0 ? <tr><td colSpan={8}><div className="table-empty"><span className="table-empty-icon"><Building2 size={19} /></span><strong>{rows.length === 0 ? 'No universities yet' : 'No matching universities'}</strong><span>{rows.length === 0 ? 'Add an institution to begin bringing its football competitions online.' : 'Try another search or change the status filter.'}</span>{rows.length === 0 && <Link className="button button-primary" to="/admin/universities/new"><Plus size={15} /> Add first university</Link>}</div></td></tr> : filtered.map((row) => <tr key={row.id}>
        <td><Link to={`/admin/universities/${row.id}`} className="university-name-cell"><span className="university-avatar">{row.logo_url ? <img src={publicImageUrl(row.logo_url)} alt="" /> : <Building2 size={17} />}</span><span><strong>{row.name}</strong><small>{row.short_name}</small></span></Link></td>
        <td><span className="table-muted"><MapPin size={13} />{row.location}</span></td><td>{row.competition_count}</td><td>{row.team_count}</td><td>{row.player_count}</td><td>{row.secretary_count > 0 ? <span className="secretary-cell"><ShieldCheck size={13} />Assigned</span> : <span className="table-muted">Not assigned</span>}</td><td><span className={`status-badge ${row.is_active ? 'status-active' : 'status-inactive'}`}><i />{row.is_active ? 'Active' : 'Inactive'}</span></td>
        <td><div className="row-actions"><Link to={`/admin/universities/${row.id}`} className="icon-button" title="View university" aria-label={`View ${row.name}`}><ChevronRight size={16} /></Link><button className="icon-button" type="button" title={row.is_active ? 'Deactivate university' : 'Activate university'} aria-label={row.is_active ? `Deactivate ${row.name}` : `Activate ${row.name}`} onClick={() => void toggleStatus(row)}>{row.is_active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button></div></td>
      </tr>)}
    </tbody></table></div>
    <div className="directory-footnote"><ShieldCheck size={14} /><span>University administrators can only access data owned by their institution. Deactivating a university immediately revokes its Secretary's data access.</span></div>
  </section>
}

export function UniversityCreatePage() {
  return <UniversityForm />
}

export function UniversityDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [university, setUniversity] = useState<University | null>(null)
  const [secretaries, setSecretaries] = useState<Secretary[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [secretaryEmail, setSecretaryEmail] = useState('')
  const [replacementEmail, setReplacementEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    if (!supabase || !id) { setLoading(false); return }
    setLoading(true)
    const { data, error: loadError } = await supabase.from('university_summaries').select('*').eq('id', id).maybeSingle()
    if (loadError) setError(loadError.message)
    else if (!data) setError('This university was not found or is no longer available.')
    else { setUniversity(data as University); setError('') }
    setLoading(false)
    const { data: response, error: secretaryError } = await supabase.functions.invoke('manage-secretary', { body: { action: 'list', universityId: id } })
    if (secretaryError) {
      setError((current) => current || 'University loaded, but Sports Secretary accounts could not be fetched. The manage-secretary Edge Function may be unavailable or not deployed.')
      return
    }
    setSecretaries((response?.secretaries ?? []) as Secretary[])
  }

  const activeSecretary = secretaries.find((candidate) => candidate.is_active) ?? null

  useEffect(() => { void load() }, [id])

  async function secretaryAction(action: 'invite' | 'replace' | 'reset' | 'enable' | 'disable', userId?: string) {
    if (!supabase || !university) return
    setError(''); setNotice(''); setBusy(true)
    const email = action === 'replace' ? replacementEmail.trim() : secretaryEmail.trim()
    const { data, error: actionError } = await supabase.functions.invoke('manage-secretary', { body: { action, universityId: university.id, userId: userId ?? activeSecretary?.id, email } })
    setBusy(false)
    if (actionError) { setError(await edgeError(actionError)); return }
    setNotice(data?.message ?? 'Secretary account updated.')
    if (action === 'invite') setSecretaryEmail('')
    if (action === 'replace') setReplacementEmail('')
    await load()
  }

  async function deleteUniversity() {
    if (!supabase || !university || !window.confirm(`Permanently delete ${university.name}? This is only allowed when it has no linked records or Secretary account.`)) return
    const { data, error: deleteError } = await supabase.from('universities').delete().eq('id', university.id).select('id').maybeSingle()
    if (deleteError) setError(friendlyError(deleteError.message))
    else if (!data) setError('This university has linked records or no longer exists. Deactivate it instead.')
    else navigate('/admin/universities', { replace: true })
  }

  if (loading) return <div className="page-loading">Loading university record…</div>
  if (!university) return <section className="detail-page"><Link to="/admin/universities" className="back-link"><ArrowLeft size={15} /> All universities</Link><div className="inline-notice notice-error">{error || 'University not found.'}</div></section>

  return <section className="detail-page"><Link to="/admin/universities" className="back-link"><ArrowLeft size={15} /> All universities</Link>
    {notice && <div className="inline-notice notice-success" role="status"><Check size={16} /><span>{notice}</span></div>}{error && <div className="inline-notice notice-error" role="alert">{error}</div>}
    {editing ? <UniversityForm existing={university} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await load() }} /> : <>
      <div className="detail-hero"><span className="university-avatar university-avatar-large">{university.logo_url ? <img src={publicImageUrl(university.logo_url)} alt="" /> : <Building2 size={25} />}</span><div className="detail-hero-copy"><span className="eyebrow">UNIVERSITY PROFILE · {university.short_name}</span><h1>{university.name}</h1><span className="detail-location"><MapPin size={14} />{university.location}</span></div><div className="detail-hero-actions"><span className={`status-badge ${university.is_active ? 'status-active' : 'status-inactive'}`}><i />{university.is_active ? 'Active' : 'Inactive'}</span><button className="button button-secondary" type="button" onClick={() => setEditing(true)}><Edit3 size={15} /> Edit details</button></div></div>
      {!university.is_active && <div className="inline-notice notice-warning"><CircleDot size={16} /><span>This university is inactive. Its public data is hidden and Secretary access is blocked.</span></div>}
      <div className="university-stat-grid">{[{ label: 'Competitions', value: university.competition_count, icon: Trophy }, { label: 'Teams', value: university.team_count, icon: Users }, { label: 'Players', value: university.player_count, icon: GraduationCap }, { label: 'Matches', value: university.match_count, icon: CircleDot }].map(({ label, value, icon: Icon }) => <article className="university-stat" key={label}><span><Icon size={16} />{label}</span><strong>{value}</strong></article>)}</div>
      <div className="university-detail-grid"><section className="panel detail-panel"><div className="panel-heading"><div><span className="eyebrow">INSTITUTION</span><h2>Contact &amp; location</h2></div><Building2 size={17} /></div><dl className="university-fields"><div><dt>Short name</dt><dd>{university.short_name}</dd></div><div><dt>Location</dt><dd>{university.location}</dd></div><div><dt>Contact email</dt><dd>{university.contact_email || 'Not provided'}</dd></div><div><dt>Contact phone</dt><dd>{university.contact_phone || 'Not provided'}</dd></div><div><dt>Added</dt><dd>{new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(university.created_at))}</dd></div></dl></section>
      <section className="panel secretary-panel">
        <div className="panel-heading"><div><span className="eyebrow">UNIVERSITY ACCESS</span><h2>Sports Secretary</h2></div><ShieldCheck size={17} /></div>
        {secretaries.length > 0 && <div className="secretary-accounts-list">
          {secretaries.map((account) => <div className="secretary-account" key={account.id}>
            <span className="secretary-avatar">{(account.display_name || account.email).slice(0, 1).toUpperCase()}</span>
            <span className="secretary-identity"><strong>{account.display_name || 'Sports Secretary'}</strong><small>{account.email}</small><span className={`status-badge ${account.is_active ? 'status-active' : 'status-inactive'}`}><i />{account.is_active ? 'Account active' : 'Account disabled'}</span></span>
            <button className="button button-secondary secretary-toggle" type="button" disabled={busy || !university.is_active} onClick={() => void secretaryAction('reset', account.id)}><Mail size={14} /> Send password reset</button>
            <button className="button button-secondary secretary-toggle" type="button" disabled={busy || (!account.is_active && (!university.is_active || Boolean(activeSecretary)))} onClick={() => void secretaryAction(account.is_active ? 'disable' : 'enable', account.id)}>{account.is_active ? 'Disable' : 'Enable'}</button>
          </div>)}
          <p className="secretary-security-note">Passwords are private and cannot be viewed. Send a secure reset email when an account holder needs access.</p>
        </div>}
        {!activeSecretary ? <div className="secretary-invite"><span className="secretary-invite-icon"><Mail size={17} /></span><strong>{secretaries.length ? 'Assign an active Sports Secretary' : 'No Sports Secretary yet'}</strong><span>Invite one account to manage this university’s football activity.</span><form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void secretaryAction('invite') }}><label className="sr-only" htmlFor="secretary-email">Secretary email address</label><input id="secretary-email" type="email" placeholder="secretary@university.edu" value={secretaryEmail} onChange={(event) => setSecretaryEmail(event.target.value)} required /><button className="button button-primary" type="submit" disabled={busy || !university.is_active}>{busy ? 'Sending…' : 'Send invite'}<ArrowRight size={14} /></button></form>{!university.is_active && <small>Activate the university before inviting an account.</small>}</div>
          : <div className="secretary-invite secretary-replace"><span className="secretary-invite-icon"><ShieldCheck size={17} /></span><strong>Change Sports Secretary</strong><span>Invite the replacement. The current account is disabled after the invitation is created successfully.</span><form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void secretaryAction('replace', activeSecretary.id) }}><label className="sr-only" htmlFor="replacement-secretary-email">Replacement Secretary email address</label><input id="replacement-secretary-email" type="email" placeholder="new.secretary@university.edu" value={replacementEmail} onChange={(event) => setReplacementEmail(event.target.value)} required /><button className="button button-primary" type="submit" disabled={busy || !university.is_active}>{busy ? 'Sending…' : 'Invite replacement'}<ArrowRight size={14} /></button></form></div>}
      </section></div>
      <section className="panel danger-panel"><div><span className="eyebrow">SENSITIVE ACTIONS</span><h2>University status</h2><p>Deactivation hides public records and blocks university-scoped admin access. Existing records remain available to Super Admins.</p></div><div className="danger-actions"><button className="button button-secondary" type="button" onClick={() => void toggleUniversity(university, load, setError, setNotice)}>{university.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}{university.is_active ? 'Deactivate' : 'Activate'}</button><button className="button button-danger" type="button" disabled={university.competition_count + university.team_count + university.player_count + university.match_count + university.secretary_count > 0} title="Universities with linked records must be deactivated, not deleted." onClick={() => void deleteUniversity()}><Trash2 size={15} />Delete permanently</button></div></section>
    </>}</section>
}

function UniversityForm({ existing, onCancel, onSaved }: { existing?: UniversityValues & { id: string }; onCancel?: () => void; onSaved?: () => Promise<void> }) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [values, setValues] = useState<UniversityValues>(existing ?? emptyValues)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isEditing = Boolean(existing)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return setError('Connect Supabase before saving university records.')
    setError(''); setBusy(true)
    const payload = { name: values.name.trim(), short_name: values.short_name.trim(), location: values.location.trim(), contact_email: values.contact_email?.trim() || null, contact_phone: values.contact_phone?.trim() || null, logo_url: values.logo_url?.trim() || null }
    const result = existing
      ? await supabase.from('universities').update(payload).eq('id', existing.id).select('id').single()
      : await supabase.from('universities').insert({ ...payload, created_by: session?.user.id }).select('id').single()
    setBusy(false)
    if (result.error) { setError(friendlyError(result.error.message)); return }
    if (existing && onSaved) await onSaved()
    else navigate(`/admin/universities/${result.data.id}`)
  }

  const change = (field: keyof UniversityValues) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [field]: event.target.value }))
  return <section className="university-form-page">
    <div className="form-page-heading">
      {!existing && <Link to="/admin/universities" className="back-link"><ArrowLeft size={15} /> All universities</Link>}
      <span className="eyebrow">{isEditing ? 'EDIT INSTITUTION' : 'NEW INSTITUTION'}</span>
      <h1>{isEditing ? 'University details' : 'Add a university'}</h1>
      <p>Set up an institution profile before registering its competitions and teams.</p>
    </div>
    <form className="university-form panel" onSubmit={(event) => void submit(event)}>
      <div className="form-section-title">
        <span className="form-section-number">01</span>
        <div><strong>Institution profile</strong><span>Basic information and public identity</span></div>
      </div>
      <div className="form-grid">
        <label className="field-full">University name<span className="field-required">*</span><input value={values.name} onChange={change('name')} required minLength={2} maxLength={180} placeholder="e.g. Punjab Medical University" autoFocus /></label>
        <label>Short name<span className="field-required">*</span><input value={values.short_name} onChange={change('short_name')} required minLength={2} maxLength={40} placeholder="e.g. PMU" /><small>Used across tables and match displays.</small></label>
        <label>Location<span className="field-required">*</span><input value={values.location} onChange={change('location')} required minLength={2} maxLength={180} placeholder="City, country" /></label>
        <label>Contact email<input type="email" value={values.contact_email ?? ''} onChange={change('contact_email')} placeholder="sports@university.edu" /></label>
        <label>Contact phone<input type="tel" value={values.contact_phone ?? ''} onChange={change('contact_phone')} placeholder="+92 300 0000000" /></label>
        <label className="field-full">
          Logo URL
          <input type="url" value={values.logo_url ?? ''} onChange={change('logo_url')} placeholder="Paste a public image URL or Google Drive share link" />
          <small>Publicly accessible images will appear throughout the portal.</small>
          {values.logo_url && <span className="url-image-preview"><img src={publicImageUrl(values.logo_url)} alt={`${values.name || 'University'} logo preview`} /><small>Image preview</small></span>}
        </label>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-footer">
        <span><ShieldCheck size={14} /> Only platform administrators can manage institution records.</span>
        <div>
          {onCancel && <button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : isEditing ? 'Save changes' : 'Create university'}<ArrowRight size={15} /></button>
        </div>
      </div>
    </form>
  </section>
}

async function toggleUniversity(university: University, load: () => Promise<void>, setError: (value: string) => void, setNotice: (value: string) => void) {
  if (!supabase) return
  const next = !university.is_active
  const { error } = await supabase.from('universities').update({ is_active: next }).eq('id', university.id)
  if (error) setError(error.message)
  else { setNotice(`${university.name} ${next ? 'activated' : 'deactivated'}.`); await load() }
}

async function edgeError(error: { message: string; context?: unknown }) {
  const response = error.context instanceof Response ? await error.context.clone().json().catch(() => null) : null
  return response?.error ?? error.message
}

function friendlyError(message: string) {
  if (message.includes('universities_short_name_lower_idx')) return 'That short name is already used by another university.'
  if (message.includes('foreign key') || message.includes('violates')) return 'This university has linked records and cannot be deleted. Deactivate it instead.'
  return message
}
