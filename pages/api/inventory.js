const datastore = require('../../lib/dataStore');

module.exports = function handler(req, res) {
  if (req.method === 'GET') {
    const data = datastore.getAll();
    res.json({ inventory: data.inventory });
  } else if (req.method === 'PUT') {
    const { productName, batchNumber, ...fields } = req.body;
    const updated = datastore.updateInventoryItem(productName, batchNumber, fields);
    if (!updated) return res.status(404).json({ error: 'Item not found' });
    res.json(updated);
  } else res.status(405).end();
};
module.exports.default = module.exports;

