import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { serverEvents } from '../../lib/serverEvents'
import { ensureStore, pickInventoryBatchForSale } from '../../lib/api/supabaseHelpers'
import { requireAdmin } from '../../lib/api/session'

const mapClientRow = (r: any) => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  orders: [],
  paymentsReceived: Number(r.payments_received) || 0
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireAdmin(req, res)
    if (!session) return

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from(TABLES.CLIENTS)
        .select('*')
        .order('created_at', { ascending: true })

      if (error) throw error
      return res.json({ clients: (data ?? []).map(mapClientRow) })
    }

    if (req.method === 'POST') {
      const { action, clientId, ...body } = req.body || {}

      if (action === 'addClient') {
        const { data, error } = await supabaseAdmin
          .from(TABLES.CLIENTS)
          .insert({ name: body.name, phone: body.phone ?? null, payments_received: 0 })
          .select('*')
          .single()
        if (error) throw error
        serverEvents.emit('change', { ts: Date.now(), type: 'clients' })
        return res.status(201).json(mapClientRow(data))
      }

      if (action === 'addPayment') {
        if (!clientId) return res.status(400).json({ error: 'clientId is required' })
        const amount = Number(body.amount) || 0

        const { data: existing, error: getErr } = await supabaseAdmin
          .from(TABLES.CLIENTS)
          .select('*')
          .eq('id', clientId)
          .single()
        if (getErr) throw getErr

        const next = (Number(existing.payments_received) || 0) + amount
        const { data: updated, error: updErr } = await supabaseAdmin
          .from(TABLES.CLIENTS)
          .update({ payments_received: next })
          .eq('id', clientId)
          .select('*')
          .single()
        if (updErr) throw updErr

        serverEvents.emit('change', { ts: Date.now(), type: 'clients' })
        return res.json(mapClientRow(updated))
      }

      if (action === 'addOrder') {
        if (!clientId) return res.status(400).json({ error: 'clientId is required' })

        const store = await ensureStore('Direct', 0)

        const productName = String(body.productName || '').trim()
        if (!productName) return res.status(400).json({ error: 'productName is required' })

        const qty = Math.max(1, parseInt(body.quantity, 10) || 1)
        const sellingPrice = Number(body.sellingPrice) || 0
        const shipmentCost = Number(body.shipmentCost) || 0
        const occurredAt = new Date().toISOString()

        const invBatch = await pickInventoryBatchForSale(productName)
        const costPrice = Number(invBatch?.cost_price) || 0

        if (invBatch) {
          const nextQty = Math.max(0, (Number(invBatch.quantity_available) || 0) - qty)
          const { error: invUpdErr } = await supabaseAdmin
            .from(TABLES.INVENTORY)
            .update({ quantity_available: nextQty })
            .eq('id', invBatch.id)
          if (invUpdErr) throw invUpdErr
        }

        const gross = sellingPrice * qty
        const netAfterShipment = gross - shipmentCost
        const commissionPercent = 0
        const commissionAmount = 0
        const adminTake = netAfterShipment
        const profit = adminTake - (costPrice * qty)

        const orderCode = `co_${Date.now()}`
        const { data: created, error } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .insert({
            order_code: orderCode,
            store_id: store.id,
            client_id: clientId,
            product_name: productName,
            quantity: qty,
            selling_price: sellingPrice,
            shipment_cost: shipmentCost,
            client_name: body.clientName ?? null,
            order_type: body.type ?? 'Sale',
            occurred_at: occurredAt,
            included_in_payout: true,
            commission_percent: commissionPercent,
            cost_price: costPrice,
            commission_amount: commissionAmount,
            admin_take: adminTake,
            profit: profit
          })
          .select('*')
          .single()

        if (error) throw error
        serverEvents.emit('change', { ts: Date.now(), type: 'orders' })
        return res.json({
          id: created.id,
          productName,
          quantity: qty,
          sellingPrice,
          shipmentCost,
          storeName: 'Direct',
          clientName: created.client_name,
          type: created.order_type,
          date: created.occurred_at,
          includedInPayout: true,
          commissionPercent,
          costPrice,
          commissionAmount,
          adminTake,
          profit
        })
      }

      return res.status(400).json({ error: 'Unknown action' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('clients api error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

