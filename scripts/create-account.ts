import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

type Role = 'admin' | 'store'

function usageAndExit(message?: string): never {
  if (message) console.error(message)
  console.error(
    [
      'Usage:',
      '  npx ts-node scripts/create-account.ts <username> <password> <admin|store> [storeName] [scope] [managedStoresCsv]',
      '',
      'Examples:',
      "  npx ts-node scripts/create-account.ts yahya 'yahya123' admin all",
      "  npx ts-node scripts/create-account.ts bilal 'bilal123' admin '' 'Vinted,Trendy Wear'",
      "  npx ts-node scripts/create-account.ts trendy_shop 'shop123' store 'Trendy Wear'",
      '',
      'Notes:',
      "- scope: use 'all' for super admin, otherwise leave empty.",
      '- managedStoresCsv: comma-separated store names (for limited admins).'
    ].join('\n')
  )
  process.exit(1)
}

async function main() {
  const [username, password, roleRaw, storeNameArg, scopeArg, managedCsv] = process.argv.slice(2)
  const u = String(username ?? '').trim()
  const p = String(password ?? '')
  const role = (String(roleRaw ?? '').trim() as Role) || null

  if (!u || !p || (role !== 'admin' && role !== 'store')) {
    usageAndExit('Missing or invalid arguments.')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    usageAndExit('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const scope = scopeArg && String(scopeArg).trim() ? String(scopeArg).trim() : null
  if (scope && scope !== 'all') usageAndExit("scope must be 'all' or empty")

  const managedStores = (managedCsv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  let storeId: string | null = null
  if (role === 'store') {
    const storeName = String(storeNameArg ?? '').trim()
    if (!storeName) usageAndExit('storeName is required when role=store')
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id,name')
      .eq('name', storeName)
      .maybeSingle()
    if (storeErr) throw storeErr
    if (!store) usageAndExit(`Store not found: ${storeName}`)
    storeId = store.id
  }

  const passwordHash = await bcrypt.hash(p, 10)
  const { error } = await supabase.from('accounts').insert({
    username: u,
    password_hash: passwordHash,
    plain_password: p,
    role,
    scope,
    store_id: storeId,
    managed_stores: managedStores,
    is_active: true
  })

  if (error) throw error
  console.log('Account created:', { username: u, role, scope, storeId, managedStores })
}

main().catch((e) => {
  console.error('create-account failed:', e?.message || e)
  process.exit(1)
})
