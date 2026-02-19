const datastore = require('../../lib/dataStore');

module.exports = function handler(req, res) {
  if (req.method === 'GET') {
    const data = datastore.getAll();
    res.json({ purchases: data.purchases, inventory: data.inventory });
  } else if (req.method === 'POST') {
    const created = datastore.addPurchase(req.body);
    res.status(201).json(created);
  } else res.status(405).end();
};
module.exports.default = module.exports;
