const datastore = require('../../lib/dataStore');

module.exports = function handler(req, res) {
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
      const updated = datastore.updateOrderCommission(id, parseFloat(commissionPercent));
      return res.json(updated);
    }
    if (includedInPayout !== undefined) {
      const updated = datastore.toggleOrderInPayout(id, includedInPayout);
      return res.json(updated);
    }
    res.status(400).json({ error: 'nothing to update' });
  } else res.status(405).end();
};
module.exports.default = module.exports;
