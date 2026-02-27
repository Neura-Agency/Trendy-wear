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

        const existing = storeInventory[storeName][productName]
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

        if (!existing) {
          storeInventory[storeName][productName] = {
            productName,
            ownerSupplyPrice: num(row.owner_supply_price),
            commissionPercent: num(row.commission_percent),
            storeSellingPrice: num(row.store_selling_price),
            quantityAssigned: qtyAssigned,
            quantityRemaining: qtyRemaining
          }
        } else {
          existing.quantityAssigned = num(existing.quantityAssigned) + qtyAssigned
          existing.quantityRemaining = num(existing.quantityRemaining) + qtyRemaining
          // Keep latest price/commission (most recent row is first due to ordering)
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
      const { storeName, batchNumber, quantity, ownerSupplyPrice, commissionPercent } = req.body || {}

      if (!storeName || !batchNumber) {
        return res.status(400).json({ error: 'storeName and batchNumber are required' })
      }

      const qty = num(quantity)
      if (!qty || qty < 1) {
        return res.status(400).json({ error: 'quantity must be >= 1' })
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
        .select('id, product_id, quantity_available')
        .eq('batch_number', String(batchNumber))
        .maybeSingle()

      if (invErr) {
        console.error('inventory lookup error:', invErr)
        return res.status(500).json({ error: 'Failed to lookup inventory batch' })
      }
      if (!inv) return res.status(404).json({ error: 'Inventory batch not found' })
      if (!inv.product_id) return res.status(400).json({ error: 'Inventory batch is missing product_id' })

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
      if (qty > remaining) {
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
          quantity_remaining: qty
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error('storeInventory insert error:', insertErr)
        return res.status(500).json({ error: 'Failed to save allotment' })
      }

      return res.status(201).json({ success: true, id: inserted?.id })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('storeInventory API error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

