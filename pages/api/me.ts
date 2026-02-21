import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionContext, toUserPayload } from '../../lib/api/session'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const session = await getSessionContext(req)
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    return res.json(toUserPayload(session))
  } catch (e: any) {
    console.error('me api error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}
