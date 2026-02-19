const datastore = require('../../lib/dataStore');

module.exports = function handler(req, res) {
  if (req.method === 'GET') {
    const data = datastore.getAll();
    res.json({ expenses: data.expenses });
  } else if (req.method === 'POST') {
    const created = datastore.addExpense(req.body);
    res.status(201).json(created);
  } else res.status(405).end();
};
module.exports.default = module.exports;
