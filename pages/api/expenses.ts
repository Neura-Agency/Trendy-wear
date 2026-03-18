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
        .select('id, title, amount, category, expense_date, notes, created_at, paid_by_owner_id, from_acc, expense_type, owners:paid_by_owner_id ( name )')
        .order('expense_date', { ascending: false })

      if (error) throw error

      const expenses = (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        amount: num(r.amount),
        category: r.category || 'Misc',
        expense_date: r.expense_date ?? '',
        notes: r.notes ?? null,
        created_at: r.created_at,
        paid_by_owner_id: r.paid_by_owner_id ?? null,
        paid_by_owner_name: r.owners?.name ?? null,
        from_acc: r.from_acc ?? null,
        expense_type: r.expense_type ?? null,
      }))

      return res.status(200).json({ expenses })
    }

    // ── POST — add a new expense ─────────────────────────────────────────
    if (req.method === 'POST') {
      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Only super-admins can add expenses' })
      }

      const { title, amount, category, expense_date, notes, paid_by_owner_id, from_acc, expense_type } = req.body || {}

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
          expense_date: expense_date || new Date().toISOString().slice(0, 10),
          notes: notes ?? null,
          paid_by_owner_id: paid_by_owner_id || null,
          from_acc: from_acc || null,
          expense_type: expense_type || 'operational',
        })
        .select('id, title, amount, category, expense_date, notes, created_at, paid_by_owner_id, from_acc, expense_type')
        .single()

      if (error) throw error

      // If owner paid from personal account, create owner_advance transaction
      if (paid_by_owner_id && from_acc === 'Personal' && amt > 0) {
        const expenseDate = expense_date || new Date().toISOString().slice(0, 10)
        await supabaseAdmin
          .from(TABLES.OWNER_TRANSACTIONS)
          .insert({
            owner_id: paid_by_owner_id,
            transaction_type: 'owner_advance',
            amount: amt,
            description: `Personal advance for: ${title.trim()}`,
            occurred_at: new Date(expenseDate + 'T00:00:00Z').toISOString(),
          })
      }

      return res.status(201).json({
        expense: {
          id: inserted.id,
          title: inserted.title,
          amount: num(inserted.amount),
          category: inserted.category || 'Misc',
          expense_date: inserted.expense_date ?? '',
          notes: inserted.notes ?? null,
          created_at: inserted.created_at,
          paid_by_owner_id: inserted.paid_by_owner_id ?? null,
          from_acc: inserted.from_acc ?? null,
          expense_type: inserted.expense_type ?? null,
        },
      })
    }

    // ── PATCH — update an existing expense ──────────────────────────────
    if (req.method === 'PATCH') {
      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Only super-admins can edit expenses' })
      }

      const { id, title, amount, category, expense_date, notes, paid_by_owner_id, from_acc, expense_type } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Expense id is required' })

      // Fetch the current expense to check for transaction changes
      const { data: currentExpense } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .select('*')
        .eq('id', id)
        .single()

      const updates: Record<string, any> = {}
      if (title !== undefined)        updates.title        = String(title).trim()
      if (amount !== undefined)       updates.amount       = num(amount)
      if (category !== undefined)     updates.category     = String(category).trim()
      if (expense_date !== undefined) updates.expense_date = expense_date
      if (notes !== undefined)        updates.notes        = notes ?? null
      if (paid_by_owner_id !== undefined) updates.paid_by_owner_id = paid_by_owner_id || null
      if (from_acc !== undefined)     updates.from_acc     = from_acc || null
      if (expense_type !== undefined) updates.expense_type = expense_type || 'operational'

      const { data: updated, error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .update(updates)
        .eq('id', id)
        .select('id, title, amount, category, expense_date, notes, created_at, paid_by_owner_id, from_acc, expense_type')
        .single()

      if (error) throw error

      // Handle owner_advance transaction updates
      const newOwnerId = paid_by_owner_id !== undefined ? paid_by_owner_id : currentExpense?.paid_by_owner_id
      const newFromAcc = from_acc !== undefined ? from_acc : currentExpense?.from_acc
      const newAmount = amount !== undefined ? num(amount) : currentExpense?.amount
      const newExpenseDate = expense_date !== undefined ? expense_date : currentExpense?.expense_date
      const oldOwnerId = currentExpense?.paid_by_owner_id
      const oldFromAcc = currentExpense?.from_acc
      const oldAmount = currentExpense?.amount

      // Determine if we need to delete the old transaction
      const hadOldTransaction = oldOwnerId && oldFromAcc === 'Personal' && oldAmount > 0
      const hasNewTransaction = newOwnerId && newFromAcc === 'Personal' && newAmount > 0

      if (hadOldTransaction && !hasNewTransaction) {
        // Delete the transaction if the expense is no longer a personal advance
        await supabaseAdmin
          .from(TABLES.OWNER_TRANSACTIONS)
          .delete()
          .eq('owner_id', oldOwnerId)
          .eq('transaction_type', 'owner_advance')
          .eq('amount', oldAmount)
          .gte('created_at', new Date(new Date().getTime() - 60 * 60 * 1000).toISOString())
      } else if (!hadOldTransaction && hasNewTransaction) {
        // Create a new transaction if the expense is now a personal advance
        const expenseDate = newExpenseDate || new Date().toISOString().slice(0, 10)
        await supabaseAdmin
          .from(TABLES.OWNER_TRANSACTIONS)
          .insert({
            owner_id: newOwnerId,
            transaction_type: 'owner_advance',
            amount: newAmount,
            description: `Personal advance for: ${updated.title}`,
            occurred_at: new Date(expenseDate + 'T00:00:00Z').toISOString(),
          })
      } else if (hadOldTransaction && hasNewTransaction) {
        // If both old and new are personal advances, delete old and create new (in case owner or amount changed)
        if (oldOwnerId !== newOwnerId || oldAmount !== newAmount) {
          await supabaseAdmin
            .from(TABLES.OWNER_TRANSACTIONS)
            .delete()
            .eq('owner_id', oldOwnerId)
            .eq('transaction_type', 'owner_advance')
            .eq('amount', oldAmount)
            .gte('created_at', new Date(new Date().getTime() - 60 * 60 * 1000).toISOString())

          const expenseDate = newExpenseDate || new Date().toISOString().slice(0, 10)
          await supabaseAdmin
            .from(TABLES.OWNER_TRANSACTIONS)
            .insert({
              owner_id: newOwnerId,
              transaction_type: 'owner_advance',
              amount: newAmount,
              description: `Personal advance for: ${updated.title}`,
              occurred_at: new Date(expenseDate + 'T00:00:00Z').toISOString(),
            })
        }
      }

      return res.status(200).json({
        expense: {
          id: updated.id,
          title: updated.title,
          amount: num(updated.amount),
          category: updated.category || 'Misc',
          expense_date: updated.expense_date ?? '',
          notes: updated.notes ?? null,
          created_at: updated.created_at,
          paid_by_owner_id: updated.paid_by_owner_id ?? null,
          from_acc: updated.from_acc ?? null,
          expense_type: updated.expense_type ?? null,
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
        .select('paid_by_owner_id, from_acc, amount, expense_date')
        .eq('id', id)
        .single()

      // Delete the expense
      const { error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .delete()
        .eq('id', id)

      if (error) throw error

      // Delete any corresponding owner_advance transaction
      if (expense && expense.paid_by_owner_id && expense.from_acc === 'Personal' && num(expense.amount) > 0) {
        await supabaseAdmin
          .from(TABLES.OWNER_TRANSACTIONS)
          .delete()
          .eq('owner_id', expense.paid_by_owner_id)
          .eq('transaction_type', 'owner_advance')
          .eq('amount', num(expense.amount))
          .gte('created_at', new Date(new Date().getTime() - 60 * 60 * 1000).toISOString())
      }

      return res.status(200).json({ deleted: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('expenses API error:', err)
    return res.status(500).json({ error: err?.message || 'Internal server error' })
  }
}
