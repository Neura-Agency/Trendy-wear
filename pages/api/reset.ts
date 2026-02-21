import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { serverEvents } from '../../lib/serverEvents'
import { requireAdmin, isSuperAdmin } from '../../lib/api/session'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const session = await requireAdmin(req, res)
    if (!session) return
    if (!isSuperAdmin(session)) {
        return res.status(403).json({ success: false, error: 'Forbidden' })
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    if (process.env.ALLOW_RESET !== 'true') {
        return res.status(403).json({
            success: false,
            error: 'Reset disabled',
            message: 'Set ALLOW_RESET=true to enable /api/reset'
        })
    }

    try {
        async function deleteAllRows(table: string, column: string, sentinelValue: string) {
            const { error } = await (supabaseAdmin as any).from(table).delete().neq(column, sentinelValue)
            if (error) throw error
        }

        // Delete in FK-safe order
        await deleteAllRows(TABLES.AUDIT_LOGS, 'id', NIL_UUID)
        await deleteAllRows(TABLES.ORDERS, 'id', NIL_UUID)
        await deleteAllRows(TABLES.STORE_INVENTORY, 'id', NIL_UUID)
        await deleteAllRows(TABLES.PURCHASES, 'id', NIL_UUID)
        await deleteAllRows(TABLES.EXPENSES, 'id', NIL_UUID)
        await deleteAllRows(TABLES.CLIENTS, 'id', NIL_UUID)
        await deleteAllRows(TABLES.INVENTORY, 'id', NIL_UUID)
        await deleteAllRows(TABLES.STORES, 'id', NIL_UUID)

        const { error: settingsErr } = await supabaseAdmin.from(TABLES.SETTINGS).delete().neq('key', '__never__')
        if (settingsErr) throw settingsErr

        // Re-seed default settings (same as schema defaults)
        const { error: seedErr } = await supabaseAdmin
            .from(TABLES.SETTINGS)
            .upsert(
                [
                    { key: 'defaultCommission', value: 10 },
                    { key: 'lowStockThreshold', value: 5 }
                ],
                { onConflict: 'key' }
            )
        if (seedErr) throw seedErr

        serverEvents.emit('change', { type: 'reset' })
        return res.json({ success: true, message: 'All Supabase data has been cleared.' });
    } catch (err: any) {
        console.error('reset api error:', err)
        return res.status(500).json({ success: false, error: err?.message || 'Internal server error' })
    }
}

