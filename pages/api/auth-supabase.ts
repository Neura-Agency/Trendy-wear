// Supabase Auth (Option A)
// This project previously had a custom `accounts/password_hash` table.
// With Supabase Auth, passwords live in `auth.users` and you authenticate
// via Supabase Auth APIs (typically from the client).
import type { NextApiRequest, NextApiResponse } from 'next'
 

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    return res.status(501).json({
      error:
        'Supabase Auth is enabled. Use supabase.auth.signInWithPassword(...) and then read public.app_users for role/store permissions.'
    })

  } catch (error) {
    console.error('Auth error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}