import { useEffect, useState, type FormEvent } from 'react'
import { FileText, Megaphone, Pencil, Send, Trash2 } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'

type NewsScope = 'platform' | 'university'
type University = { id: string; name: string }
type Option = { id: string; label: string }
type NewsItem = {
  id: string
  university_id: string
  competition_id: string | null
  team_id: string | null
  match_id: string | null
  title: string
  body: string
  is_published: boolean
  published_at: string | null
  created_at: string
}
type NewsForm = { title: string; body: string; competition_id: string; team_id: string; match_id: string; is_published: boolean }

const emptyForm: NewsForm = { title: '', body: '', competition_id: '', team_id: '', match_id: '', is_published: false }

export function NewsManagementPage({ scope }: { scope: NewsScope }) {
  const { profile, session } = useAuth()
  const [universities, setUniversities] = useState<University[]>([])
  const [universityId, setUniversityId] = useState(profile?.university_id ?? '')
  const [competitions, setCompetitions] = useState<Option[]>([])
  const [teams, setTeams] = useState<Option[]>([])
  const [matches, setMatches] = useState<Option[]>([])
  const [records, setRecords] = useState<NewsItem[]>([])
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<NewsForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    async function loadUniversities() {
      if (!supabase) { setLoading(false); setError('Connect Supabase to manage news.'); return }
      if (scope === 'university') {
        setUniversityId(profile?.university_id ?? '')
        if (!profile?.university_id) { setLoading(false); setError('This account is not assigned to a university.'); return }
        return
      }
      const { data, error: resultError } = await supabase.from('universities').select('id, name').order('name')
      if (!active) return
      if (resultError) setError('Universities could not be loaded.')
      const options = (data ?? []) as University[]
      setUniversities(options)
      setUniversityId((current) => current || options[0]?.id || '')
      setLoading(false)
    }
    void loadUniversities()
    return () => { active = false }
  }, [profile?.university_id, scope])

  useEffect(() => {
    let active = true
    async function loadNews() {
      if (!supabase || !universityId) { setRecords([]); setLoading(false); return }
      setLoading(true)
      setError('')
      const [newsResult, competitionResult, teamResult, matchResult] = await Promise.all([
        supabase.from('announcements').select('id, university_id, competition_id, team_id, match_id, title, body, is_published, published_at, created_at').eq('university_id', universityId).order('created_at', { ascending: false }).limit(100),
        supabase.from('competitions').select('id, name, season').eq('university_id', universityId).order('start_date', { ascending: false }),
        supabase.from('teams').select('id, name').eq('university_id', universityId).order('name'),
        supabase.from('matches').select('id, kickoff_at, round').eq('university_id', universityId).order('kickoff_at', { ascending: false }).limit(100),
      ])
      if (!active) return
      if (newsResult.error) setError(readError(newsResult.error.message))
      setRecords((newsResult.data ?? []) as NewsItem[])
      setCompetitions((competitionResult.data ?? []).map((item) => ({ id: item.id, label: `${item.name} · ${item.season}` })))
      setTeams((teamResult.data ?? []).map((item) => ({ id: item.id, label: item.name })))
      setMatches((matchResult.data ?? []).map((item) => ({
        id: item.id,
        label: `${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.kickoff_at))}${item.round ? ` · ${item.round}` : ''}`,
      })))
      setLoading(false)
    }
    void loadNews()
    return () => { active = false }
  }, [universityId])

  function beginEdit(item: NewsItem) {
    setEditingId(item.id)
    setForm({
      title: item.title,
      body: item.body,
      competition_id: item.competition_id ?? '',
      team_id: item.team_id ?? '',
      match_id: item.match_id ?? '',
      is_published: item.is_published,
    })
    setError('')
    setNotice('')
  }

  function resetForm() {
    setEditingId('')
    setForm(emptyForm)
  }

  async function saveNews(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId || !session?.user.id) return
    setBusy(true)
    setError('')
    setNotice('')
    const payload = {
      university_id: universityId,
      title: form.title.trim(),
      body: form.body.trim(),
      competition_id: form.competition_id || null,
      team_id: form.team_id || null,
      match_id: form.match_id || null,
      is_published: form.is_published,
      published_at: form.is_published ? new Date().toISOString() : null,
    }
    const result = editingId
      ? await supabase.from('announcements').update(payload).eq('id', editingId).eq('university_id', universityId)
      : await supabase.from('announcements').insert({ ...payload, created_by: session.user.id })
    setBusy(false)
    if (result.error) { setError(readError(result.error.message)); return }
    setNotice(editingId ? 'News article updated.' : 'News article created.')
    resetForm()
    await reloadNews()
  }

  async function reloadNews() {
    if (!supabase || !universityId) return
    const { data, error: resultError } = await supabase.from('announcements')
      .select('id, university_id, competition_id, team_id, match_id, title, body, is_published, published_at, created_at')
      .eq('university_id', universityId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (resultError) setError(readError(resultError.message))
    else setRecords((data ?? []) as NewsItem[])
  }

  async function deleteNews(item: NewsItem) {
    if (!supabase || !confirm(`Delete “${item.title}”? This cannot be undone.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    const { error: resultError } = await supabase.from('announcements').delete().eq('id', item.id).eq('university_id', universityId)
    setBusy(false)
    if (resultError) { setError(readError(resultError.message)); return }
    setNotice('News article deleted.')
    if (editingId === item.id) resetForm()
    await reloadNews()
  }

  async function togglePublication(item: NewsItem) {
    if (!supabase) return
    setBusy(true)
    setError('')
    setNotice('')
    const publish = !item.is_published
    const { error: resultError } = await supabase.from('announcements').update({
      is_published: publish,
      published_at: publish ? new Date().toISOString() : null,
    }).eq('id', item.id).eq('university_id', universityId)
    setBusy(false)
    if (resultError) { setError(readError(resultError.message)); return }
    setNotice(publish ? 'Article published to public pages.' : 'Article moved to drafts.')
    await reloadNews()
  }

  const title = scope === 'platform' ? 'News Center' : 'University News Center'

  return <section className="admin-page news-center">
    <div className="page-heading">
      <div><span className="eyebrow">EDITORIAL</span><h1>{title}</h1><p>Create, publish, and manage university football news.</p></div>
      {scope === 'platform' && <label className="secretary-field news-university-select">University
        <select value={universityId} onChange={(event) => { setUniversityId(event.target.value); resetForm() }}>
          <option value="">Select university</option>
          {universities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
      </label>}
    </div>
    {notice && <div className="inline-notice notice-success" role="status">{notice}</div>}
    {error && <div className="inline-notice notice-error" role="alert">{error}</div>}
    <div className="news-center-grid">
      <section className="panel news-editor">
        <div className="panel-heading"><div><span className="eyebrow">{editingId ? 'EDIT ARTICLE' : 'NEW ARTICLE'}</span><h2>{editingId ? 'Edit news' : 'Write news'}</h2></div><Megaphone size={18} /></div>
        <form className="news-editor-form" onSubmit={(event) => void saveNews(event)}>
          <label>Headline<input required minLength={3} maxLength={180} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <label>Article<textarea required minLength={1} maxLength={10000} rows={8} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} /></label>
          <div className="news-context-grid">
            <label>Competition<select value={form.competition_id} onChange={(event) => setForm((current) => ({ ...current, competition_id: event.target.value, match_id: '' }))}><option value="">General news</option>{competitions.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
            <label>Team<select value={form.team_id} onChange={(event) => setForm((current) => ({ ...current, team_id: event.target.value }))}><option value="">All teams</option>{teams.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
            <label className="news-match-field">Match<select value={form.match_id} onChange={(event) => setForm((current) => ({ ...current, match_id: event.target.value }))}><option value="">No match linked</option>{matches.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          </div>
          <label className="news-publish-toggle"><input type="checkbox" checked={form.is_published} onChange={(event) => setForm((current) => ({ ...current, is_published: event.target.checked }))} /><span><strong>Publish immediately</strong><small>Published news appears on public competition pages.</small></span></label>
          <div className="news-editor-actions"><button className="button button-primary" type="submit" disabled={busy || !universityId}><Send size={15} />{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create article'}</button>{editingId && <button className="button button-secondary" type="button" disabled={busy} onClick={resetForm}>Cancel</button>}</div>
        </form>
      </section>
      <section className="panel news-list-panel">
        <div className="panel-heading"><div><span className="eyebrow">UNIVERSITY PUBLICATIONS</span><h2>Articles</h2></div><span className="news-count">{records.length}</span></div>
        {!universityId ? <div className="panel-empty"><Megaphone size={20} />Choose a university to manage its news.</div> : loading ? <div className="panel-empty">Loading articles…</div> : !records.length ? <div className="panel-empty"><FileText size={20} />No news articles yet. Start with a draft or publish a story.</div> : <div className="news-article-list">
          {records.map((item) => <article className="news-article-row" key={item.id}>
            <div className="news-article-copy"><div className="news-article-meta"><span className={item.is_published ? 'news-state news-state-published' : 'news-state'}>{item.is_published ? 'Published' : 'Draft'}</span><time>{new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(item.published_at ?? item.created_at))}</time></div><h3>{item.title}</h3><p>{item.body}</p></div>
            <div className="news-article-actions"><button className="icon-button" type="button" title="Edit article" aria-label={`Edit ${item.title}`} disabled={busy} onClick={() => beginEdit(item)}><Pencil size={15} /></button><button className="icon-button" type="button" title={item.is_published ? 'Move to drafts' : 'Publish article'} aria-label={item.is_published ? `Unpublish ${item.title}` : `Publish ${item.title}`} disabled={busy} onClick={() => void togglePublication(item)}>{item.is_published ? <FileText size={15} /> : <Send size={15} />}</button><button className="icon-button news-delete-button" type="button" title="Delete article" aria-label={`Delete ${item.title}`} disabled={busy} onClick={() => void deleteNews(item)}><Trash2 size={15} /></button></div>
          </article>)}
        </div>}
      </section>
    </div>
  </section>
}

function readError(message: string) {
  if (message.includes('row-level security') || message.includes('permission denied')) return 'You do not have permission to manage news for this university.'
  if (message.includes('announcements')) return 'The announcements table is unavailable. Apply the Supabase migrations and refresh.'
  return `News could not be saved: ${message}`
}
