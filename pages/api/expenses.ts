import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { serverEvents } from '../../lib/serverEvents'
import { requireAdmin } from '../../lib/api/session'

const mapExpenseRow = (r: any) => ({
  id: r.expense_code ?? r.id,
  title: r.title,
  amount: Number(r.amount) || 0,
  date: r.occurred_at,
  category: r.category ?? undefined
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireAdmin(req, res)
    if (!session) return

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .select('*')
        .order('occurred_at', { ascending: true })

      if (error) throw error
      return res.json({ expenses: (data ?? []).map(mapExpenseRow) })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const expenseCode = `e_${Date.now()}`
      const amount = Number(body.amount) || 0
      const category = body.category ?? null

      const title = body.title || body.description || category || 'Expense'

      const { data, error } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .insert({
          expense_code: expenseCode,
          title,
          amount,
          category,
          occurred_at: body.date ?? new Date().toISOString()
        })
        .select('*')
        .single()

      if (error) throw error
      serverEvents.emit('change', { ts: Date.now(), type: 'expenses' })
      return res.status(201).json(mapExpenseRow(data))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('expenses api error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

