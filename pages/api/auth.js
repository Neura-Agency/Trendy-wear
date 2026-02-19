const datastore = require('../../lib/dataStore');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username, password } = req.body;
  const user = datastore.authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  res.json(user);
};
module.exports.default = module.exports;
