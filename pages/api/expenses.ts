import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession, isSuperAdmin } from '../../lib/api/session'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function generateExpenseCode(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substr(2, 4).toUpperCase()
  return `EXP-${ts}-${rand}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res)
    if (!session) return

    // ── GET — fetch all expenses ─────────────────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .select('id, expense_code, title, amount, category, occurred_at, created_at')
        .order('occurred_at', { ascending: false })

      if (error) throw error

      const expenses = (data ?? []).map((r: any) => ({
        id: r.id,
        expenseCode: r.expense_code,
        title: r.title,
        amount: num(r.amount),
        category: r.category || 'Misc',
        expense_date: r.occurred_at ? new Date(r.occurred_at).toISOString().slice(0, 10) : '',
        created_at: r.created_at,
      }))

      return res.status(200).json({ expenses })
    }

    // ── POST — add a new expense ─────────────────────────────────────────
    if (req.method === 'POST') {
      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Only super-admins can add expenses' })
      }

      const { title, amount, category, expense_date, notes } = req.body || {}

      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' })
      }

      const amt = num(amount)
      if (amt < 0) {
        return res.status(400).json({ error: 'Amount must be >= 0' })
      }

      const expenseCode = generateExpenseCode()

      const { data: inserted, error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .insert({
          expense_code: expenseCode,
          title: title.trim(),
          amount: amt,
          category: (category || 'Misc').trim(),
          occurred_at: expense_date || new Date().toISOString(),
          created_by: session.accountId,
        })
        .select('id, expense_code, title, amount, category, occurred_at, created_at')
        .single()

      if (error) throw error

      return res.status(201).json({
        expenseCode,
        expense: {
          id: inserted.id,
          expenseCode: inserted.expense_code,
          title: inserted.title,
          amount: num(inserted.amount),
          category: inserted.category || 'Misc',
          expense_date: inserted.occurred_at ? new Date(inserted.occurred_at).toISOString().slice(0, 10) : '',
          created_at: inserted.created_at,
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
