import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { createSession } from '../../lib/api/session'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    const u = String(username ?? '').trim()
    const p = String(password ?? '')
    if (!u || !p) return res.status(400).json({ error: 'username and password are required' })

    const usernameCandidates = Array.from(new Set([u, u.toLowerCase()]))

    const { data: accounts, error } = await supabaseAdmin
      .from(TABLES.ACCOUNTS)
      .select('id, username, password_hash, role, scope, store_id, managed_stores, is_active, stores(name)')
      .in('username', usernameCandidates)

    if (error) throw error

    const account = (accounts ?? []).find((a: any) => a.username === u) ?? (accounts ?? [])[0]
    if (!account || account.is_active === false) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const ok = await bcrypt.compare(p, account.password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

    await createSession(res, req, account.id)

    return res.json({
      role: account.role,
      storeName: (account as any).stores?.name ?? null,
      username: account.username,
      scope: account.scope ?? null,
      managedStores: (account.managed_stores as string[]) ?? []
    })
  } catch (e: any) {
    console.error('auth api error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

