const datastore = require('../../lib/dataStore');

module.exports = function handler(req, res) {
  if (req.method === 'GET') {
    const d = datastore.getAll();
    res.json({ clients: d.clients || [] });
  } else if (req.method === 'POST') {
    const { action, clientId, ...body } = req.body;
    if (action === 'addClient') {
      return res.status(201).json(datastore.addClient(body));
    }
    if (action === 'addOrder') {
      return res.json(datastore.addClientOrder(clientId, body));
    }
    if (action === 'addPayment') {
      return res.json(datastore.addClientPayment(clientId, body.amount));
    }
    res.status(400).json({ error: 'Unknown action' });
  } else res.status(405).end();
};
module.exports.default = module.exports;
