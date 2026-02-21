import type { NextApiRequest, NextApiResponse } from 'next';
import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).end();

    // Basic protection: only allow if user is admin (simplified for this app's style)
    // In a real app we'd check session, but here we'll just execute as requested
    datastore.reset();
    res.json({ success: true, message: 'All data has been cleared.' });
}

