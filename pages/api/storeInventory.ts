import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { getAllowedStoreIds, requireAdmin, requireSession } from '../../lib/api/session'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = req.method === 'GET' ? await requireSession(req, res) : await requireAdmin(req, res)
    if (!session) return

    if (req.method === 'GET') {
      const allowedStoreIds = await getAllowedStoreIds(session)

      let query = supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .select(`
          id,
          store_id,
          product_id,
          inventory_id,
          owner_supply_price,
          commission_percent,
          store_selling_price,
          quantity_assigned,
          quantity_remaining,
          "extra_Qty",
          created_at,
          updated_at,
          stores:store_id ( name ),
          products:product_id ( product_name )
        `)
        .order('created_at', { ascending: false })

      if (Array.isArray(allowedStoreIds)) {
        query = query.in('store_id', allowedStoreIds.length ? allowedStoreIds : ['00000000-0000-0000-0000-000000000000'])
      }

      const { data, error } = await query
      if (error) {
        console.error('storeInventory GET error:', error)
        return res.status(500).json({ error: 'Failed to fetch store inventory' })
      }

      const storeInventory: Record<string, Record<string, any>> = {}
      const latestUpdatedAtByStore: Record<string, string> = {}
      let latestUpdatedAt: string | null = null

      ;(data || []).forEach((row: any) => {
        const storeName = row.stores?.name
        const productName = row.products?.product_name || row.product_id || 'Unknown'
        if (!storeName) return

        if (!storeInventory[storeName]) storeInventory[storeName] = {}
        const qtyAssigned = num(row.quantity_assigned)
        const qtyRemaining = num(row.quantity_remaining)

        const rowUpdatedAt = (row.updated_at ?? row.created_at) as string | null
        if (rowUpdatedAt) {
          const prev = latestUpdatedAtByStore[storeName]
          if (!prev || new Date(rowUpdatedAt).getTime() > new Date(prev).getTime()) {
            latestUpdatedAtByStore[storeName] = rowUpdatedAt
          }
          if (!latestUpdatedAt || new Date(rowUpdatedAt).getTime() > new Date(latestUpdatedAt).getTime()) {
            latestUpdatedAt = rowUpdatedAt
          }
        }

        // Key by unique store_inventory id to avoid combining different lots
        const key = row.id || `${productName}_${row.inventory_id || ''}_${row.created_at}`
        storeInventory[storeName][key] = {
          id: row.id,
          productName,
          productId: row.product_id,
          inventoryId: row.inventory_id,
          ownerSupplyPrice: num(row.owner_supply_price),
          commissionPercent: num(row.commission_percent),
          storeSellingPrice: num(row.store_selling_price),
          quantityAssigned: qtyAssigned,
          quantityRemaining: qtyRemaining,
          sizeQuantitiesAssigned: null,
          sizeQuantitiesRemaining: null,
          extraQty: num(row['extra_Qty'] ?? 0),
          created_at: row.created_at,
          updated_at: row.updated_at
        }
      })

      return res.json({
        storeInventory,
        meta: {
          latestUpdatedAt,
          latestUpdatedAtByStore
        }
      })
    }

    if (req.method === 'POST') {
      const { storeName, batchNumber, quantity, sizeQuantitiesAssigned, ownerSupplyPrice, commissionPercent, extraQty: rawExtra } = req.body || {}
      const extraQty = num(rawExtra)

      if (!storeName || !batchNumber) {
        return res.status(400).json({ error: 'storeName and batchNumber are required' })
      }

      const { data: store, error: storeErr } = await supabaseAdmin
        .from(TABLES.STORES)
        .select('id, name')
        .eq('name', String(storeName))
        .maybeSingle()

      if (storeErr) {
        console.error('store lookup error:', storeErr)
        return res.status(500).json({ error: 'Failed to lookup store' })
      }
      if (!store) return res.status(404).json({ error: 'Store not found' })

      const { data: inv, error: invErr } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .select('id, product_id, quantity_available, size_quantities, cost_price, products:product_id(product_name)')
        .eq('batch_number', String(batchNumber))
        .maybeSingle()

      if (invErr) {
        console.error('inventory lookup error:', invErr)
        return res.status(500).json({ error: 'Failed to lookup inventory batch' })
      }
      if (!inv) return res.status(404).json({ error: 'Inventory batch not found' })
      if (!inv.product_id) return res.status(400).json({ error: 'Inventory batch is missing product_id' })

      // Calculate total quantity from sizeQuantitiesAssigned if provided
      let qty = num(quantity)
      if (sizeQuantitiesAssigned && typeof sizeQuantitiesAssigned === 'object') {
        qty = Object.values(sizeQuantitiesAssigned).reduce((sum: number, q: any) => sum + (Number(q) || 0), 0)
      }

      // Validate quantity
      if (!qty || qty < 1) {
        return res.status(400).json({ error: 'quantity must be >= 1' })
      }

      // Validate size quantities against available inventory
      if (sizeQuantitiesAssigned && inv.size_quantities) {
        // Check each size
        for (const [size, requestedQty] of Object.entries(sizeQuantitiesAssigned)) {
          const availableQty = (inv.size_quantities as any)[size] || 0
          if (Number(requestedQty) > availableQty) {
            return res.status(400).json({ 
              error: `Size ${size}: requested ${requestedQty} exceeds available ${availableQty}` 
            })
          }
        }
      }

      // Server-side availability guard (per batch)
      const { data: assignedRows, error: assignedErr } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .select('quantity_assigned')
        .eq('inventory_id', inv.id)

      if (assignedErr) {
        console.error('assigned sum error:', assignedErr)
        return res.status(500).json({ error: 'Failed to validate available quantity' })
      }

      const alreadyAssigned = (assignedRows || []).reduce((acc: number, r: any) => acc + num(r.quantity_assigned), 0)
      const total = num(inv.quantity_available)
      const remaining = Math.max(0, total - alreadyAssigned)
      if (qty + extraQty > remaining) {
        return res.status(400).json({ error: `Quantity exceeds available stock (${remaining}) for this batch` })
      }

      const supply = num(ownerSupplyPrice)
      const commission = num(commissionPercent)

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .insert({
          store_id: store.id,
          product_id: inv.product_id,
          inventory_id: inv.id,
          owner_supply_price: supply,
          commission_percent: commission,
          store_selling_price: supply,
          quantity_assigned: qty,
          quantity_remaining: qty,
          'extra_Qty': extraQty || null
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error('storeInventory insert error:', insertErr)
        return res.status(500).json({ error: 'Failed to save allotment' })
      }

      // If extra qty was sent — deduct from warehouse + auto-record as expense
      if (extraQty > 0) {
        const costPrice = num((inv as any).cost_price)
        const productName = (inv as any).products?.product_name || 'Unknown'

        // Deduct extra units from warehouse quantity_available
        await supabaseAdmin
          .from(TABLES.INVENTORY)
          .update({ quantity_available: total - extraQty })
          .eq('id', inv.id)

        // Auto-create expense: cost of gifted units
        const expenseAmount = costPrice * extraQty
        if (expenseAmount > 0) {
          await supabaseAdmin
            .from(TABLES.EXPENSES)
            .insert({
              title: `Store Gift: ${productName} ×${extraQty} → ${storeName}`,
              amount: expenseAmount,
              category: 'Store Gift',
              expense_date: new Date().toISOString().slice(0, 10),
              notes: `Auto-recorded from allotment. Batch: ${batchNumber}`,
            })
        }
      }

      return res.status(201).json({ success: true, id: inserted?.id })
    }

    if (req.method === 'PATCH') {
      // Update existing store_inventory row (admin only)
      const { id, fields } = req.body || {}

      if (!id) return res.status(400).json({ error: 'id is required' })
      if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'fields are required' })

      // Only allow updating specific fields
      const allowed: Record<string, any> = {}
      if (fields.owner_supply_price !== undefined) allowed.owner_supply_price = fields.owner_supply_price
      if (fields.commission_percent !== undefined) allowed.commission_percent = fields.commission_percent
      if (fields.store_selling_price !== undefined) allowed.store_selling_price = fields.store_selling_price
      if (fields.quantity_assigned !== undefined) allowed.quantity_assigned = fields.quantity_assigned
      if (fields.quantity_remaining !== undefined) allowed.quantity_remaining = fields.quantity_remaining

      // Allow updating store by storeName (resolve to store_id)
      if (fields.storeName) {
        const { data: storeRow, error: storeErr } = await supabaseAdmin
          .from(TABLES.STORES)
          .select('id')
          .eq('name', String(fields.storeName))
          .maybeSingle()
        if (storeErr) {
          console.error('store lookup error on patch:', storeErr)
          return res.status(500).json({ error: 'Failed to lookup store' })
        }
        if (!storeRow) return res.status(404).json({ error: 'Store not found' })
        allowed.store_id = storeRow.id
      }

      if (Object.keys(allowed).length === 0) return res.status(400).json({ error: 'no updatable fields provided' })

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .update(allowed)
        .eq('id', id)
        .select()
        .maybeSingle()

      if (updateErr) {
        console.error('storeInventory update error:', updateErr)
        return res.status(500).json({ error: 'Failed to update allotment' })
      }

      return res.json({ success: true, updated })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('storeInventory API error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

