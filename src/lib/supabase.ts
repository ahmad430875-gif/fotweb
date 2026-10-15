const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

const hasPlaceholderValue = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return normalized === '' || normalized.includes('your-') || normalized.includes('changeme') || normalized.includes('replace-me')
}

const isValidSupabaseUrl = (() => {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
})()

export const supabaseConfig = {
  url,
  anonKey,
  configured: Boolean(url && anonKey && !hasPlaceholderValue(anonKey) && isValidSupabaseUrl),
  missingUrl: !url,
  missingAnonKey: !anonKey,
  invalidUrl: Boolean(url && !isValidSupabaseUrl),
  placeholderAnonKey: Boolean(anonKey && hasPlaceholderValue(anonKey)),
}

export const supabaseConfigured = supabaseConfig.configured

export function getSupabaseClient() {
  if (!supabaseConfigured || !supabaseConfig.url || !supabaseConfig.anonKey) {
    throw new Error('Supabase is not configured. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your project values.')
  }

  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  })
}

export const supabase = supabaseConfigured ? getSupabaseClient() : null
