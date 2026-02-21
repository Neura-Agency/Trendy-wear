import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const data = datastore.getAll();
    res.json({ inventory: data.inventory });
  } else if (req.method === 'PUT') {
    const { productName, batchNumber, ...fields } = req.body;
    const updated = datastore.updateInventoryItem(productName, batchNumber, fields);
    if (!updated) return res.status(404).json({ error: 'Item not found' });
    res.json(updated);
  } else res.status(405).end();
}

