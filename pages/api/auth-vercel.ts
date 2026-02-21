import type { NextApiRequest, NextApiResponse } from 'next';

// Vercel-compatible authentication using environment variables
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { username, password } = req.body;
  
  // Define default accounts - use env vars in production
  const accounts = {
    'yahya': {
      password: process.env.YAHYA_PASSWORD || 'yahya123',
      role: 'admin',
      scope: 'all'
    },
    'bilal': {
      password: process.env.BILAL_PASSWORD || 'bilal123', 
      role: 'admin',
      managedStores: ['Vinted']
    },
    'trendy_shop': {
      password: process.env.TRENDY_PASSWORD || 'shop123',
      role: 'store',
      storeName: 'Trendy Wear'
    },
    'grenz_shop': {
      password: process.env.GRENZ_PASSWORD || 'shop123',
      role: 'store', 
      storeName: 'Grenz Wear'
    },
    'thrift_shop': {
      password: process.env.THRIFT_PASSWORD || 'shop123',
      role: 'store',
      storeName: 'Thrift Wear'
    }
  };

  const account = accounts[username];
  if (!account || account.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Return user object
  const user = {
    role: account.role,
    storeName: account.storeName || null,
    username,
    scope: account.scope || null,
    managedStores: account.managedStores || []
  };

  res.json(user);
}