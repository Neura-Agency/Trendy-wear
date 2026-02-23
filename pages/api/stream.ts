import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../../lib/api/session'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireSession(req, res)
  if (!session) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.write('\n');

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  // No-op: database removed, just send heartbeat
  const heartbeat = setInterval(() => {
    send({ type: 'heartbeat', ts: Date.now() });
  }, 25000);

  req.on('close', ()=>{
    clearInterval(heartbeat);
  });
}

