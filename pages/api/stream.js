const datastore = require('../../lib/dataStore');

module.exports = function handler(req, res){
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.write('\n');

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  const onChange = (d) => send({ type: 'change', payload: d });
  datastore.on('change', onChange);

  req.on('close', ()=>{
    datastore.removeListener('change', onChange);
  });
}
module.exports.default = module.exports;
