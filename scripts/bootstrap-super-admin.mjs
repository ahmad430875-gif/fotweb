import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()

if (!url || !serviceKey || !email) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and BOOTSTRAP_ADMIN_EMAIL in the operator environment.')
  process.exit(1)
}

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: admins, error: adminQueryError } = await client
  .from('user_profiles')
  .select('id')
  .eq('role', 'super_admin')
  .limit(1)

if (adminQueryError) throw new Error(`Could not verify bootstrap state: ${adminQueryError.message}`)
if (admins?.length) {
  console.error('Bootstrap refused: a Super Admin already exists. Use the protected account-management workflow instead.')
  process.exit(1)
}

const { data: users, error: usersError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (usersError) throw new Error(`Could not find the bootstrap account: ${usersError.message}`)
let user = users.users.find((candidate) => candidate.email?.toLowerCase() === email)

if (!user) {
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, '')
  if (!appUrl) throw new Error('Set APP_URL to the public application origin before creating an admin invitation.')
  const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/admin/reset-password`,
  })
  if (error || !data.user) throw new Error(`Could not send the initial admin invitation: ${error?.message ?? 'unknown error'}`)
  user = data.user
}

const { error: profileError } = await client.from('user_profiles').upsert({
  id: user.id,
  role: 'super_admin',
  university_id: null,
  display_name: user.user_metadata.display_name ?? '',
  is_active: true,
})
if (profileError) throw new Error(`Could not create the administrator profile: ${profileError.message}`)

console.log(`Initial Super Admin provisioned for ${email}. The account must complete email verification or invitation before signing in.`)
