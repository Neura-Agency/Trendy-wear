import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireAdmin, requireSession } from '../../lib/api/session'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function mapTransaction(row: any) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner?.name ?? null,
    transactionType: row.transaction_type,
    amount: num(row.amount),
    description: row.description ?? null,
    counterpartOwnerId: row.counterpart_owner_id ?? null,
    counterpartOwnerName: row.counterpart_owner?.name ?? null,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // GET requires session, POST/DELETE require admin
    const session = req.method === 'GET'
      ? await requireSession(req, res)
      : await requireAdmin(req, res)
    if (!session) return

    // ── GET — fetch all transfer transactions ────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from(TABLES.OWNER_TRANSACTIONS)
        .select('*, owner:owner_id ( name ), counterpart_owner:counterpart_owner_id ( name )')
        .in('transaction_type', ['internal_transfer_out', 'internal_transfer_in'])
        .order('occurred_at', { ascending: false })

      if (error) throw error
      return res.json({ transactions: (data || []).map(mapTransaction) })
    }

    // ── POST — create a transfer (2 rows: out for sender, in for receiver) ──
    if (req.method === 'POST') {
      const { fromOwnerId, toOwnerId, amount, description } = req.body || {}
      if (!fromOwnerId || !toOwnerId) {
        return res.status(400).json({ error: 'fromOwnerId and toOwnerId required' })
      }
      if (fromOwnerId === toOwnerId) {
        return res.status(400).json({ error: 'Cannot transfer to self' })
      }
      const amt = num(amount)
      if (amt <= 0) {
        return res.status(400).json({ error: 'Amount must be > 0' })
      }

      const now = new Date().toISOString()

      // Insert both rows
      const { data, error } = await supabaseAdmin
        .from(TABLES.OWNER_TRANSACTIONS)
        .insert([
          {
            owner_id: fromOwnerId,
            transaction_type: 'internal_transfer_out',
            amount: amt,
            counterpart_owner_id: toOwnerId,
            description: description || null,
            occurred_at: now,
          },
          {
            owner_id: toOwnerId,
            transaction_type: 'internal_transfer_in',
            amount: amt,
            counterpart_owner_id: fromOwnerId,
            description: description || null,
            occurred_at: now,
          },
        ])
        .select('*, owner:owner_id ( name ), counterpart_owner:counterpart_owner_id ( name )')

      if (error) throw error
      return res.status(201).json({ transactions: (data || []).map(mapTransaction) })
    }

    // ── DELETE — remove a transfer pair (both the out and in rows) ───────
    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })

      // Fetch the transaction to find its pair
      const { data: txn, error: fetchErr } = await supabaseAdmin
        .from(TABLES.OWNER_TRANSACTIONS)
        .select('*')
        .eq('id', id)
        .single()

      if (fetchErr || !txn) {
        return res.status(404).json({ error: 'Transaction not found' })
      }

      // Delete this transaction
      await supabaseAdmin
        .from(TABLES.OWNER_TRANSACTIONS)
        .delete()
        .eq('id', id)

      // Also delete the counterpart (matching owner/counterpart/amount/occurred_at within 1 second)
      const counterType = txn.transaction_type === 'internal_transfer_out'
        ? 'internal_transfer_in'
        : 'internal_transfer_out'

      await supabaseAdmin
        .from(TABLES.OWNER_TRANSACTIONS)
        .delete()
        .eq('owner_id', txn.counterpart_owner_id)
        .eq('counterpart_owner_id', txn.owner_id)
        .eq('transaction_type', counterType)
        .eq('amount', txn.amount)
        .gte('occurred_at', new Date(new Date(txn.occurred_at).getTime() - 1000).toISOString())
        .lte('occurred_at', new Date(new Date(txn.occurred_at).getTime() + 1000).toISOString())

      return res.json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('owner-transfers API error:', err)
    return res.status(500).json({ error: err?.message || 'Internal server error' })
  }
}
