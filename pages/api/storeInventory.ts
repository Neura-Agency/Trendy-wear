import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { serverEvents } from '../../lib/serverEvents'
import {
  ensureStore,
  getAllotedQty,
  getInventoryTotalQty,
  getSettings
} from '../../lib/api/supabaseHelpers'
import { isAdmin, requireSession, getAllowedStoreIds, isSuperAdmin } from '../../lib/api/session'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res)
    if (!session) return

    if (req.method === 'GET') {
      let q = supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .select(
          'product_name,owner_supply_price,commission_percent,store_selling_price,quantity_assigned,quantity_remaining,owner,store_id,stores(name)'
        )
        .order('created_at', { ascending: true })

      if (session.role === 'store') {
        if (!session.storeId) return res.status(403).json({ error: 'Forbidden' })
        q = q.eq('store_id', session.storeId)
      } else {
        const allowed = await getAllowedStoreIds(session)
        if (allowed && allowed.length === 0) return res.json({ storeInventory: {} })
        if (allowed) q = q.in('store_id', allowed)
      }

      const { data, error } = await q

      if (error) throw error

      const out: Record<string, Record<string, any>> = {}
      for (const r of data ?? []) {
        const storeName = (r as any).stores?.name
        if (!storeName) continue
        if (!out[storeName]) out[storeName] = {}
        out[storeName][r.product_name] = {
          productName: r.product_name,
          ownerSupplyPrice: Number(r.owner_supply_price) || 0,
          commissionPercent: Number(r.commission_percent) || 0,
          storeSellingPrice: Number(r.store_selling_price) || 0,
          quantityAssigned: Number(r.quantity_assigned) || 0,
          quantityRemaining: Number(r.quantity_remaining) || 0,
          owner: r.owner ?? undefined
        }
      }

      return res.json({ storeInventory: out })
    }

    if (req.method === 'POST') {
      if (!isAdmin(session)) return res.status(403).json({ error: 'Forbidden' })

      const { storeName, productName, ownerSupplyPrice, quantity, commissionPercent, owner } = req.body || {}
      if (!storeName || !productName || ownerSupplyPrice === undefined || quantity === undefined) {
        return res
          .status(400)
          .json({ error: 'storeName, productName, ownerSupplyPrice and quantity are required.' })
      }

      if (session.scope !== 'all' && session.managedStores?.length && !session.managedStores.includes(String(storeName))) {
        return res.status(403).json({ error: 'Forbidden' })
      }

      const settings = await getSettings()
      const store = await ensureStore(storeName, settings.defaultCommission)

      const qty = Math.max(0, parseInt(quantity, 10) || 0)
      const supply = Number(ownerSupplyPrice) || 0
      const comm =
        commissionPercent !== undefined && commissionPercent !== null
          ? Number(commissionPercent)
          : Number(store.commission) || settings.defaultCommission

      const totalQty = await getInventoryTotalQty(productName)
      const alreadyAlloted = await getAllotedQty(productName)
      const availableToAllot = Math.max(0, totalQty - alreadyAlloted)
      if (qty > availableToAllot) {
        return res.status(400).json({ error: `Quantity cannot be more than ${availableToAllot}` })
      }

      const { data: existing, error: exErr } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .select('*')
        .eq('store_id', store.id)
        .eq('product_name', productName)
        .maybeSingle()

      if (exErr) throw exErr

      let row: any
      if (existing) {
        const { data: updated, error: upErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .update({
            owner_supply_price: supply,
            commission_percent: comm,
            quantity_assigned: (Number(existing.quantity_assigned) || 0) + qty,
            quantity_remaining: (Number(existing.quantity_remaining) || 0) + qty,
            owner: owner ?? existing.owner ?? null
          })
          .eq('id', existing.id)
          .select('*')
          .single()

        if (upErr) throw upErr
        row = updated
      } else {
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .insert({
            store_id: store.id,
            product_name: productName,
            owner_supply_price: supply,
            commission_percent: comm,
            store_selling_price: supply,
            quantity_assigned: qty,
            quantity_remaining: qty,
            owner: owner ?? null
          })
          .select('*')
          .single()

        if (insErr) throw insErr
        row = inserted
      }

      serverEvents.emit('change', { ts: Date.now(), type: 'store_inventory' })
      return res.json({
        productName: row.product_name,
        ownerSupplyPrice: Number(row.owner_supply_price) || 0,
        commissionPercent: Number(row.commission_percent) || 0,
        storeSellingPrice: Number(row.store_selling_price) || 0,
        quantityAssigned: Number(row.quantity_assigned) || 0,
        quantityRemaining: Number(row.quantity_remaining) || 0,
        owner: row.owner ?? undefined
      })
    }

    if (req.method === 'PATCH') {
      if (!isAdmin(session)) return res.status(403).json({ error: 'Forbidden' })

      const { storeName, productName, storeSellingPrice } = req.body || {}
      if (!storeName || !productName || storeSellingPrice === undefined) {
        return res.status(400).json({ error: 'storeName, productName and storeSellingPrice are required.' })
      }

      if (session.scope !== 'all' && session.managedStores?.length && !session.managedStores.includes(String(storeName))) {
        return res.status(403).json({ error: 'Forbidden' })
      }

      const settings = await getSettings()
      const store = await ensureStore(storeName, settings.defaultCommission)

      const { data: updated, error } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .update({ store_selling_price: Number(storeSellingPrice) || 0 })
        .eq('store_id', store.id)
        .eq('product_name', productName)
        .select('*')
        .maybeSingle()

      if (error) throw error
      if (!updated) return res.status(404).json({ error: 'Item not found in store inventory.' })

      serverEvents.emit('change', { ts: Date.now(), type: 'store_inventory' })
      return res.json({
        productName: updated.product_name,
        ownerSupplyPrice: Number(updated.owner_supply_price) || 0,
        commissionPercent: Number(updated.commission_percent) || 0,
        storeSellingPrice: Number(updated.store_selling_price) || 0,
        quantityAssigned: Number(updated.quantity_assigned) || 0,
        quantityRemaining: Number(updated.quantity_remaining) || 0,
        owner: updated.owner ?? undefined
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('storeInventory api error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

