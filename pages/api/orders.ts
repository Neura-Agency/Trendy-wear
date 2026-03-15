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
          payment_status,
          created_at,
          stores:store_id ( name ),
          store_inventory:store_inventory_id (
            inventory:inventory_id (
              cost_price
            )
          )
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

      const orders = (data || []).map((row: any) => {
        // Follow: orders.store_inventory_id → store_inventory.inventory_id → inventory.cost_price
        const inventoryCostPrice = row.store_inventory?.inventory?.cost_price
        const costPrice = inventoryCostPrice != null
          ? num(inventoryCostPrice)
          : num(row.cost_price)  // fallback to stored value if link is missing

        return {
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
          costPrice,
          commissionAmount: num(row.commission_amount),
          adminTake: num(row.admin_take),
          profit: num(row.profit),
          paymentStatus: row.payment_status ?? null,
        }
      })

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
      // Special case: "Direct" store sells straight from warehouse inventory
      if (resolvedStoreName === 'Direct') {
        // Query warehouse inventory for this product (FIFO: oldest batch first)
        let invQuery = supabaseAdmin
          .from(TABLES.INVENTORY)
          .select('id, cost_price, quantity_available')
          .order('created_at', { ascending: true })

        if (productId) {
          invQuery = invQuery.eq('product_id', productId)
        } else {
          invQuery = invQuery.eq('product_name', productName)
        }

        const { data: invRows2, error: invErr2 } = await invQuery
        if (invErr2) throw invErr2

        const warehouseRows = (invRows2 || []).filter((r: any) => num(r.quantity_available) > 0)
        const totalAvailableWarehouse = warehouseRows.reduce((s: number, r: any) => s + num(r.quantity_available), 0)

        if (totalAvailableWarehouse < totalDispatch) {
          return res.status(400).json({ error: `Insufficient warehouse stock. Only ${totalAvailableWarehouse} unit(s) available (need ${totalDispatch}).` })
        }

        const primaryWarehouseRow = warehouseRows[0] as any
        const costPrice = num(primaryWarehouseRow?.cost_price)
        const commissionPercent = 0
        const commissionAmount = 0
        const grossAmount = price * qty
        const adminTake = grossAmount - totalDeductions
        const profit = adminTake - costPrice * qty

        // ── Insert order ──────────────────────────────────────────────────
        const { data: order, error: orderErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .insert({
            order_code: generateOrderCode(),
            store_id: storeId,
            product_id: productId,
            product_name: productName,
            store_inventory_id: null,
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
          console.error('orders INSERT error (direct):', orderErr)
          return res.status(500).json({ error: 'Failed to save order' })
        }

        // ── Deduct from warehouse inventory FIFO ──────────────────────────
        let remaining = totalDispatch
        for (const row of warehouseRows) {
          if (remaining <= 0) break
          const rowQty = num((row as any).quantity_available)
          const deduct = Math.min(rowQty, remaining)
          await supabaseAdmin
            .from(TABLES.INVENTORY)
            .update({ quantity_available: rowQty - deduct })
            .eq('id', (row as any).id)
          remaining -= deduct
        }

        return res.status(201).json({
          success: true,
          orderId: order.id,
          orderCode: order.order_code,
        })
      }

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
      const amountReceived = grossAmount - totalDeductions
      const commissionAmount = Math.round(amountReceived * commissionPercent) / 100
      const adminTake = amountReceived - commissionAmount
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

    // ────────────────────────────────────────────────────────────────────────
    // PATCH — update commission % or payment_status
    // ────────────────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Admin only' })
      }

      // ── Batch payment status update ──────────────────────────────────────
      if (req.body?.ids !== undefined) {
        const { ids, paymentStatus } = req.body
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ error: 'ids must be a non-empty array' })
        }
        const { error: batchErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({ payment_status: paymentStatus === true })
          .in('id', ids)
        if (batchErr) {
          console.error('orders PATCH payment_status error:', batchErr)
          return res.status(500).json({ error: 'Failed to update payment status' })
        }
        return res.json({ success: true, updated: ids.length })
      }

      const { id, commissionPercent } = req.body
      if (!id || commissionPercent === undefined) {
        return res.status(400).json({ error: 'id and commissionPercent are required' })
      }

      const newPct = num(commissionPercent)

      // Fetch the existing order to recalculate from source values
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .select('selling_price, quantity, shipment_cost, cost_price')
        .eq('id', id)
        .single()

      if (fetchErr || !existing) {
        return res.status(404).json({ error: 'Order not found' })
      }

      const grossAmount     = num(existing.selling_price) * num(existing.quantity)
      const totalDeductions = num(existing.shipment_cost)
      const costPrice       = num(existing.cost_price) * num(existing.quantity)
      const amountReceived   = grossAmount - totalDeductions
      const commissionAmount = Math.round(amountReceived * newPct) / 100
      const adminTake        = amountReceived - commissionAmount
      const profit           = adminTake - costPrice

      const { error: updateErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .update({
          commission_percent: newPct,
          commission_amount:  commissionAmount,
          admin_take:         adminTake,
          profit:             profit,
        })
        .eq('id', id)

      if (updateErr) {
        console.error('orders PATCH error:', updateErr)
        return res.status(500).json({ error: 'Failed to update order' })
      }

      return res.json({ success: true, commissionAmount, adminTake, profit })
    }

    // ────────────────────────────────────────────────────────────────────────
    // PUT — full order edit (recalculates all financials)
    // ────────────────────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, quantity, sellingPrice, shipmentCost, extraCharges, clientName, occurredAt } = req.body
      if (!id) return res.status(400).json({ error: 'id is required' })

      // Fetch existing to keep cost_price + commission_percent
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .select('cost_price, commission_percent')
        .eq('id', id)
        .single()

      if (fetchErr || !existing) return res.status(404).json({ error: 'Order not found' })

      const qty            = num(quantity)
      const price          = num(sellingPrice)
      const ship           = num(shipmentCost)
      const extra          = num(extraCharges)
      const grossAmount    = price * qty
      const totalDeductions = ship + extra
      const costPrice      = num(existing.cost_price) * qty
      const commPct        = num(existing.commission_percent)
      const amountReceived = grossAmount - totalDeductions
      const commissionAmount = Math.round(amountReceived * commPct) / 100
      const adminTake      = amountReceived - commissionAmount
      const profit         = adminTake - costPrice

      const { error: updateErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .update({
          quantity:           qty,
          selling_price:      price,
          shipment_cost:      ship,
          client_name:        clientName ?? '',
          occurred_at:        occurredAt,
          commission_amount:  commissionAmount,
          admin_take:         adminTake,
          profit:             profit,
        })
        .eq('id', id)

      if (updateErr) {
        console.error('orders PUT error:', updateErr)
        return res.status(500).json({ error: 'Failed to update order' })
      }

      return res.json({ success: true })
    }

    // ────────────────────────────────────────────────────────────────────────
    // DELETE — remove a sale record
    // ────────────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id is required' })

      const { error: delErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .delete()
        .eq('id', id)

      if (delErr) {
        console.error('orders DELETE error:', delErr)
        return res.status(500).json({ error: 'Failed to delete order' })
      }

      return res.json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('orders API error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}
