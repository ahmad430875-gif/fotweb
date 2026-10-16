import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Action = 'list' | 'invite' | 'reset' | 'enable' | 'disable'
type RequestBody = { action?: Action; universityId?: string; userId?: string; email?: string }

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function getBearerToken(request: Request) {
  const value = request.headers.get('Authorization') ?? ''
  return value.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
}

function getAppOrigin(request: Request) {
  const value = Deno.env.get('APP_URL')?.trim() || request.headers.get('origin')
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}/`
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' })
  if (Number(request.headers.get('content-length') ?? 0) > 8192) return respond(413, { error: 'Request is too large.' })

  const token = getBearerToken(request)
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!token || !url || !anonKey || !serviceKey) return respond(401, { error: 'Authentication is required.' })

  const callerClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: callerResult, error: callerError } = await callerClient.auth.getUser(token)
  const caller = callerResult.user
  if (callerError || !caller) return respond(403, { error: 'A Super Admin account is required.' })

  const { data: callerProfile, error: callerProfileError } = await service
    .from('user_profiles')
    .select('id, role, is_active')
    .eq('id', caller.id)
    .maybeSingle()
  if (callerProfileError || !callerProfile?.is_active || callerProfile.role !== 'super_admin') return respond(403, { error: 'This account is not an active Super Admin.' })

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return respond(400, { error: 'A valid JSON request body is required.' })
  }
  if (!body.universityId || !uuidPattern.test(body.universityId)) return respond(400, { error: 'A valid university ID is required.' })

  const { data: university, error: universityError } = await service
    .from('universities')
    .select('id, name, is_active')
    .eq('id', body.universityId)
    .maybeSingle()
  if (universityError || !university) return respond(404, { error: 'University not found.' })

  if (body.action === 'list') {
    const { data: profiles, error } = await service
      .from('user_profiles')
      .select('id, display_name, is_active')
      .eq('university_id', university.id)
      .eq('role', 'university_admin')
      .order('is_active', { ascending: false })
      .order('created_at')
    if (error) return respond(500, { error: 'Secretary accounts could not be loaded.' })
    const secretaries = await Promise.all((profiles ?? []).map(async (profile) => {
      const { data } = await service.auth.admin.getUserById(profile.id)
      return { ...profile, email: data.user?.email ?? '' }
    }))
    return respond(200, { secretaries })
  }

  if (body.action === 'invite') {
    const email = body.email?.trim().toLowerCase()
    if (!email || email.length > 254 || !emailPattern.test(email)) return respond(400, { error: 'Enter a valid Secretary email address.' })
    if (!university.is_active) return respond(409, { error: 'Activate this university before inviting a Secretary.' })

    const { data: existing, error: existingError } = await service
      .from('user_profiles')
      .select('id, is_active')
      .eq('university_id', university.id)
      .eq('role', 'university_admin')
      .eq('is_active', true)
      .maybeSingle()
    if (existingError) return respond(500, { error: 'The existing Secretary account could not be checked.' })
    if (existing) return respond(409, { error: 'This university already has an active Sports Secretary.' })

    const appUrl = getAppOrigin(request)
    if (!appUrl) return respond(500, { error: 'The invitation redirect URL is not configured.' })
    const { data: invitation, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: appUrl,
      data: { display_name: '' },
    })
    if (inviteError || !invitation.user) return respond(400, { error: 'The invite could not be sent. Check whether this email already has an account.' })

    const { error: profileError } = await service.from('user_profiles').insert({
      id: invitation.user.id,
      university_id: university.id,
      role: 'university_admin',
      display_name: '',
      is_active: true,
    })
    if (profileError) {
      await service.auth.admin.deleteUser(invitation.user.id)
      return respond(500, { error: 'The invitation could not be linked to this university. Please try again.' })
    }

    await recordAudit(service, caller.id, university.id, 'secretary_invited', invitation.user.id)
    return respond(200, { message: `Invitation sent to ${email}.`, secretaryId: invitation.user.id })
  }

  if (!body.userId || !uuidPattern.test(body.userId)) return respond(400, { error: 'A valid Secretary account ID is required.' })
  const { data: secretary, error: secretaryError } = await service
    .from('user_profiles')
    .select('id, university_id, role, is_active')
    .eq('id', body.userId)
    .maybeSingle()
  if (secretaryError || !secretary || secretary.role !== 'university_admin' || secretary.university_id !== university.id) {
    return respond(404, { error: 'Secretary account not found for this university.' })
  }

  if (body.action === 'reset') {
    const { data: userData, error: userError } = await service.auth.admin.getUserById(secretary.id)
    if (userError || !userData.user?.email) return respond(404, { error: 'Secretary email address could not be found.' })
    const appUrl = getAppOrigin(request)
    if (!appUrl) return respond(500, { error: 'The password reset redirect URL is not configured.' })
    const { error } = await service.auth.resetPasswordForEmail(userData.user.email, {
      redirectTo: appUrl,
    })
    if (error) return respond(500, { error: 'The password reset email could not be sent.' })
    await recordAudit(service, caller.id, university.id, 'secretary_password_reset_requested', secretary.id)
    return respond(200, { message: 'A password reset email has been sent to the Secretary.' })
  }

  if (body.action === 'disable') {
    if (!secretary.is_active) return respond(200, { message: 'This Secretary account is already disabled.' })
    const { error } = await service.from('user_profiles').update({ is_active: false }).eq('id', secretary.id)
    if (error) return respond(500, { error: 'The Secretary account could not be disabled.' })
    const { error: banError } = await service.auth.admin.updateUserById(secretary.id, { ban_duration: '876000h' })
    await recordAudit(service, caller.id, university.id, 'secretary_disabled', secretary.id)
    return respond(200, { message: banError ? 'Secretary access is blocked by university policies. Auth session revocation will retry on next sign-in.' : 'Secretary account disabled.' })
  }

  if (body.action === 'enable') {
    if (!university.is_active) return respond(409, { error: 'Activate this university before enabling its Secretary account.' })
    if (secretary.is_active) return respond(200, { message: 'This Secretary account is already active.' })
    const { error: unbanError } = await service.auth.admin.updateUserById(secretary.id, { ban_duration: 'none' })
    if (unbanError) return respond(500, { error: 'The Secretary login could not be restored.' })
    const { error } = await service.from('user_profiles').update({ is_active: true }).eq('id', secretary.id)
    if (error) {
      await service.auth.admin.updateUserById(secretary.id, { ban_duration: '876000h' })
      return respond(500, { error: 'The Secretary account could not be enabled.' })
    }
    await recordAudit(service, caller.id, university.id, 'secretary_enabled', secretary.id)
    return respond(200, { message: 'Secretary account enabled.' })
  }

  return respond(400, { error: 'Unsupported Secretary account action.' })
})

async function recordAudit(service: ReturnType<typeof createClient>, actorId: string, universityId: string, action: string, entityId: string) {
  await service.from('audit_logs').insert({
    actor_id: actorId,
    university_id: universityId,
    action,
    entity_table: 'user_profiles',
    entity_id: entityId,
  })
}
