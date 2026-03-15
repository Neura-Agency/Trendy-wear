import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * One-time migration endpoint to recalculate commission_amount, admin_take, and profit
 * for all existing orders so that commission is based on Amount Received
 * (gross - deductions) instead of gross amount.
 *
 * GET /api/recalculate-commissions
 */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (_req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { data: orders, error } = await supabaseAdmin
      .from(TABLES.ORDERS)
      .select('id, selling_price, quantity, shipment_cost, cost_price, commission_percent, commission_amount, admin_take, profit')

    if (error) throw error
    if (!orders || orders.length === 0) {
      return res.json({ message: 'No orders to recalculate', updated: 0 })
    }

    let updated = 0
    for (const order of orders) {
      const grossAmount     = num(order.selling_price) * num(order.quantity)
      const totalDeductions = num(order.shipment_cost)
      const costPrice       = num(order.cost_price) * num(order.quantity)
      const commPct         = num(order.commission_percent)

      // NEW formula: commission from Amount Received (gross - deductions)
      const amountReceived     = grossAmount - totalDeductions
      const newCommissionAmount = Math.round(amountReceived * commPct) / 100
      const newAdminTake        = amountReceived - newCommissionAmount
      const newProfit           = newAdminTake - costPrice

      // Only update if values actually changed
      if (
        num(order.commission_amount) !== newCommissionAmount ||
        num(order.admin_take) !== newAdminTake ||
        num(order.profit) !== newProfit
      ) {
        const { error: updateErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({
            commission_amount: newCommissionAmount,
            admin_take:        newAdminTake,
            profit:            newProfit,
          })
          .eq('id', order.id)

        if (updateErr) {
          console.error(`Failed to update order ${order.id}:`, updateErr)
        } else {
          updated++
        }
      }
    }

    return res.json({
      message: `Recalculated commissions from Amount Received for ${updated} of ${orders.length} orders`,
      updated,
      total: orders.length,
    })
  } catch (e: any) {
    console.error('recalculate-commissions error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}
