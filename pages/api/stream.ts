import type { NextApiRequest, NextApiResponse } from 'next';
import { serverEvents } from '../../lib/serverEvents';
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

  const onChange = (d: unknown) => send({ type: 'change', payload: d });
  serverEvents.on('change', onChange);

  // Heartbeat to keep proxies from closing the connection.
  const heartbeat = setInterval(() => {
    send({ type: 'heartbeat', ts: Date.now() });
  }, 25000);

  req.on('close', ()=>{
    clearInterval(heartbeat);
    serverEvents.removeListener('change', onChange);
  });
}

