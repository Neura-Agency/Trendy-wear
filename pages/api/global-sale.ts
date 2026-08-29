import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession } from '../../lib/api/session'

const INVENTORY_ENGINE_VERSION = 2

function stableRequestKey(accountId: string, req: NextApiRequest, body: any, productId: string): string {
  const explicit = String(req.headers['idempotency-key'] || body?.requestKey || '').trim()
  if (explicit) return `${accountId}:${explicit}`

  // orderCode identifies a cart/order, not an individual item. Include product and
  // the item-level request payload so a multi-item cart cannot collapse into one sale.
  return crypto.createHash('sha256').update(JSON.stringify({
    accountId,
    orderCode: body?.orderCode || null,
    productId,
    productName: body?.productName || null,
    quantity: body?.quantity || null,
    extraQty: body?.extraQty || 0,
    sellingPrice: body?.sellingPrice || null,
    shipmentCost: body?.shipmentCost || 0,
    extraCharges: body?.extraCharges || 0,
    clientName: body?.clientName || null,
    occurredAt: body?.occurredAt || null,
    variantQuantities: body?.variantQuantities || null,
  })).digest('hex')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const session = await requireSession(req, res)
    if (!session) return

    const body = req.body || {}
    const productName = String(body.productName || '').trim()
    const quantity = Number(body.quantity)
    const sellingPrice = Number(body.sellingPrice)
    const extraQty = Math.max(0, Number(body.extraQty) || 0)

    if (!productName) return res.status(400).json({ error: 'productName is required' })
    if (!Number.isFinite(quantity) || quantity < 1) return res.status(400).json({ error: 'quantity must be at least 1' })
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return res.status(400).json({ error: 'sellingPrice must be > 0' })

    let storeId = session.storeId
    let storeName = session.storeName || ''

    if (session.role === 'store') {
      if (!storeId) return res.status(403).json({ error: 'Your account is not linked to a store' })
    } else {
      if (!body.storeName) return res.status(400).json({ error: 'storeName is required' })
      const { data: store, error: storeError } = await supabaseAdmin
        .from(TABLES.STORES)
        .select('id, name')
        .eq('name', String(body.storeName))
        .maybeSingle()

      if (storeError) throw storeError
      if (!store) {
        if (String(body.storeName) !== 'Direct') return res.status(404).json({ error: 'Store not found' })
        const { data: created, error: createError } = await supabaseAdmin
          .from(TABLES.STORES)
          .insert({ name: 'Direct', commission: 0 })
          .select('id, name')
          .single()
        if (createError) throw createError
        storeId = created.id
        storeName = created.name
      } else {
        storeId = store.id
        storeName = store.name
      }
    }

    if (!storeId) return res.status(400).json({ error: 'Could not resolve store' })

    let productId = String(body.productId || '').trim() || null
    if (productId) {
      const { data, error } = await supabaseAdmin.from(TABLES.PRODUCTS).select('id').eq('id', productId).maybeSingle()
      if (error) throw error
      if (!data) return res.status(400).json({ error: 'Product not found' })
      productId = data.id
    } else {
      const { data, error } = await supabaseAdmin
        .from(TABLES.PRODUCTS)
        .select('id')
        .eq('product_name', productName)
        .limit(2)
      if (error) throw error
      if (!data?.length) return res.status(404).json({ error: 'Product not found' })
      if (data.length > 1) return res.status(400).json({ error: 'Product match is ambiguous. Please select the exact product.' })
      productId = data[0].id
    }

    const requestKey = stableRequestKey(session.accountId, req, body, productId)
    const { data, error } = await supabaseAdmin.rpc('sell_from_inventory', {
      p_payload: {
        request_key: requestKey,
        engine_version: INVENTORY_ENGINE_VERSION,
        store_id: storeId,
        product_id: productId,
        product_name: productName,
        quantity,
        extra_qty: extraQty,
        selling_price: sellingPrice,
        shipment_cost: Number(body.shipmentCost) || 0,
        extra_charges: Number(body.extraCharges) || 0,
        client_name: body.clientName || null,
        order_type: body.orderType || 'Sale',
        occurred_at: body.occurredAt || null,
        order_code: body.orderCode || null,
        size_quantities: body.sizeQuantities || null,
        color_quantities: body.colorQuantities || null,
        variant_quantities: body.variantQuantities || null,
        created_by: session.accountId,
      },
    })

    if (error) {
      const message = error.message || 'Global inventory sale failed'
      if (message.includes('INVENTORY_ENGINE_VERSION_MISMATCH')) return res.status(409).json({ error: message, code: 'INVENTORY_ENGINE_VERSION_MISMATCH' })
      if (message.includes('INSUFFICIENT_GLOBAL_STOCK')) return res.status(409).json({ error: message, code: 'INSUFFICIENT_GLOBAL_STOCK' })
      if (message.includes('INVENTORY_CONCURRENT_UPDATE')) return res.status(409).json({ error: 'Inventory changed while this sale was being processed. Please retry.', code: 'INVENTORY_CONCURRENT_UPDATE' })
      if (message.includes('PRODUCT_NOT_FOUND')) return res.status(404).json({ error: 'Product not found' })
      if (message.includes('STORE_NOT_FOUND')) return res.status(404).json({ error: 'Store not found' })
      return res.status(500).json({ error: message })
    }

    return res.status(data?.duplicate ? 200 : 201).json({
      success: true,
      duplicate: Boolean(data?.duplicate),
      orderId: data?.order_id,
      orderCode: data?.order_code,
      storeName: data?.store_name || storeName,
    })
  } catch (error: any) {
    console.error('global-sale API error:', error)
    return res.status(500).json({ error: error?.message || 'Internal server error' })
  }
}
