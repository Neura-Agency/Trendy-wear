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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireAdmin(req, res)
    if (!session) return

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return res.json({ inventory: (data ?? []).map(mapInventoryRow) })
    }

    if (req.method === 'PUT') {
      const { productName, batchNumber, ...fields } = req.body || {}
      if (!productName || !batchNumber) {
        return res.status(400).json({ error: 'productName and batchNumber are required.' })
      }

      const { data: inv, error: getErr } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .select('*')
        .eq('batch_number', batchNumber)
        .maybeSingle()
      if (getErr) throw getErr
      if (!inv) return res.status(404).json({ error: 'Item not found' })

      const patch: any = {}
      if (fields.category !== undefined) patch.category = fields.category
      if (fields.brand !== undefined) patch.brand = fields.brand
      if (fields.costPrice !== undefined) patch.cost_price = Number(fields.costPrice) || 0
      if (fields.sellingPrice !== undefined) patch.selling_price = Number(fields.sellingPrice) || 0
      if (fields.quantityAvailable !== undefined) patch.quantity_available = Math.max(0, parseInt(fields.quantityAvailable, 10) || 0)
      if (fields.lowStockWarning !== undefined) patch.low_stock_warning = Number(fields.lowStockWarning) || 5
      if (fields.otherVariants !== undefined) patch.other_variants = fields.otherVariants
      if (fields.size !== undefined) patch.size_options = Array.isArray(fields.size) ? fields.size : (fields.size ? [fields.size] : [])
      if (fields.color !== undefined) patch.color_options = Array.isArray(fields.color) ? fields.color : (fields.color ? [fields.color] : [])
      if (fields.owner !== undefined) patch.owner = fields.owner

      const { data: updated, error: updErr } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .update(patch)
        .eq('id', inv.id)
        .select('*')
        .single()
      if (updErr) throw updErr

      serverEvents.emit('change', { ts: Date.now(), type: 'inventory' })
      return res.json(mapInventoryRow(updated))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('inventory api error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

