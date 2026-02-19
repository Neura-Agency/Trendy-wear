const ds = require('../../lib/dataStore');

function handler(req, res) {
  if (req.method === 'GET') {
    const d = ds.getAll();
    res.json({ storeInventory: d.storeInventory || {} });
  } else if (req.method === 'POST') {
    // owner assigns item to a store
    const { storeName, productName, ownerSupplyPrice, quantity, commissionPercent } = req.body;
    if (!storeName || !productName || ownerSupplyPrice === undefined || quantity === undefined || commissionPercent === undefined)
      return res.status(400).json({ error: 'storeName, productName, ownerSupplyPrice, quantity and commissionPercent are required.' });
    const result = ds.assignItemToStore(storeName, productName, ownerSupplyPrice, quantity, commissionPercent);
    res.json(result);
  } else if (req.method === 'PATCH') {
    // store updates their selling price
    const { storeName, productName, storeSellingPrice } = req.body;
    if (!storeName || !productName || !storeSellingPrice)
      return res.status(400).json({ error: 'storeName, productName and storeSellingPrice are required.' });
    const result = ds.setStoreSellingPrice(storeName, productName, storeSellingPrice);
    if (!result) return res.status(404).json({ error: 'Item not found in store inventory.' });
    res.json(result);
  } else {
    res.status(405).end();
  }
}

module.exports = handler;
module.exports.default = module.exports;
