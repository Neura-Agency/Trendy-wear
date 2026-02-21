import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { serverEvents } from '../../lib/serverEvents'
import { requireAdmin } from '../../lib/api/session'

const mapInventoryRow = (r: any) => ({
  productName: r.product_name,
  category: r.category,
  brand: r.brand,
  size: Array.isArray(r.size_options) ? r.size_options : (r.size_options ? [r.size_options] : []),
  color: Array.isArray(r.color_options) ? r.color_options : (r.color_options ? [r.color_options] : []),
  otherVariants: r.other_variants ?? {},
  batchNumber: r.batch_number,
  costPrice: Number(r.cost_price) || 0,
  sellingPrice: Number(r.selling_price) || 0,
  quantityAvailable: Number(r.quantity_available) || 0,
  lowStockWarning: Number(r.low_stock_warning) || 5,
  owner: r.owner ?? undefined
})

const mapPurchaseRow = (r: any) => ({
  id: r.id,
  productName: r.product_name,
  category: r.category,
  brand: r.brand,
  size: Array.isArray(r.size_options) ? r.size_options : (r.size_options ? [r.size_options] : []),
  color: Array.isArray(r.color_options) ? r.color_options : (r.color_options ? [r.color_options] : []),
  otherVariants: r.other_variants ?? {},
  batchNumber: r.batch_number,
  costPrice: Number(r.cost_price) || 0,
  sellingPrice: Number(r.selling_price) || 0,
  quantity: Number(r.quantity) || 0,
  lowStockWarning: Number(r.low_stock_warning) || 5,
  date: r.purchased_at,
  owner: r.owner ?? undefined
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireAdmin(req, res)
    if (!session) return

    if (req.method === 'GET') {
      const [{ data: purchases, error: pErr }, { data: inventory, error: iErr }] = await Promise.all([
        supabaseAdmin
          .from(TABLES.PURCHASES)
          .select('*')
          .order('purchased_at', { ascending: true }),
        supabaseAdmin
          .from(TABLES.INVENTORY)
          .select('*')
          .order('created_at', { ascending: true })
      ])

      if (pErr) throw pErr
      if (iErr) throw iErr

      return res.json({
        purchases: (purchases ?? []).map(mapPurchaseRow),
        inventory: (inventory ?? []).map(mapInventoryRow)
      })
    }

    if (req.method === 'POST') {
      const p = req.body || {}
      const productName = p.productName
      const batchNumber = p.batchNumber
      if (!productName || !batchNumber) {
        return res.status(400).json({ error: 'productName and batchNumber are required.' })
      }

      const quantity = Number(p.quantity) || 0
      const costPrice = Number(p.costPrice) || 0
      const sellingPrice = Number(p.sellingPrice) || 0

      // 1) Upsert inventory (additive quantity)
      const { data: existingInv, error: invGetErr } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .select('*')
        .eq('batch_number', batchNumber)
        .maybeSingle()

      if (invGetErr) throw invGetErr

      let inventoryRow: any
      if (existingInv) {
        const nextQty = Math.max(0, (Number(existingInv.quantity_available) || 0) + quantity)
        const { data: updatedInv, error: invUpdErr } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .update({
            product_name: productName,
            category: p.category ?? existingInv.category,
            brand: p.brand ?? existingInv.brand,
            size_options: Array.isArray(p.size) ? p.size : (p.size ? [p.size] : existingInv.size_options),
            color_options: Array.isArray(p.color) ? p.color : (p.color ? [p.color] : existingInv.color_options),
            other_variants: p.otherVariants ?? existingInv.other_variants,
            cost_price: costPrice || existingInv.cost_price,
            selling_price: sellingPrice || existingInv.selling_price,
            quantity_available: nextQty,
            low_stock_warning: Number(p.lowStockWarning) || existingInv.low_stock_warning || 5,
            owner: p.owner ?? existingInv.owner ?? null
          })
          .eq('id', existingInv.id)
          .select('*')
          .single()

        if (invUpdErr) throw invUpdErr
        inventoryRow = updatedInv
      } else {
        const { data: insertedInv, error: invInsErr } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .insert({
            product_name: productName,
            category: p.category ?? null,
            brand: p.brand ?? null,
            size_options: Array.isArray(p.size) ? p.size : (p.size ? [p.size] : []),
            color_options: Array.isArray(p.color) ? p.color : (p.color ? [p.color] : []),
            other_variants: p.otherVariants ?? {},
            batch_number: batchNumber,
            cost_price: costPrice,
            selling_price: sellingPrice,
            quantity_available: Math.max(0, quantity),
            low_stock_warning: Number(p.lowStockWarning) || 5,
            owner: p.owner ?? null
          })
          .select('*')
          .single()

        if (invInsErr) throw invInsErr
        inventoryRow = insertedInv
      }

      // 2) Insert purchase row
      const { data: createdPurchase, error: purErr } = await supabaseAdmin
        .from(TABLES.PURCHASES)
        .insert({
          inventory_id: inventoryRow.id,
          product_name: productName,
          category: p.category ?? null,
          brand: p.brand ?? null,
          size_options: Array.isArray(p.size) ? p.size : (p.size ? [p.size] : []),
          color_options: Array.isArray(p.color) ? p.color : (p.color ? [p.color] : []),
          other_variants: p.otherVariants ?? {},
          batch_number: batchNumber,
          cost_price: costPrice,
          selling_price: sellingPrice,
          quantity: quantity,
          low_stock_warning: Number(p.lowStockWarning) || 5,
          owner: p.owner ?? null,
          purchased_at: p.date ?? new Date().toISOString()
        })
        .select('*')
        .single()

      if (purErr) throw purErr

      serverEvents.emit('change', { ts: Date.now(), type: 'purchase' })
      return res.status(201).json(mapPurchaseRow(createdPurchase))
    }

    if (req.method === 'PATCH') {
      const { productName, batchNumber, quantityDelta, ...fields } = req.body || {}
      if (!productName || !batchNumber) {
        return res.status(400).json({ error: 'productName and batchNumber are required.' })
      }

      const { data: inv, error: invErr } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .select('*')
        .eq('batch_number', batchNumber)
        .maybeSingle()

      if (invErr) throw invErr
      if (!inv) return res.status(404).json({ error: 'Inventory item not found.' })

      let patch: any = {}

      if (quantityDelta !== undefined && quantityDelta !== null) {
        const delta = Number(quantityDelta) || 0
        patch.quantity_available = Math.max(0, (Number(inv.quantity_available) || 0) + delta)
      }

      if (fields.category !== undefined) patch.category = fields.category
      if (fields.brand !== undefined) patch.brand = fields.brand
      if (fields.costPrice !== undefined) patch.cost_price = Number(fields.costPrice) || 0
      if (fields.sellingPrice !== undefined) patch.selling_price = Number(fields.sellingPrice) || 0
      if (fields.lowStockWarning !== undefined) patch.low_stock_warning = Number(fields.lowStockWarning) || 5
      if (fields.otherVariants !== undefined) patch.other_variants = fields.otherVariants
      if (fields.size !== undefined) patch.size_options = Array.isArray(fields.size) ? fields.size : (fields.size ? [fields.size] : [])
      if (fields.color !== undefined) patch.color_options = Array.isArray(fields.color) ? fields.color : (fields.color ? [fields.color] : [])
      if (fields.owner !== undefined) patch.owner = fields.owner

      const { data: updatedInv, error: updErr } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .update(patch)
        .eq('id', inv.id)
        .select('*')
        .single()

      if (updErr) throw updErr

      serverEvents.emit('change', { ts: Date.now(), type: 'inventory' })
      return res.json(mapInventoryRow(updatedInv))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('purchases api error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

