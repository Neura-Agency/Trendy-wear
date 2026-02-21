import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const data = datastore.getAll();
    res.json({ orders: data.orders, stores: data.stores });
  } else if (req.method === 'POST') {
    const created = datastore.addOrder(req.body);
    res.status(201).json(created);
  } else if (req.method === 'PATCH') {
    // update commission or includedInPayout per order
    const { id, commissionPercent, includedInPayout } = req.body;
    if (commissionPercent !== undefined) {
      const parsedCommission = typeof commissionPercent === 'string' ? parseFloat(commissionPercent) : commissionPercent;
      const updated = datastore.updateOrderCommission(id, parsedCommission);
      return res.json(updated);
    }
    if (includedInPayout !== undefined) {
      const updated = datastore.toggleOrderInPayout(id, includedInPayout);
      return res.json(updated);
    }
    res.status(400).json({ error: 'nothing to update' });
  } else res.status(405).end();
}

