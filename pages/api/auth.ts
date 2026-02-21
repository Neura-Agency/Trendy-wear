import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { username, password } = req.body;
  
  // Use environment variables on Vercel, fallback to datastore locally
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    // Vercel-compatible authentication using environment variables
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
      },
      'preloved_shop': {
        password: process.env.PRELOVED_PASSWORD || 'shop123',
        role: 'store',
        storeName: 'Preloved Wear'
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

    return res.json(user);
  }
  
  // Local development - use datastore
  const user = datastore.authenticate(username, password);
  
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  res.json(user);
}

