import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

type Role = 'admin' | 'store'

function usageAndExit(message?: string): never {
  if (message) console.error(message)
  console.error(
    [
      'Usage:',
      '  npx ts-node scripts/reset-password.ts <username> <newPassword>',
      '',
      'Example:',
      "  npx ts-node scripts/reset-password.ts bilalgw 'bilal123'",
      '',
      'Notes:',
      '- Updates only accounts.password_hash (does not touch roles/scopes).'
    ].join('\n')
  )
  process.exit(1)
}

async function main() {
  const [username, newPassword] = process.argv.slice(2)
  const u = String(username ?? '').trim()
  const p = String(newPassword ?? '')
  if (!u || !p) usageAndExit('Missing username or newPassword.')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    usageAndExit('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env (.env.local).')
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const passwordHash = await bcrypt.hash(p, 10)

  // Try exact username first; if not found, try lowercase variant.
  const candidates = Array.from(new Set([u, u.toLowerCase()]))

  const { data: accounts, error: findErr } = await supabase
    .from('accounts')
    .select('id, username, role')
    .in('username', candidates)

  if (findErr) throw findErr
  if (!accounts || accounts.length === 0) {
    console.error('No matching account found for:', u)
    process.exit(2)
  }

  const account = accounts.find((a: any) => a.username === u) ?? accounts[0]

  const { data: updated, error: updErr } = await supabase
    .from('accounts')
    .update({ password_hash: passwordHash, plain_password: p })
    .eq('id', account.id)
    .select('id, username, role')
    .maybeSingle()

  if (updErr) throw updErr
  if (!updated) {
    console.error('Password update did not return a row; check permissions.')
    process.exit(3)
  }

  console.log('Password updated:', {
    username: updated.username,
    role: updated.role as Role
  })
}

main().catch((e) => {
  console.error('reset-password failed:', e?.message || e)
  process.exit(1)
})
