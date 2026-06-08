import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession, isSuperAdmin } from '../../lib/api/session'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res)
    if (!session) return

    // ── GET — fetch all expenses ─────────────────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .select('id, title, amount, category, occurred_at, created_at')
        .order('occurred_at', { ascending: false })

      if (error) throw error

      const expenses = (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        amount: num(r.amount),
        category: r.category || 'Misc',
        expense_date: r.occurred_at ? r.occurred_at.slice(0, 10) : '',
        notes: null,
        created_at: r.created_at,
        paid_by_owner_id: null,
        paid_by_owner_name: null,
        from_acc: null,
        expense_type: null,
      }))

      return res.status(200).json({ expenses })
    }

    // ── POST — add a new expense ─────────────────────────────────────────
    if (req.method === 'POST') {
      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Only super-admins can add expenses' })
      }

      const { title, amount, category } = req.body || {}

      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' })
      }

      const amt = num(amount)
      if (amt < 0) {
        return res.status(400).json({ error: 'Amount must be >= 0' })
      }

      const { data: inserted, error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .insert({
          title: title.trim(),
          amount: amt,
          category: (category || 'Misc').trim(),
        })
        .select('id, title, amount, category, occurred_at, created_at')
        .single()

      if (error) throw error

      return res.status(201).json({
        expense: {
          id: inserted.id,
          title: inserted.title,
          amount: num(inserted.amount),
          category: inserted.category || 'Misc',
          expense_date: inserted.occurred_at ? inserted.occurred_at.slice(0, 10) : '',
          notes: null,
          created_at: inserted.created_at,
          paid_by_owner_id: null,
          from_acc: null,
          expense_type: null,
        },
      })
    }

    // ── PATCH — update an existing expense ──────────────────────────────
    if (req.method === 'PATCH') {
      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Only super-admins can edit expenses' })
      }

      const { id, title, amount, category } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Expense id is required' })

      const updates: Record<string, any> = {}
      if (title !== undefined)    updates.title    = String(title).trim()
      if (amount !== undefined)   updates.amount   = num(amount)
      if (category !== undefined) updates.category = String(category).trim()

      const { data: updated, error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .update(updates)
        .eq('id', id)
        .select('id, title, amount, category, occurred_at, created_at')
        .single()

      if (error) throw error

      return res.status(200).json({
        expense: {
          id: updated.id,
          title: updated.title,
          amount: num(updated.amount),
          category: updated.category || 'Misc',
          expense_date: updated.occurred_at ? updated.occurred_at.slice(0, 10) : '',
          notes: null,
          created_at: updated.created_at,
          paid_by_owner_id: null,
          from_acc: null,
          expense_type: null,
        },
      })
    }

    // ── DELETE — remove an expense ───────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Only super-admins can delete expenses' })
      }

      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Expense id is required' })

      // Fetch the expense to check if it has an owner_advance transaction
      const { data: expense } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .select('amount')
        .eq('id', id)
        .single()

      // Delete the expense
      const { error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .delete()
        .eq('id', id)

      if (error) throw error

      return res.status(200).json({ deleted: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('expenses API error:', err)
    return res.status(500).json({ error: err?.message || 'Internal server error' })
  }
}
