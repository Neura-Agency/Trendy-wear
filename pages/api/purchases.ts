import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const data = datastore.getAll();
    res.json({ purchases: data.purchases, inventory: data.inventory });
  } else if (req.method === 'POST') {
    const created = datastore.addPurchase(req.body);
    res.status(201).json(created);
  } else if (req.method === 'PATCH') {
    const { productName, batchNumber, quantityDelta, ...fields } = req.body || {};
    if (!productName || !batchNumber) {
      return res.status(400).json({ error: 'productName and batchNumber are required.' });
    }

    let updated = null;
    if (quantityDelta !== undefined && quantityDelta !== null) {
      updated = (datastore as any).adjustInventoryQuantity(productName, batchNumber, quantityDelta);
    } else {
      updated = datastore.updateInventoryItem(productName, batchNumber, fields);
    }

    if (!updated) return res.status(404).json({ error: 'Inventory item not found.' });
    res.json(updated);
  } else res.status(405).end();
}

