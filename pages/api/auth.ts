import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { username, password } = req.body;
  const user = datastore.authenticate(username, password);
  
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  res.json(user);
}

