import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase';
import { requireSession, isSuperAdmin } from '../../lib/api/session';
import bcrypt from 'bcryptjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res);
    if (!session) return;

    // Only admins can modify accounts
    if (session.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (req.method === 'PATCH') {
      const { username, originalUsername, password, role, isActive } = req.body;

      // We require at least the original username or the username to identify the account
      const matchUsername = originalUsername || username;
      if (!matchUsername) {
        return res.status(400).json({ error: 'Username is required to identify account' });
      }

      // Build update object
      const updates: any = {};

      // Update password if provided
      if (password && password.trim() !== '') {
        const passwordHash = await bcrypt.hash(password, 10)
        updates.password_hash = passwordHash
        updates.plain_password = password
      }

      // Update role if provided
      if (role && (role === 'admin' || role === 'store')) {
        updates.role = role;
      }

      // Update status if provided
      if (typeof isActive === 'boolean') {
        updates.is_active = isActive;
      }

      // If username is being changed, include it in updates (but use original to match)
      if (username && username !== matchUsername) {
        updates.username = username;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      // Update the account using the matchUsername to locate the existing row
      const resp = await supabaseAdmin
        .from(TABLES.ACCOUNTS)
        .update(updates)
        .eq('username', matchUsername)
        .select('id, username, role, is_active')
        .maybeSingle();

      const { data, error } = resp as any;

      if (error) {
        console.error('Error updating account:', error);
        return res.status(500).json({ error: 'Failed to update account' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Account not found' });
      }

      return res.json({ success: true, account: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('Accounts API error:', e);
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}
