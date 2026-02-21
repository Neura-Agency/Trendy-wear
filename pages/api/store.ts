import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const d = datastore.getAll();
    res.json(d); // Return full data including accounts for management
  } else if (req.method === 'POST') {
    const { action, storeName, commission, username, password } = req.body;
    if (action === 'createStore') {
      const result = datastore.createStore(storeName, username, password, commission);
      if (result.error) return res.status(400).json(result);
      return res.status(201).json(result);
    }
    // default: update commission
    const updated = datastore.updateStoreCommission(storeName, commission);
    res.json(updated);
  } else if (req.method === 'PATCH') {
    // mark payout paid
    const { storeName, amount } = req.body;
    const result = datastore.markStorePaid(storeName, amount);
    if (!result) return res.status(404).json({ error: 'Store not found' });
    res.json(result);
  } else res.status(405).end();
}

