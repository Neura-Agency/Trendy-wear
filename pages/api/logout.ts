import type { NextApiRequest, NextApiResponse } from 'next'
import { clearSessionCookie, revokeSessionByToken } from '../../lib/api/session'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    await revokeSessionByToken(req)
    clearSessionCookie(res)
    return res.json({ ok: true })
  } catch (e: any) {
    console.error('logout api error:', e)
    clearSessionCookie(res)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}
