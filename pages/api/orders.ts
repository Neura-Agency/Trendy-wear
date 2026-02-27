import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession, getAllowedStoreIds, isSuperAdmin } from '../../lib/api/session'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function generateOrderCode(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substr(2, 4).toUpperCase()
  return `ORD-${ts}-${rand}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res)
    if (!session) return

    // ────────────────────────────────────────────────────────────────────────
    // GET — fetch orders scoped to the current user
    // ────────────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const allowedStoreIds = await getAllowedStoreIds(session)

      let query = supabaseAdmin
        .from(TABLES.ORDERS)
        .select(`
          id,
          order_code,
          store_id,
          product_id,
          product_name,
          store_inventory_id,
          quantity,
          selling_price,
          shipment_cost,
          client_name,
          order_type,
          occurred_at,
          included_in_payout,
          commission_percent,
          cost_price,
          commission_amount,
          admin_take,
          profit,
          created_at,
          stores:store_id ( name )
        `)
        .order('occurred_at', { ascending: false })

      if (Array.isArray(allowedStoreIds)) {
        query = query.in(
          'store_id',
          allowedStoreIds.length ? allowedStoreIds : ['00000000-0000-0000-0000-000000000000']
        )
      }

      const { data, error } = await query
      if (error) {
        console.error('orders GET error:', error)
        return res.status(500).json({ error: 'Failed to fetch orders' })
      }

      const orders = (data || []).map((row: any) => ({
        id: row.id,
        orderCode: row.order_code,
        productName: row.product_name,
        quantity: num(row.quantity),
        sellingPrice: num(row.selling_price),
        shipmentCost: num(row.shipment_cost),
        storeName: row.stores?.name ?? '',
        clientName: row.client_name ?? '',
        type: row.order_type ?? 'Sale',
        date: row.occurred_at ?? row.created_at,
        includedInPayout: row.included_in_payout ?? false,
        commissionPercent: num(row.commission_percent),
        costPrice: num(row.cost_price),
        commissionAmount: num(row.commission_amount),
        adminTake: num(row.admin_take),
        profit: num(row.profit),
      }))

      return res.json({ orders })
    }

    // ────────────────────────────────────────────────────────────────────────
    // POST — record a new sale
    // ────────────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const {
        productName,
        quantity,
        extraQty,       // bonus/free units dispatched (stock deducted but not billed)
        sellingPrice,
        shipmentCost,
        extraCharges,
        clientName,
        orderType,
        occurredAt,
        storeName,
      } = req.body || {}

      if (!productName) return res.status(400).json({ error: 'productName is required' })
      const qty = num(quantity)
      if (qty < 1) return res.status(400).json({ error: 'quantity must be at least 1' })
      const bonusQty = Math.max(0, num(extraQty))
      const totalDispatch = qty + bonusQty
      const price = num(sellingPrice)
      if (price <= 0) return res.status(400).json({ error: 'sellingPrice must be > 0' })

      // Total deductions rolled into shipment_cost column
      const totalDeductions = num(shipmentCost) + num(extraCharges)

      // ── Resolve store_id ─────────────────────────────────────────────────
      let storeId: string | null = null
      let resolvedStoreName: string = storeName ?? ''

      if (session.role === 'store') {
        storeId = session.storeId
        resolvedStoreName = session.storeName ?? ''
      } else {
        // admin or store-manager
        if (!storeName) return res.status(400).json({ error: 'storeName is required' })
        // store manager guard
        if (!isSuperAdmin(session) && session.managedStores?.length) {
          if (!session.managedStores.includes(storeName)) {
            return res.status(403).json({ error: 'You do not manage this store' })
          }
        }
        const { data: store, error: storeErr } = await supabaseAdmin
          .from(TABLES.STORES)
          .select('id')
          .eq('name', storeName)
          .maybeSingle()
        if (storeErr) throw storeErr
        if (!store) return res.status(404).json({ error: 'Store not found' })
        storeId = store.id
      }

      if (!storeId) return res.status(400).json({ error: 'Could not resolve store' })

      // ── Resolve product_id ───────────────────────────────────────────────
      const { data: product, error: productErr } = await supabaseAdmin
        .from(TABLES.PRODUCTS)
        .select('id')
        .eq('product_name', productName)
        .maybeSingle()
      if (productErr) throw productErr
      const productId: string | null = product?.id ?? null

      // ── Find store_inventory rows (FIFO: oldest first) ───────────────────
      let storeInvQuery = supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .select('id, commission_percent, owner_supply_price, quantity_remaining')
        .eq('store_id', storeId)
        .order('created_at', { ascending: true })

      if (productId) {
        storeInvQuery = storeInvQuery.eq('product_id', productId)
      }

      const { data: invRows, error: invErr } = await storeInvQuery
      if (invErr) throw invErr

      const rows = (invRows || []).filter((r: any) => num(r.quantity_remaining) > 0)
      const totalAvailable = rows.reduce((s: number, r: any) => s + num(r.quantity_remaining), 0)
      if (totalAvailable < totalDispatch) {
        return res.status(400).json({ error: `Insufficient stock. Only ${totalAvailable} unit(s) available (need ${totalDispatch}: ${qty} sold + ${bonusQty} bonus).` })
      }

      // Use the first row's commission/cost for the order financials
      const primaryRow = rows[0] as any
      const commissionPercent = num(primaryRow?.commission_percent)
      const costPrice = num(primaryRow?.owner_supply_price)
      const primaryStoreInvId: string | null = primaryRow?.id ?? null

      // ── Calculate financials ─────────────────────────────────────────────
      const grossAmount = price * qty
      const commissionAmount = Math.round(grossAmount * commissionPercent) / 100
      const adminTake = grossAmount - commissionAmount - totalDeductions
      const profit = adminTake - costPrice * qty

      // ── Insert order ─────────────────────────────────────────────────────
      const { data: order, error: orderErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .insert({
          order_code: generateOrderCode(),
          store_id: storeId,
          product_id: productId,
          product_name: productName,
          store_inventory_id: primaryStoreInvId,
          quantity: qty,
          selling_price: price,
          shipment_cost: totalDeductions,
          client_name: clientName || null,
          order_type: orderType || 'Sale',
          occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
          included_in_payout: false,
          commission_percent: commissionPercent,
          cost_price: costPrice,
          commission_amount: commissionAmount,
          admin_take: adminTake,
          profit: profit,
        })
        .select('id, order_code')
        .single()

      if (orderErr) {
        console.error('orders INSERT error:', orderErr)
        return res.status(500).json({ error: 'Failed to save order' })
      }

      // ── Decrement quantity_remaining across rows FIFO (sold + bonus) ────
      let remaining = totalDispatch
      for (const row of rows) {
        if (remaining <= 0) break
        const rowQty = num((row as any).quantity_remaining)
        const deduct = Math.min(rowQty, remaining)
        const { error: updErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .update({ quantity_remaining: rowQty - deduct })
          .eq('id', (row as any).id)
        if (updErr) console.error('stock decrement error:', updErr)
        remaining -= deduct
      }

      return res.status(201).json({
        success: true,
        orderId: order.id,
        orderCode: order.order_code,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('orders API error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}
