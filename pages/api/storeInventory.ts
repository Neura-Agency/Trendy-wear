import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const d = datastore.getAll();
    res.json({ storeInventory: d.storeInventory || {} });
  } else if (req.method === 'POST') {
    // owner assigns item to a store
    const { storeName, productName, ownerSupplyPrice, quantity, commissionPercent, owner } = req.body;
    if (!storeName || !productName || ownerSupplyPrice === undefined || quantity === undefined || commissionPercent === undefined)
      return res.status(400).json({ error: 'storeName, productName, ownerSupplyPrice, quantity and commissionPercent are required.' });
    const result = (datastore as any).assignItemToStore(storeName, productName, ownerSupplyPrice, quantity, commissionPercent, owner);
    if (result?.error) return res.status(400).json(result);
    res.json(result);
  } else if (req.method === 'PATCH') {
    // store updates their selling price
    const { storeName, productName, storeSellingPrice } = req.body;
    if (!storeName || !productName || !storeSellingPrice)
      return res.status(400).json({ error: 'storeName, productName and storeSellingPrice are required.' });
    const result = datastore.setStoreSellingPrice(storeName, productName, storeSellingPrice);
    if (!result) return res.status(404).json({ error: 'Item not found in store inventory.' });
    res.json(result);
  } else {
    res.status(405).end();
  }
}

