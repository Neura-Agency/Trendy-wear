import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const data = datastore.getAll();
    res.json({ expenses: data.expenses });
  } else if (req.method === 'POST') {
    const created = datastore.addExpense(req.body);
    res.status(201).json(created);
  } else res.status(405).end();
}

