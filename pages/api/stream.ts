import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.write('\n');

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  const onChange = (d) => send({ type: 'change', payload: d });
  datastore.on('change', onChange);

  req.on('close', ()=>{
    datastore.removeListener('change', onChange);
  });
}

