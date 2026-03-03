import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireAdmin, requireSession } from '../../lib/api/session'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ─── helpers ──────────────────────────────────────────────────────────
function mapOwner(row: any) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    profitSharePercent: num(row.profit_share_percent),
    notes: row.notes ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalPaidOut: num(row.total_paid_out),
    payoutCount: num(row.payout_count),
    lastPayoutAt: row.last_payout_at ?? null,
  }
}

function mapPayout(row: any) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owners?.name ?? null,
    amount: num(row.amount),
    periodFrom: row.period_from,
    periodTo: row.period_to,
    notes: row.notes ?? null,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }
}

/**
 * Fetch all active owners and set each one to 100 / n equally.
 * The last owner absorbs any rounding remainder so the sum is always exactly 100.
 */
async function redistributeEqually() {
  const { data: active } = await supabaseAdmin
    .from(TABLES.OWNERS)
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const list = active || []
  if (list.length === 0) return

  const base = Math.floor((100 / list.length) * 100) / 100
  let assigned = 0
  for (let i = 0; i < list.length; i++) {
    const isLast = i === list.length - 1
    const pct = isLast ? Math.round((100 - assigned) * 100) / 100 : base
    assigned += pct
    await supabaseAdmin
      .from(TABLES.OWNERS)
      .update({ profit_share_percent: pct })
      .eq('id', list[i].id)
  }
}

// ─── handler ──────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = req.method === 'GET'
      ? await requireSession(req, res)
      : await requireAdmin(req, res)
    if (!session) return

    // ── subresource: /api/owners?payouts=1  or  /api/owners?payouts=1&ownerId=xxx
    const showPayouts = req.query.payouts === '1'

    // ══════════════════════
    //  GET
    // ══════════════════════
    if (req.method === 'GET') {
      if (showPayouts) {
        // Return payout history   (optionally filtered by ownerId)
        let q = supabaseAdmin
          .from(TABLES.OWNER_PAYOUTS)
          .select(`*, owners:owner_id ( name )`)
          .order('paid_at', { ascending: false })

        if (req.query.ownerId) {
          q = q.eq('owner_id', String(req.query.ownerId))
        }

        const { data, error } = await q
        if (error) {
          console.error('owner_payouts GET error:', error)
          return res.status(500).json({ error: 'Failed to fetch payouts' })
        }
        return res.json({ payouts: (data || []).map(mapPayout) })
      }

      // Return owners + aggregated payout summary via view
      const { data, error } = await supabaseAdmin
        .from('owner_payout_summary')   // the view we created
        .select('*')
        .order('name', { ascending: true })

      if (error) {
        // fallback: plain owners table if view not created yet
        console.warn('owner_payout_summary view not found, falling back to owners table:', error.message)
        const { data: r2, error: e2 } = await supabaseAdmin
          .from(TABLES.OWNERS)
          .select('*')
          .order('name', { ascending: true })
        if (e2) return res.status(500).json({ error: 'Failed to fetch owners' })
        return res.json({ owners: (r2 || []).map(mapOwner) })
      }

      return res.json({ owners: (data || []).map(mapOwner) })
    }

    // ══════════════════════
    //  POST  — create owner  or  record a payout
    // ══════════════════════
    if (req.method === 'POST') {
      if (showPayouts) {
        // Record a payout
        const { ownerId, amount, periodFrom, periodTo, notes } = req.body || {}
        if (!ownerId) return res.status(400).json({ error: 'ownerId is required' })
        if (!amount || num(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' })
        if (!periodFrom || !periodTo) return res.status(400).json({ error: 'periodFrom and periodTo are required' })

        const { data, error } = await supabaseAdmin
          .from(TABLES.OWNER_PAYOUTS)
          .insert({
            owner_id: String(ownerId),
            amount: num(amount),
            period_from: String(periodFrom),
            period_to: String(periodTo),
            notes: notes ? String(notes) : null,
            created_by: session.accountId ?? null,
          })
          .select('*, owners:owner_id ( name )')
          .single()

        if (error) {
          console.error('owner_payouts POST error:', error)
          return res.status(500).json({ error: 'Failed to record payout' })
        }
        return res.status(201).json({ payout: mapPayout(data) })
      }

      // Create owner
      const { name, phone, email, notes } = req.body || {}
      if (!name) return res.status(400).json({ error: 'name is required' })

      const { data, error } = await supabaseAdmin
        .from(TABLES.OWNERS)
        .insert({
          name: String(name),
          phone: phone ? String(phone) : null,
          email: email ? String(email) : null,
          profit_share_percent: 0,
          notes: notes ? String(notes) : null,
        })
        .select('*')
        .single()

      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: `Owner "${name}" already exists` })
        console.error('owners POST error:', error)
        return res.status(500).json({ error: 'Failed to create owner' })
      }

      // Redistribute equally among all active owners (including the new one)
      await redistributeEqually()

      return res.status(201).json({ owner: mapOwner(data) })
    }

    // ══════════════════════
    //  PATCH  — edit owner  or  delete payout
    // ══════════════════════
    if (req.method === 'PATCH') {
      const { id, fields } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })

      if (showPayouts) {
        // Update a payout record
        const allowed: Record<string, any> = {}
        if (fields?.amount !== undefined) allowed.amount = num(fields.amount)
        if (fields?.periodFrom !== undefined) allowed.period_from = String(fields.periodFrom)
        if (fields?.periodTo !== undefined) allowed.period_to = String(fields.periodTo)
        if (fields?.notes !== undefined) allowed.notes = fields.notes ?? null
        if (fields?.paidAt !== undefined) allowed.paid_at = String(fields.paidAt)

        const { data, error } = await supabaseAdmin
          .from(TABLES.OWNER_PAYOUTS)
          .update(allowed)
          .eq('id', String(id))
          .select('*, owners:owner_id ( name )')
          .single()

        if (error) return res.status(500).json({ error: 'Failed to update payout' })
        return res.json({ payout: mapPayout(data) })
      }

      // Update an owner
      const allowed: Record<string, any> = {}
      if (fields?.name !== undefined) allowed.name = String(fields.name)
      if (fields?.phone !== undefined) allowed.phone = fields.phone ?? null
      if (fields?.email !== undefined) allowed.email = fields.email ?? null
      if (fields?.notes !== undefined) allowed.notes = fields.notes ?? null
      if (fields?.isActive !== undefined) allowed.is_active = Boolean(fields.isActive)

      const { data, error } = await supabaseAdmin
        .from(TABLES.OWNERS)
        .update(allowed)
        .eq('id', String(id))
        .select('*')
        .single()

      if (error) return res.status(500).json({ error: 'Failed to update owner' })

      // If toggling active status, redistribute shares equally
      if (allowed.is_active !== undefined) {
        await redistributeEqually()
      }

      return res.json({ owner: mapOwner(data) })
    }

    // ══════════════════════
    //  DELETE  — remove payout or deactivate owner
    // ══════════════════════
    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })

      if (showPayouts) {
        const { error } = await supabaseAdmin
          .from(TABLES.OWNER_PAYOUTS)
          .delete()
          .eq('id', String(id))
        if (error) return res.status(500).json({ error: 'Failed to delete payout' })
        return res.json({ success: true })
      }

      // Soft-delete: mark inactive rather than hard-delete to preserve history
      const { error } = await supabaseAdmin
        .from(TABLES.OWNERS)
        .update({ is_active: false })
        .eq('id', String(id))
      if (error) return res.status(500).json({ error: 'Failed to deactivate owner' })

      // Redistribute equally among the remaining active owners
      await redistributeEqually()

      return res.json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('owners API error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
