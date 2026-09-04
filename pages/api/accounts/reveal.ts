import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../../lib/supabase';
import { requireAdmin, isSuperAdmin } from '../../../lib/api/session';
import type { SessionContext } from '../../../lib/api/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const session = await requireAdmin(req, res);
    if (!session) return;
    res.setHeader('Cache-Control', 'no-store');

    const username = String(req.body?.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const { data: account, error } = await supabaseAdmin
      .from(TABLES.ACCOUNTS)
      .select('id, username, role, scope, store_id, managed_stores, plain_password, is_active')
      .eq('username', username)
      .maybeSingle();
    if (error || !account) return res.status(404).json({ error: 'Account not found' });

    if (!(await canReveal(session, account))) return res.status(403).json({ error: 'Forbidden' });

    if (!account.plain_password) {
      return res.status(404).json({ error: `No password stored for "${account.username}". Set one via the Edit button.` });
    }

    return res.json({ success: true, username: account.username, password: account.plain_password });
  } catch (e) {
    console.error('reveal-password error');
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function canReveal(session: SessionContext, account: any): Promise<boolean> {
  if (isSuperAdmin(session)) return true;
  if (!session.managedStores || session.managedStores.length === 0) return false;
  const storeName = await resolveAccountStoreName(account);
  return !!storeName && session.managedStores.includes(storeName);
}

async function resolveAccountStoreName(account: any): Promise<string | null> {
  if (account.store_id) {
    const { data } = await supabaseAdmin.from(TABLES.STORES).select('name').eq('id', account.store_id).maybeSingle();
    if (data?.name) return data.name;
  }
  const { data: owners } = await supabaseAdmin.from(TABLES.STORE_OWNERS).select('id').eq('account', account.id);
  const ownerId = owners?.[0]?.id;
  if (ownerId) {
    const { data: store } = await supabaseAdmin.from(TABLES.STORES).select('name').eq('owner_id', ownerId).maybeSingle();
    return store?.name ?? null;
  }
  return null;
}