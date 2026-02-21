import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { serverEvents } from '../../lib/serverEvents'
import {
  ensureStore,
  getSettings,
  pickInventoryBatchForSale,
  storeRowsToRecord
} from '../../lib/api/supabaseHelpers'
import { getAllowedStoreIds, isAdmin, isSuperAdmin, requireSession } from '../../lib/api/session'

function parseNumber(v: any, fallback = 0) {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function mapOrderRow(r: any) {
  return {
    id: r.id,
    productName: r.product_name,
    quantity: Number(r.quantity) || 0,
    sellingPrice: Number(r.selling_price) || 0,
    shipmentCost: Number(r.shipment_cost) || 0,
    storeName: r.stores?.name ?? 'Direct',
    clientName: r.client_name ?? '',
    type: r.order_type ?? 'Sale',
    date: r.occurred_at,
    includedInPayout: r.included_in_payout !== false,
    commissionPercent: Number(r.commission_percent) || 0,
    costPrice: Number(r.cost_price) || 0,
    commissionAmount: Number(r.commission_amount) || 0,
    adminTake: Number(r.admin_take) || 0,
    profit: Number(r.profit) || 0
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res)
    if (!session) return

    if (req.method === 'GET') {
      let ordersQ = supabaseAdmin
        .from(TABLES.ORDERS)
        .select('*, stores(name)')
        .order('occurred_at', { ascending: true })

      let storesQ = supabaseAdmin
        .from(TABLES.STORES)
        .select('id,name,commission,paid_amount,paid,created_at,paid_at')
        .order('created_at', { ascending: true })

      if (session.role === 'store') {
        if (!session.storeId) return res.status(403).json({ error: 'Forbidden' })
        ordersQ = ordersQ.eq('store_id', session.storeId)
        storesQ = storesQ.eq('id', session.storeId)
      } else {
        const allowed = await getAllowedStoreIds(session)
        if (allowed && allowed.length === 0) {
          return res.json({ orders: [], stores: {} })
        }
        if (allowed) {
          ordersQ = ordersQ.in('store_id', allowed)
          storesQ = storesQ.in('id', allowed)
        }
      }

      const [{ data: orders, error: oErr }, { data: stores, error: sErr }] = await Promise.all([
        ordersQ,
        storesQ
      ])

      if (oErr) throw oErr
      if (sErr) throw sErr

      return res.json({
        orders: (orders ?? []).map(mapOrderRow),
        stores: storeRowsToRecord((stores ?? []) as any)
      })
    }

    if (req.method === 'POST') {
      const order = req.body || {}
      const settings = await getSettings()

      const requestedStoreName =
        order.storeName && String(order.storeName).trim() ? String(order.storeName).trim() : 'Direct'

      const safeStoreName = session.role === 'store' ? (session.storeName || '') : (requestedStoreName || 'Direct')
      if (!safeStoreName) return res.status(403).json({ error: 'Forbidden' })

      if (safeStoreName === 'Direct' && !isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Forbidden' })
      }

      if (session.role === 'admin' && session.scope !== 'all' && session.managedStores?.length) {
        if (!session.managedStores.includes(safeStoreName)) {
          return res.status(403).json({ error: 'Forbidden' })
        }
      }

      const store = await ensureStore(safeStoreName, safeStoreName === 'Direct' ? 0 : settings.defaultCommission)

      const productName = String(order.productName || '').trim()
      if (!productName) return res.status(400).json({ error: 'productName is required' })

      const qty = Math.max(1, parseInt(order.quantity, 10) || 1)
      const sellingPrice = parseNumber(order.sellingPrice, 0)
      const shipmentCost = parseNumber(order.shipmentCost, 0)
      const occurredAt = order.date || new Date().toISOString()
      const type = order.type || 'Sale'
      const includedInPayout = type !== 'Gift'

      // Determine if store inventory exists for this store/product
      const { data: si, error: siErr } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .select('*')
        .eq('store_id', store.id)
        .eq('product_name', productName)
        .maybeSingle()

      if (siErr) throw siErr

      // Commission percent
      let commissionPercent =
        order.commissionPercent !== undefined && order.commissionPercent !== null
          ? parseNumber(order.commissionPercent, settings.defaultCommission)
          : (si ? Number(si.commission_percent) || settings.defaultCommission : Number(store.commission) || settings.defaultCommission)

      const isDirectSale = !safeStoreName || safeStoreName === 'Direct'
      if (type === 'Gift' || isDirectSale) commissionPercent = 0

      // Cost basis
      let costPrice = parseNumber(order.costPrice, 0)
      if (!costPrice) {
        if (si) costPrice = Number(si.owner_supply_price) || 0
        else {
          const invBatch = await pickInventoryBatchForSale(productName)
          costPrice = Number(invBatch?.cost_price) || 0
        }
      }

      // Update store_inventory + inventory quantities
      if (si) {
        const nextRemaining = Math.max(0, (Number(si.quantity_remaining) || 0) - qty)
        const { error: siUpdErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .update({ quantity_remaining: nextRemaining })
          .eq('id', si.id)
        if (siUpdErr) throw siUpdErr
      }

      const invBatch = await pickInventoryBatchForSale(productName)
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
      const comm = (commissionPercent / 100) * netAfterShipment
      const commissionAmount = isDirectSale || type === 'Gift' ? 0 : comm
      const adminTake = netAfterShipment - commissionAmount
      const profit = type === 'Gift' ? 0 : adminTake - (costPrice * qty)

      const orderCode = `o_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

      const { data: created, error } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .insert({
          order_code: orderCode,
          store_id: store.id,
          product_name: productName,
          quantity: qty,
          selling_price: sellingPrice,
          shipment_cost: shipmentCost,
          client_name: order.clientName ?? null,
          order_type: type,
          occurred_at: occurredAt,
          included_in_payout: includedInPayout,
          commission_percent: commissionPercent,
          cost_price: costPrice,
          commission_amount: commissionAmount,
          admin_take: adminTake,
          profit: profit
        })
        .select('*, stores(name)')
        .single()

      if (error) throw error

      serverEvents.emit('change', { ts: Date.now(), type: 'orders' })
      return res.status(201).json(mapOrderRow(created))
    }

    if (req.method === 'PATCH') {
      if (!isAdmin(session)) return res.status(403).json({ error: 'Forbidden' })

      const { id, commissionPercent, includedInPayout } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })

      // Update commission (and recompute amounts)
      if (commissionPercent !== undefined && commissionPercent !== null) {
        const { data: order, error: getErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .select('*, stores(name)')
          .eq('id', id)
          .single()
        if (getErr) throw getErr

        const pct = parseNumber(commissionPercent, Number(order.commission_percent) || 0)
        const qty = Number(order.quantity) || 0
        const gross = (Number(order.selling_price) || 0) * qty
        const shipment = Number(order.shipment_cost) || 0
        const netAfterShipment = gross - shipment
        const isDirect = order.stores?.name === 'Direct' || !order.stores?.name
        const isGift = order.order_type === 'Gift'
        const commissionAmount = isDirect || isGift ? 0 : (pct / 100) * netAfterShipment
        const adminTake = netAfterShipment - commissionAmount
        const cost = (Number(order.cost_price) || 0) * qty
        const profit = isGift ? 0 : adminTake - cost

        const { data: updated, error: updErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({
            commission_percent: pct,
            commission_amount: commissionAmount,
            admin_take: adminTake,
            profit: profit
          })
          .eq('id', id)
          .select('*, stores(name)')
          .single()

        if (updErr) throw updErr
        serverEvents.emit('change', { ts: Date.now(), type: 'orders' })
        return res.json(mapOrderRow(updated))
      }

      // Toggle payout inclusion
      if (includedInPayout !== undefined) {
        const { data: updated, error } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({ included_in_payout: Boolean(includedInPayout) })
          .eq('id', id)
          .select('*, stores(name)')
          .single()
        if (error) throw error
        serverEvents.emit('change', { ts: Date.now(), type: 'orders' })
        return res.json(mapOrderRow(updated))
      }

      return res.status(400).json({ error: 'nothing to update' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('orders api error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

