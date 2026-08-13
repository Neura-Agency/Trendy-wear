import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession, getAllowedStoreIds, isSuperAdmin } from '../../lib/api/session'
import {
  adjustVariantQuantities,
  mergeVariantQuantities,
  normalizeFlatQuantities,
  normalizeVariantQuantities,
  rollupVariantQuantities,
  validateVariantRequest,
} from '../../lib/variantQuantities'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function generateOrderCode(
  existingCode?: string,
): Promise<string> {
  let code = existingCode ? existingCode.trim() : ''
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!code) {
      const ts = Date.now().toString(36).toUpperCase()
      const extra = Math.random().toString(36).substr(2, 8).toUpperCase()
      code = `ORD-${ts}-${extra}`
    }
    const { data, error } = await supabaseAdmin
      .from(TABLES.ORDERS)
      .select('id')
      .eq('order_code', code)
      .maybeSingle()
    if (!error && !data) break
    code = ''
  }
  return code
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
          size_quantities,
          color_quantities,
          variant_quantities,
          payment_status,
          order_returned,
          return_quantity,
          return_reason,
          return_size_quantities,
          return_color_quantities,
          return_variant_quantities,
          returned_at,
          refund_quantity,
          refund_amount,
          refund_reason,
          refund_size_quantities,
          refund_color_quantities,
          refund_variant_quantities,
          refunded_at,
          return_proof_url,
          refund_proof_url,
          created_at,
          stores:store_id ( name ),
          store_inventory:store_inventory_id (
            inventory:inventory_id (
              cost_price,
              batch_number
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
          size: row.size ?? null,
          color: row.color ?? null,
          sizeQuantities: row.size_quantities ?? null,
          colorQuantities: row.color_quantities ?? null,
          variantQuantities: row.variant_quantities ?? null,
          sellingPrice: num(row.selling_price),
          shipmentCost: num(row.shipment_cost),
          storeName: row.stores?.name ?? '',
          clientName: row.client_name ?? '',
          type: row.order_type ?? 'Sale',
          date: row.occurred_at ?? row.created_at,
          includedInPayout: row.included_in_payout ?? false,
          commissionPercent: num(row.commission_percent),
          costPrice,
          batchNumber: row.store_inventory?.inventory?.batch_number ?? null,
          commissionAmount: num(row.commission_amount),
          adminTake: num(row.admin_take),
          profit: num(row.profit),
          paymentStatus: row.payment_status ?? null,
          orderReturned: row.order_returned ?? false,
          returnQuantity: row.return_quantity ?? null,
          returnReason: row.return_reason ?? null,
          returnSizeQuantities: row.return_size_quantities ?? null,
          returnColorQuantities: row.return_color_quantities ?? null,
          returnVariantQuantities: row.return_variant_quantities ?? null,
          returnedAt: row.returned_at ?? null,
          refundQuantity: row.refund_quantity ?? null,
          refundAmount: row.refund_amount ?? null,
          refundReason: row.refund_reason ?? null,
          refundSizeQuantities: row.refund_size_quantities ?? null,
          refundColorQuantities: row.refund_color_quantities ?? null,
          refundVariantQuantities: row.refund_variant_quantities ?? null,
          refundedAt: row.refunded_at ?? null,
          returnProofUrl: row.return_proof_url ?? null,
          refundProofUrl: row.refund_proof_url ?? null,
          storeInventoryId: row.store_inventory_id ?? null,
          restockedFromOrderId: row.restocked_from_order_id ?? null,
        }
      })

      return res.json({ orders })
    }

    // ────────────────────────────────────────────────────────────────────────
    // POST — record a new sale
    // ────────────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const {
        productId,
        productName,
        brandName,
        productType,
        quantity,
        size,
        sizeQuantities,
        colorQuantities,
        variantQuantities,
        extraQty,       // bonus/free units dispatched (stock deducted but not billed)
        sellingPrice,
        shipmentCost,
        extraCharges,
        clientName,
        orderType,
        occurredAt,
        storeName,
        orderCode,     // optional: reuse an existing order code for batch carts
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
      const normalizedOrderVariants = normalizeVariantQuantities(variantQuantities)
      const orderVariantRollups = rollupVariantQuantities(normalizedOrderVariants)
      const effectiveSizeQuantities = orderVariantRollups.sizeQuantities ?? normalizeFlatQuantities(sizeQuantities)
      const effectiveColorQuantities = orderVariantRollups.colorQuantities ?? normalizeFlatQuantities(colorQuantities)

      // ── Resolve store_id ─────────────────────────────────────────────────
      let storeId: string | null = null
      let resolvedStoreName: string = storeName ?? ''

      if (session.role === 'store') {
        storeId = session.storeId
        resolvedStoreName = session.storeName ?? ''
      } else {
        // admin or store-manager
        if (!storeName) return res.status(400).json({ error: 'storeName is required' })
        // store manager check removed - anyone can record for any store
        const { data: store, error: storeErr } = await supabaseAdmin
          .from(TABLES.STORES)
          .select('id')
          .eq('name', storeName)
          .maybeSingle()
        if (storeErr) throw storeErr
        if (!store) {
          // Auto-create the special "Direct" store (owner sells straight from warehouse,
          // no store partner involved). No store_owners row is needed since Direct
          // sales pay 0% commission — this keeps the Direct Sales page working even
          // on a fresh database with no store partners set up yet.
          if (storeName === 'Direct') {
            const { data: createdStore, error: createStoreErr } = await supabaseAdmin
              .from(TABLES.STORES)
              .insert({ name: 'Direct', commission: 0 })
              .select('id')
              .single()
            if (createStoreErr) {
              console.error('Failed to auto-create Direct store:', createStoreErr)
              return res.status(500).json({ error: 'Failed to set up Direct store' })
            }
            storeId = createdStore.id
          } else {
            return res.status(404).json({ error: 'Store not found' })
          }
        } else {
          storeId = store.id
        }
      }

      if (!storeId) return res.status(400).json({ error: 'Could not resolve store' })

      // ── Resolve product_id ───────────────────────────────────────────────
      let resolvedProductId: string | null = null
      const normalizedProductId = String(productId || '').trim()
      const normalizedBrandName = String(brandName || '').trim()
      const normalizedProductType = String(productType || '').trim()

      if (normalizedProductId) {
        const { data: product, error: productErr } = await supabaseAdmin
          .from(TABLES.PRODUCTS)
          .select('id')
          .eq('id', normalizedProductId)
          .maybeSingle()
        if (productErr) throw productErr
        resolvedProductId = product?.id ?? null
      } else {
        let productQuery = supabaseAdmin
          .from(TABLES.PRODUCTS)
          .select('id')
          .eq('product_name', productName)

        if (normalizedBrandName) {
          productQuery = productQuery.eq('brand_name', normalizedBrandName)
        }

        if (normalizedProductType) {
          productQuery = productQuery.eq('product_type', normalizedProductType)
        }

        const { data: products, error: productErr } = await productQuery.limit(2)
        if (productErr) throw productErr

        if ((products || []).length === 1) {
          resolvedProductId = products[0].id
        } else if ((products || []).length > 1) {
          return res.status(400).json({ error: 'Product match is ambiguous. Please select the exact product.' })
        }
      }

      // ── Find store_inventory rows (FIFO: oldest first) ───────────────────
      // Special case: "Direct" store sells straight from warehouse inventory
      if (resolvedStoreName === 'Direct') {
        // Query warehouse inventory for this product (FIFO: oldest batch first)
        let invQuery = supabaseAdmin
          .from(TABLES.INVENTORY)
          .select('id, cost_price, quantity_available, size_quantities, color_quantities, variant_quantities')
          .order('created_at', { ascending: true })

        if (resolvedProductId) {
          invQuery = invQuery.eq('product_id', resolvedProductId)
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

        if (normalizedOrderVariants) {
          const variantAvailable = warehouseRows.reduce((acc: Record<string, Record<string, number>>, row: any) => {
            const variants = normalizeVariantQuantities(row.variant_quantities) || {}
            Object.entries(variants).forEach(([color, sizes]) => {
              if (!acc[color]) acc[color] = {}
              Object.entries(sizes).forEach(([size, qty]) => {
                acc[color][size] = (acc[color][size] || 0) + qty
              })
            })
            return acc
          }, {})
          const validationError = validateVariantRequest(normalizedOrderVariants, variantAvailable)
          if (validationError) return res.status(400).json({ error: validationError })
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
            order_code: await generateOrderCode(),
             store_id: storeId,
             product_id: resolvedProductId,
            product_name: productName,
            color: req.body?.color || null,
            size_quantities: effectiveSizeQuantities,
            color_quantities: effectiveColorQuantities,
            variant_quantities: normalizedOrderVariants,
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
            size: size || null,
          })
          .select('id, order_code')

        if (orderErr) {
          console.error('orders INSERT error (direct):', orderErr)
          return res.status(500).json({ error: 'Failed to save order' })
        }

        const directOrder = Array.isArray(order) ? order[0] : order
        if (!directOrder) {
          return res.status(500).json({ error: 'Failed to save order' })
        }

        // ── Deduct from warehouse inventory FIFO ──────────────────────────
        let remaining = totalDispatch
        for (const row of warehouseRows) {
          if (remaining <= 0) break
          const rowQty = num((row as any).quantity_available)
          const deduct = Math.min(rowQty, remaining)
          
          const updatePayload: Record<string, any> = { quantity_available: rowQty - deduct }
          await supabaseAdmin
            .from(TABLES.INVENTORY)
            .update(updatePayload)
            .eq('id', (row as any).id)
          remaining -= deduct
        }

        return res.status(201).json({
          success: true,
          orderId: directOrder.id,
          orderCode: directOrder.order_code,
        })
      }

      let storeInvQuery = supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .select('id, commission_percent, owner_supply_price, quantity_remaining, size_quantities_remaining, color_quantities_remaining, variant_quantities_remaining')
        .eq('store_id', storeId)
        .order('created_at', { ascending: true })

      if (resolvedProductId) {
        storeInvQuery = storeInvQuery.eq('product_id', resolvedProductId)
      }

      const { data: invRows, error: invErr } = await storeInvQuery
      if (invErr) throw invErr

      const rows = (invRows || []).filter((r: any) => num(r.quantity_remaining) > 0)
      
      const totalAvailable = rows.reduce((s: number, r: any) => s + num(r.quantity_remaining), 0)
      if (totalAvailable < totalDispatch) {
        return res.status(400).json({ error: `Insufficient stock. Only ${totalAvailable} unit(s) available (need ${totalDispatch}: ${qty} sold + ${bonusQty} bonus).` })
      }

      if (normalizedOrderVariants) {
        const variantAvailable = rows.reduce((acc: Record<string, Record<string, number>>, row: any) => {
          const variants = normalizeVariantQuantities(row.variant_quantities_remaining) || {}
          Object.entries(variants).forEach(([color, sizes]) => {
            if (!acc[color]) acc[color] = {}
            Object.entries(sizes).forEach(([size, qty]) => {
              acc[color][size] = (acc[color][size] || 0) + qty
            })
          })
          return acc
        }, {})
        const validationError = validateVariantRequest(normalizedOrderVariants, variantAvailable)
        if (validationError) return res.status(400).json({ error: validationError })
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
      const finalOrderCode = String(orderCode || '').trim() || (await generateOrderCode())
      const { data: order, error: orderErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .insert({
          order_code: finalOrderCode,
          store_id: storeId,
          product_id: resolvedProductId,
          product_name: productName,
          color: req.body?.color || null,
          size_quantities: effectiveSizeQuantities,
          color_quantities: effectiveColorQuantities,
          variant_quantities: normalizedOrderVariants,
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
          size: size || null,
        })
        .select('id, order_code')

      if (orderErr) {
        console.error('orders INSERT error:', orderErr)
        return res.status(500).json({ error: 'Failed to save order' })
      }

      const savedOrder = Array.isArray(order) ? order[0] : order
      if (!savedOrder) {
        return res.status(500).json({ error: 'Failed to save order' })
      }

      // ── Decrement quantity_remaining + pending_return_qty across rows FIFO ─
      let remaining = totalDispatch
      let remainingVariants = normalizedOrderVariants
      let committedQty = 0
      for (const row of rows) {
        if (remaining <= 0) break
        const rowId = (row as any).id
        const rowQty = num((row as any).quantity_remaining)
        const pendingRet = num((row as any).pending_return_qty) || 0
        const rowDeduct = Math.min(rowQty, remaining)
        const fromRestock = Math.min(pendingRet, rowDeduct)
        const newQtyRem = rowQty - rowDeduct
        const newPendRet = Math.max(0, pendingRet - fromRestock)

        const sizeRem = ((row as any).size_quantities_remaining || {}) as Record<string, number>
        const colorRem = ((row as any).color_quantities_remaining || {}) as Record<string, number>
        const variantRem = (row as any).variant_quantities_remaining
        const pendSize = ((row as any).pending_return_size_quantities || {}) as Record<string, number>
        const pendColor = ((row as any).pending_return_color_quantities || {}) as Record<string, number>
        const pendVariant = (row as any).pending_return_variant_quantities
        const normalizeFlat = (obj: unknown) => {
          const out: Record<string, number> = {}
          Object.entries(obj as Record<string, number> || {}).forEach(([k, v]) => { out[k] = num(v) })
          return out
        }
        const normalizeVariant = (obj: unknown) => {
          try { return JSON.parse(JSON.stringify(obj)) } catch { return obj }
        }
        const rollups = (v: any) => ({
          sizeQuantities: Object.entries(normalizeVariant(v) || {}).reduce((acc, [, sizes]) => {
            Object.entries(sizes as Record<string, number>).forEach(([s, q]) => { acc[s] = (acc[s] || 0) + num(q) })
            return acc
          }, {} as Record<string, number>),
          colorQuantities: Object.entries(normalizeVariant(v) || {}).reduce((acc, [, sizes]) => {
            Object.entries(sizes as Record<string, number>).forEach(([, q]) => { acc[''] = (acc[''] || 0) + num(q) })
            return acc
          }, {} as Record<string, number>),
        })

        const updatePayload: Record<string, any> = {
          quantity_remaining: newQtyRem,
          pending_return_qty: newPendRet,
        }
        if (fromRestock > 0 && pendSize) {
          const next = { ...pendSize }
          const keys = Object.keys(next)
          const perKey = Math.max(1, Math.floor(fromRestock / keys.length))
          let consumed = 0
          keys.forEach((k, i) => {
            const amt = i === keys.length - 1 ? Math.max(0, fromRestock - consumed) : perKey
            const sub = Math.min(num(next[k] || 0), amt)
            next[k] = Math.max(0, num(next[k] || 0) - sub)
            consumed += sub
          })
          updatePayload.pending_return_size_quantities = Object.values(next).some(v => v > 0) ? next : null
        }
        if (fromRestock > 0 && pendColor) {
          const next = { ...pendColor }
          const keys = Object.keys(next)
          const perKey = Math.max(1, Math.floor(fromRestock / keys.length))
          let consumed = 0
          keys.forEach((k, i) => {
            const amt = i === keys.length - 1 ? Math.max(0, fromRestock - consumed) : perKey
            const sub = Math.min(num(next[k] || 0), amt)
            next[k] = Math.max(0, num(next[k] || 0) - sub)
            consumed += sub
          })
          updatePayload.pending_return_color_quantities = Object.values(next).some(v => v > 0) ? next : null
        }
        if (fromRestock > 0 && pendVariant) {
          updatePayload.pending_return_variant_quantities = adjustVariantQuantities(pendVariant, normalizedOrderVariants, -1) ?? pendVariant
        }

        if (remainingVariants && variantRem) {
          const nextVariants = adjustVariantQuantities(variantRem, remainingVariants, -1)
          const varRollups = rollups(nextVariants)
          updatePayload.variant_quantities_remaining = nextVariants
          updatePayload.size_quantities_remaining = Object.keys(varRollups.sizeQuantities).length ? varRollups.sizeQuantities : null
          updatePayload.color_quantities_remaining = Object.keys(varRollups.colorQuantities).length ? varRollups.colorQuantities : null
        } else if (normalizedOrderVariants && variantRem) {
          const nextVariants = adjustVariantQuantities(variantRem, normalizedOrderVariants, -1)
          const varRollups = rollups(nextVariants)
          updatePayload.variant_quantities_remaining = nextVariants
          updatePayload.size_quantities_remaining = Object.keys(varRollups.sizeQuantities).length ? varRollups.sizeQuantities : null
          updatePayload.color_quantities_remaining = Object.keys(varRollups.colorQuantities).length ? varRollups.colorQuantities : null
        } else if (!remainingVariants) {
          updatePayload.size_quantities_remaining = Object.keys(sizeRem).length ? { ...sizeRem } : null
          if (normalizedOrderVariants) {
            const nextV = adjustVariantQuantities(variantRem, normalizedOrderVariants, -1)
            const r = rollups(nextV)
            updatePayload.variant_quantities_remaining = nextV
            updatePayload.size_quantities_remaining = Object.keys(r.sizeQuantities).length ? r.sizeQuantities : null
            updatePayload.color_quantities_remaining = Object.keys(r.colorQuantities).length ? r.colorQuantities : null
          }
        }

        const { error: updErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .update(updatePayload)
          .eq('id', rowId)
        if (updErr) console.error('stock decrement error:', updErr)

        remaining -= rowDeduct
        committedQty += rowDeduct
        remainingVariants = null
      }

      if (committedQty < totalDispatch) {
        await supabaseAdmin.from(TABLES.ORDERS).delete().eq('id', savedOrder.id)
        return res.status(500).json({ error: 'Failed to update store inventory during order creation' })
      }

      return res.status(201).json({
        success: true,
        orderId: savedOrder.id,
        orderCode: savedOrder.order_code,
      })
    }

    // ────────────────────────────────────────────────────────────────────────
    // PATCH — update commission % or payment_status
    // ────────────────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      // ── Mark order as returned ───────────────────────────────────────────

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

      // ── Mark order as returned (Scenario A — Sale Return) ──────────────────
      if (req.body?.isReturn === true) {
        const {
          id,
          returnQuantity,
          returnReason,
          returnSizeQuantities,
          returnColorQuantities,
          returnVariantQuantities,
          returnProofUrl,
        } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        // Fetch order details
        const { data: order, error: fetchErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .select('id, quantity, size_quantities, color_quantities, variant_quantities, return_quantity, return_size_quantities, return_color_quantities, return_variant_quantities, store_inventory_id, order_returned, commission_percent, selling_price, shipment_cost, cost_price')
          .eq('id', id)
          .single();

        if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });

        const originalQty = num(order.quantity);
        const alreadyReturnedQty = Math.max(0, num(order.return_quantity));
        const remainingQty = Math.max(0, originalQty - alreadyReturnedQty);
        if (remainingQty < 1) return res.status(400).json({ error: 'Order already fully returned' });

        const retQty = returnQuantity != null ? Math.min(num(returnQuantity), remainingQty) : remainingQty;
        if (retQty < 1) return res.status(400).json({ error: 'returnQuantity must be at least 1' });
        const normalizedReturnVariants = normalizeVariantQuantities(returnVariantQuantities)
        const returnVariantRollups = rollupVariantQuantities(normalizedReturnVariants)
        const effectiveReturnSizeQuantities = returnVariantRollups.sizeQuantities ?? normalizeFlatQuantities(returnSizeQuantities)
        const effectiveReturnColorQuantities = returnVariantRollups.colorQuantities ?? normalizeFlatQuantities(returnColorQuantities)
        const remainingVariantQuantities = adjustVariantQuantities(order.variant_quantities, order.return_variant_quantities, -1)

        if (normalizedReturnVariants) {
          const variantValidationError = validateVariantRequest(normalizedReturnVariants, remainingVariantQuantities)
          if (variantValidationError) {
            return res.status(400).json({ error: `returnVariantQuantities exceed remaining quantity: ${variantValidationError}` })
          }
        }

        const mergeFlatQuantities = (base: unknown, incoming: unknown) => {
          const next = { ...(normalizeFlatQuantities(base) || {}) }
          const additions = normalizeFlatQuantities(incoming) || {}
          Object.entries(additions).forEach(([key, value]) => {
            next[key] = (next[key] || 0) + num(value)
          })
          return Object.keys(next).length ? next : null
        }

        const mergedReturnSizeQuantities = mergeFlatQuantities(order.return_size_quantities, effectiveReturnSizeQuantities)
        const mergedReturnColorQuantities = mergeFlatQuantities(order.return_color_quantities, effectiveReturnColorQuantities)
        const mergedReturnVariantQuantities = mergeVariantQuantities(order.return_variant_quantities, normalizedReturnVariants)
        const newReturnQty = alreadyReturnedQty + retQty
        const fullyReturned = newReturnQty >= originalQty

        const remainingUnits = Math.max(0, originalQty - newReturnQty)
        const remainingGross = num(order.selling_price) * remainingUnits - num(order.shipment_cost)
        const remainingCommission = Math.round(remainingGross * num(order.commission_percent)) / 100
        const remainingAdminTake = remainingGross - remainingCommission
        const remainingProfit = remainingAdminTake - (num(order.cost_price) * remainingUnits)

        // 1. Update return progress and remaining financials
        const { error: updErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({
            order_returned: fullyReturned,
            profit: Math.max(0, remainingProfit),
            admin_take: Math.max(0, remainingAdminTake),
            commission_amount: Math.max(0, remainingCommission),
            return_quantity: newReturnQty,
            return_reason: returnReason || null,
            return_size_quantities: mergedReturnSizeQuantities,
            return_color_quantities: mergedReturnColorQuantities,
            return_variant_quantities: mergedReturnVariantQuantities,
            returned_at: new Date().toISOString(),
            return_proof_url: returnProofUrl || null,
          })
          .eq('id', id);

        if (updErr) {
          console.error('Return update error:', updErr);
          const message = updErr.message || JSON.stringify(updErr);
          return res.status(500).json({ error: `Failed to mark order as returned: ${message}` });
        }

        // 2. Restore store_inventory quantities
        if (order.store_inventory_id) {
          const { data: inv, error: invFetchErr } = await supabaseAdmin
            .from(TABLES.STORE_INVENTORY)
            .select('quantity_remaining, size_quantities_remaining, color_quantities_remaining, variant_quantities_remaining, pending_return_qty, pending_return_size_quantities, pending_return_color_quantities, pending_return_variant_quantities')
            .eq('id', order.store_inventory_id)
            .single();

          if (!invFetchErr && inv) {
            // Rebuild size/color remaining
            const newSizeRem = { ...(inv.size_quantities_remaining || {}) } as Record<string, number>;
            if (effectiveReturnSizeQuantities) {
              Object.entries(effectiveReturnSizeQuantities).forEach(([size, qty]) => {
                newSizeRem[size] = (newSizeRem[size] || 0) + num(qty);
              });
            }
            const newColorRem = { ...(inv.color_quantities_remaining || {}) } as Record<string, number>;
            if (effectiveReturnColorQuantities) {
              Object.entries(effectiveReturnColorQuantities).forEach(([color, qty]) => {
                newColorRem[color] = (newColorRem[color] || 0) + num(qty);
              });
            }

            // Pending return tracking (for Scenario B)
            const newPendingSize = { ...(inv.pending_return_size_quantities || {}) } as Record<string, number>;
            if (effectiveReturnSizeQuantities) {
              Object.entries(effectiveReturnSizeQuantities).forEach(([size, qty]) => {
                newPendingSize[size] = (newPendingSize[size] || 0) + num(qty);
              });
            }
            const newPendingColor = { ...(inv.pending_return_color_quantities || {}) } as Record<string, number>;
            if (effectiveReturnColorQuantities) {
              Object.entries(effectiveReturnColorQuantities).forEach(([color, qty]) => {
                newPendingColor[color] = (newPendingColor[color] || 0) + num(qty);
              });
            }

            const { error: invUpdErr } = await supabaseAdmin
              .from(TABLES.STORE_INVENTORY)
              .update({
                quantity_remaining: num(inv.quantity_remaining) + retQty,
                size_quantities_remaining: Object.keys(newSizeRem).length ? newSizeRem : null,
                color_quantities_remaining: Object.keys(newColorRem).length ? newColorRem : null,
                variant_quantities_remaining: adjustVariantQuantities(inv.variant_quantities_remaining, normalizedReturnVariants, 1) ?? inv.variant_quantities_remaining,
                pending_return_qty: (num(inv.pending_return_qty) || 0) + retQty,
                pending_return_size_quantities: Object.keys(newPendingSize).length ? newPendingSize : null,
                pending_return_color_quantities: Object.keys(newPendingColor).length ? newPendingColor : null,
                pending_return_variant_quantities: adjustVariantQuantities(inv.pending_return_variant_quantities, normalizedReturnVariants, 1) ?? inv.pending_return_variant_quantities,
              })
              .eq('id', order.store_inventory_id);
            if (invUpdErr) console.error('Inventory return error:', invUpdErr);
          }
        }

        return res.json({ success: true });
      }

      // ── Refund ──────────────────────────────────────────────────────────────
      // Customer KEEPS the item. No inventory restored. Full cost of goods is absorbed as loss.
      // Commission is clawed back on refunded units (Option A).
      if (req.body?.isRefund === true) {
        const {
          id,
          refundQuantity,
          refundReason,
          refundSizeQuantities,
          refundColorQuantities,
          refundVariantQuantities,
          refundProofUrl,
        } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { data: order, error: fetchErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .select('id, quantity, size_quantities, color_quantities, variant_quantities, return_quantity, return_variant_quantities, refund_quantity, refund_size_quantities, refund_color_quantities, refund_variant_quantities, commission_percent, selling_price, shipment_cost, cost_price, store_inventory_id')
          .eq('id', id)
          .single();

        if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });

        const originalQty = num(order.quantity);
        const alreadyReturnedQty = Math.max(0, num(order.return_quantity));
        const alreadyRefundedQty = Math.max(0, num(order.refund_quantity));
        const remainingQty = Math.max(0, originalQty - alreadyReturnedQty - alreadyRefundedQty);
        if (remainingQty < 1) return res.status(400).json({ error: 'No remaining units available to refund' });

        const normalizedRefundVariants = normalizeVariantQuantities(refundVariantQuantities);
        const refundVariantRollups = rollupVariantQuantities(normalizedRefundVariants);
        const effectiveRefundSizeQuantities = refundVariantRollups.sizeQuantities ?? normalizeFlatQuantities(refundSizeQuantities);
        const effectiveRefundColorQuantities = refundVariantRollups.colorQuantities ?? normalizeFlatQuantities(refundColorQuantities);

        const refQty = refundQuantity != null ? Math.min(num(refundQuantity), remainingQty) : remainingQty;
        if (refQty < 1) return res.status(400).json({ error: 'refundQuantity must be at least 1' });

        if (normalizedRefundVariants) {
          const tempQuantities = adjustVariantQuantities(order.variant_quantities, order.return_variant_quantities, -1);
          const remainingVariantQuantities = adjustVariantQuantities(tempQuantities, order.refund_variant_quantities, -1);
          const variantValidationError = validateVariantRequest(normalizedRefundVariants, remainingVariantQuantities);
          if (variantValidationError) {
            return res.status(400).json({ error: `refundVariantQuantities exceed remaining quantity: ${variantValidationError}` });
          }
        }

        const mergeFlatQuantities = (base: unknown, incoming: unknown) => {
          const next = { ...(normalizeFlatQuantities(base) || {}) };
          const additions = normalizeFlatQuantities(incoming) || {};
          Object.entries(additions).forEach(([key, value]) => {
            next[key] = (next[key] || 0) + num(value);
          });
          return Object.keys(next).length ? next : null;
        };

        const mergedRefundSizeQuantities = mergeFlatQuantities(order.refund_size_quantities, effectiveRefundSizeQuantities);
        const mergedRefundColorQuantities = mergeFlatQuantities(order.refund_color_quantities, effectiveRefundColorQuantities);
        const mergedRefundVariantQuantities = mergeVariantQuantities(order.refund_variant_quantities, normalizedRefundVariants);
        const newRefundQty = alreadyRefundedQty + refQty;

        // Refund amount = selling_price x total refunded units
        const refundAmount = num(order.selling_price) * newRefundQty;

        // Remaining revenue = non-returned, non-refunded units only
        // Cost absorbed for remaining originals only; already-returned units are not double-charged.
        const remainingUnits = Math.max(0, originalQty - alreadyReturnedQty - newRefundQty);
        const remainingGross = num(order.selling_price) * remainingUnits - num(order.shipment_cost);
        // Commission clawed back on refunded units (Option A)
        const remainingCommission = Math.round(remainingGross * num(order.commission_percent)) / 100;
        const remainingAdminTake = remainingGross - remainingCommission;
        // Absorb cost only for units that were actually lost (not returned)
        const remainingProfit = remainingAdminTake - (num(order.cost_price) * (originalQty - alreadyReturnedQty));

        const { error: updErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({
            profit: remainingProfit,
            admin_take: Math.max(0, remainingAdminTake),
            commission_amount: Math.max(0, remainingCommission),
            refund_quantity: newRefundQty,
            refund_amount: refundAmount,
            refund_reason: refundReason || null,
            refund_size_quantities: mergedRefundSizeQuantities,
            refund_color_quantities: mergedRefundColorQuantities,
            refund_variant_quantities: mergedRefundVariantQuantities,
            refunded_at: new Date().toISOString(),
            refund_proof_url: refundProofUrl || null,
          })
          .eq('id', id);

        if (updErr) {
          console.error('Refund update error:', updErr);
          return res.status(500).json({ error: `Failed to process refund: ${updErr.message || JSON.stringify(updErr)}` });
        }

        // If the order has store inventory with pending returns, reduce the pending
        // count because refunded units will NOT be physically returned to the warehouse.
        if (order.store_inventory_id) {
          const { data: inv, error: invFetchErr } = await supabaseAdmin
            .from(TABLES.STORE_INVENTORY)
            .select('pending_return_qty, pending_return_size_quantities, pending_return_color_quantities, pending_return_variant_quantities')
            .eq('id', order.store_inventory_id)
            .single()

          if (!invFetchErr && inv) {
            const pendingQty = num(inv.pending_return_qty) || 0
            if (pendingQty > 0 && refQty > 0) {
              const reduceBy = Math.min(refQty, pendingQty)

              // Rebuild pending size/color/variant breakdowns (subtract refunded units)
              const newPendingSize = { ...(inv.pending_return_size_quantities || {}) } as Record<string, number>
              if (effectiveRefundSizeQuantities) {
                Object.entries(effectiveRefundSizeQuantities).forEach(([size, qty]) => {
                  if (newPendingSize[size] != null) {
                    newPendingSize[size] = Math.max(0, (newPendingSize[size] || 0) - num(qty))
                  }
                })
              }
              const newPendingColor = { ...(inv.pending_return_color_quantities || {}) } as Record<string, number>
              if (effectiveRefundColorQuantities) {
                Object.entries(effectiveRefundColorQuantities).forEach(([color, qty]) => {
                  if (newPendingColor[color] != null) {
                    newPendingColor[color] = Math.max(0, (newPendingColor[color] || 0) - num(qty))
                  }
                })
              }

              const newPendingVariant = adjustVariantQuantities(
                inv.pending_return_variant_quantities,
                normalizedRefundVariants,
                -1
              )

              await supabaseAdmin
                .from(TABLES.STORE_INVENTORY)
                .update({
                  pending_return_qty: Math.max(0, pendingQty - reduceBy),
                  pending_return_size_quantities: Object.values(newPendingSize).some(v => v > 0) ? newPendingSize : null,
                  pending_return_color_quantities: Object.values(newPendingColor).some(v => v > 0) ? newPendingColor : null,
                  pending_return_variant_quantities: newPendingVariant,
                })
                .eq('id', order.store_inventory_id)
            }
          }
        }

        // NO inventory restoration — customer keeps the item
        return res.json({ success: true, refundAmount });
      }

      // ── Undo Return ─────────────────────────────────────────────────────────
      if (req.body?.isUndoReturn === true) {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { data: order, error: fetchErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .select('id, quantity, selling_price, shipment_cost, cost_price, commission_percent, store_inventory_id, order_returned, return_quantity, refund_quantity, return_size_quantities, return_color_quantities, return_variant_quantities')
          .eq('id', id)
          .single();

        if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });
        if (!num(order.return_quantity)) return res.status(400).json({ error: 'Order has no return to undo' });

        // Recalculate original financials (accounting for any refunds that remain)
        const qty = num(order.quantity);
        const price = num(order.selling_price);
        const ship = num(order.shipment_cost);
        const cost = num(order.cost_price);
        const pct = num(order.commission_percent);
        const alreadyRefundedQty = Math.max(0, num(order.refund_quantity));
        const effectiveQty = Math.max(0, qty - alreadyRefundedQty);
        const gross = price * effectiveQty - ship;
        const commission = Math.round(gross * pct / 100);
        const adminTake = gross - commission;
        const profit = adminTake - cost * effectiveQty;

        // 1. Restore order financials and clear return flags
        const { error: updErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({
            order_returned: false,
            profit,
            admin_take: adminTake,
            commission_amount: commission,
            return_quantity: null,
            return_reason: null,
            return_size_quantities: null,
            return_color_quantities: null,
            return_variant_quantities: null,
            returned_at: null,
          })
          .eq('id', id);

        if (updErr) {
          console.error('Undo return update error:', updErr);
          return res.status(500).json({ error: 'Failed to undo return' });
        }

        // 2. Subtract the returned qty back from store_inventory
        if (order.store_inventory_id) {
          const { data: inv, error: invFetchErr } = await supabaseAdmin
            .from(TABLES.STORE_INVENTORY)
            .select('quantity_remaining, size_quantities_remaining, color_quantities_remaining, variant_quantities_remaining, pending_return_qty, pending_return_size_quantities, pending_return_color_quantities, pending_return_variant_quantities')
            .eq('id', order.store_inventory_id)
            .single();

          if (!invFetchErr && inv) {
            const retQty = num(order.return_quantity) || qty;
            const retSizes = order.return_size_quantities as Record<string, number> | null;
            const retColors = order.return_color_quantities as Record<string, number> | null;
            const retVariants = normalizeVariantQuantities(order.return_variant_quantities);

            const newSizeRem = { ...(inv.size_quantities_remaining || {}) } as Record<string, number>;
            if (retSizes) {
              Object.entries(retSizes).forEach(([size, q]) => {
                newSizeRem[size] = Math.max(0, (newSizeRem[size] || 0) - num(q));
              });
            }
            const newColorRem = { ...(inv.color_quantities_remaining || {}) } as Record<string, number>;
            if (retColors) {
              Object.entries(retColors).forEach(([color, q]) => {
                newColorRem[color] = Math.max(0, (newColorRem[color] || 0) - num(q));
              });
            }
            const newPendingSize = { ...(inv.pending_return_size_quantities || {}) } as Record<string, number>;
            if (retSizes) {
              Object.entries(retSizes).forEach(([size, q]) => {
                newPendingSize[size] = Math.max(0, (newPendingSize[size] || 0) - num(q));
              });
            }
            const newPendingColor = { ...(inv.pending_return_color_quantities || {}) } as Record<string, number>;
            if (retColors) {
              Object.entries(retColors).forEach(([color, q]) => {
                newPendingColor[color] = Math.max(0, (newPendingColor[color] || 0) - num(q));
              });
            }

            const { error: invUpdErr } = await supabaseAdmin
              .from(TABLES.STORE_INVENTORY)
              .update({
                quantity_remaining: Math.max(0, num(inv.quantity_remaining) - retQty),
                size_quantities_remaining: Object.keys(newSizeRem).length ? newSizeRem : null,
                color_quantities_remaining: Object.keys(newColorRem).length ? newColorRem : null,
                variant_quantities_remaining: adjustVariantQuantities(inv.variant_quantities_remaining, retVariants, -1),
                pending_return_qty: Math.max(0, (num(inv.pending_return_qty) || 0) - retQty),
                pending_return_size_quantities: Object.keys(newPendingSize).length ? newPendingSize : null,
                pending_return_color_quantities: Object.keys(newPendingColor).length ? newPendingColor : null,
                pending_return_variant_quantities: adjustVariantQuantities(inv.pending_return_variant_quantities, retVariants, -1),
              })
              .eq('id', order.store_inventory_id);
            if (invUpdErr) console.error('Undo return inventory error:', invUpdErr);
          }
        }

        return res.json({ success: true });
      }

      // ── Undo Refund ─────────────────────────────────────────────────────────
      if (req.body?.isUndoRefund === true) {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { data: order, error: fetchErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .select('id, quantity, selling_price, shipment_cost, cost_price, commission_percent, return_quantity, refund_quantity')
          .eq('id', id)
          .single();

        if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });
        if (!num(order.refund_quantity)) return res.status(400).json({ error: 'Order has no refund to undo' });

        // Recalculate financials as if refund never happened
        const qty = num(order.quantity);
        const price = num(order.selling_price);
        const ship = num(order.shipment_cost);
        const cost = num(order.cost_price);
        const pct = num(order.commission_percent);
        const alreadyReturnedQty = Math.max(0, num(order.return_quantity));
        const remainingUnits = Math.max(0, qty - alreadyReturnedQty);
        const gross = price * remainingUnits - ship;
        const commission = Math.round(gross * pct / 100);
        const adminTake = gross - commission;
        const profit = adminTake - cost * remainingUnits;

        const { error: updErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({
            profit,
            admin_take: Math.max(0, adminTake),
            commission_amount: Math.max(0, commission),
            refund_quantity: null,
            refund_amount: null,
            refund_reason: null,
            refund_size_quantities: null,
            refund_color_quantities: null,
            refund_variant_quantities: null,
            refunded_at: null,
          })
          .eq('id', id);

        if (updErr) {
          console.error('Undo refund update error:', updErr);
          return res.status(500).json({ error: 'Failed to undo refund' });
        }

        return res.json({ success: true });
      }

      const { id, commissionPercent } = req.body
      if (!id || commissionPercent === undefined) {
        return res.status(400).json({ error: 'id and commissionPercent are required' })
      }

      const newPct = num(commissionPercent)

      // Fetch the existing order to recalculate from source values
      // Must include return/refund state so we don't overwrite those adjustments.
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .select('selling_price, quantity, shipment_cost, cost_price, return_quantity, refund_quantity, stores:store_id(name)')
        .eq('id', id)
        .single()

      if (fetchErr || !existing) {
        return res.status(404).json({ error: 'Order not found' })
      }

      const originalQty        = num(existing.quantity)
      const alreadyReturnedQty = Math.max(0, num(existing.return_quantity))
      const alreadyRefundedQty = Math.max(0, num(existing.refund_quantity))
      const effectiveQty       = Math.max(0, originalQty - alreadyReturnedQty - alreadyRefundedQty)

      const grossAmount     = num(existing.selling_price) * effectiveQty
      const totalDeductions = num(existing.shipment_cost)
      const costPrice       = num(existing.cost_price) * Math.max(0, originalQty - alreadyReturnedQty)
      const amountReceived   = grossAmount - totalDeductions
      const commissionAmount = Math.round(amountReceived * newPct) / 100
      const adminTake        = amountReceived - commissionAmount
      const profit           = adminTake - costPrice

      const { error: updateErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .update({
          commission_percent:  newPct,
          commission_amount:   commissionAmount,
          admin_take:          adminTake,
          profit:              profit,
        })
        .eq('id', id)

      if (updateErr) {
        console.error('orders PATCH error:', updateErr)
        return res.status(500).json({ error: 'Failed to update order commission' })
      }

      return res.json({ success: true, commissionAmount, adminTake, profit })
    }

    // ────────────────────────────────────────────────────────────────────────
    // PUT — full order edit (recalculates all financials)
    // ────────────────────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, quantity, sellingPrice, shipmentCost, extraCharges, clientName, occurredAt, size, color, sizeQuantities, colorQuantities, variantQuantities } = req.body
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
      const normalizedVariants = normalizeVariantQuantities(variantQuantities)
      const variantRollups = rollupVariantQuantities(normalizedVariants)

      const { error: updateErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .update({
          quantity:           qty,
          selling_price:      price,
          shipment_cost:      totalDeductions,
          client_name:        clientName ?? '',
          occurred_at:        occurredAt,
          size:               size ?? null,
          color:              color ?? null,
          size_quantities:    variantRollups.sizeQuantities ?? sizeQuantities ?? null,
          color_quantities:   variantRollups.colorQuantities ?? colorQuantities ?? null,
          variant_quantities: normalizedVariants,
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
    // DELETE — remove a sale record and reverse all its effects
    // ────────────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id is required' })

      // 1. Fetch order with linked store_inventory and warehouse inventory
      const { data: order, error: fetchErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .select(`
          *,
          store_inventory:store_inventory_id (
            id,
            inventory_id,
            quantity_remaining,
            size_quantities_remaining,
            color_quantities_remaining,
            variant_quantities_remaining
          )
        `)
        .eq('id', id)
        .single()

      if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' })

      // 2. Block deletion if already included in a payout
      if (order.included_in_payout) {
        return res.status(409).json({ error: 'Cannot delete: this order has already been included in a payout. Remove it from the payout first, then retry.' })
      }

      const retQty = Math.max(0, num(order.return_quantity))
      const refQty = Math.max(0, num(order.refund_quantity))
      const soldQty = num(order.quantity)
      const netToRestore = Math.max(0, soldQty - retQty)

      // Helper: merge flat quantities (add incoming into base)
      const mergeFlat = (base: unknown, incoming: unknown): Record<string, number> | null => {
        const next = { ...(normalizeFlatQuantities(base) || {}) }
        const additions = normalizeFlatQuantities(incoming) || {}
        Object.entries(additions).forEach(([k, v]) => {
          next[k] = (next[k] || 0) + num(v)
        })
        return Object.keys(next).length ? next : null
      }

      // 3. Undo refund first (pure financials, no inventory impact)
      if (refQty > 0) {
        const price = num(order.selling_price)
        const ship = num(order.shipment_cost)
        const cost = num(order.cost_price)
        const pct = num(order.commission_percent)
        const gross = price * soldQty - ship
        const commission = Math.round(gross * pct / 100)
        const adminTake = gross - commission
        const profit = adminTake - cost * soldQty

        const { error: updErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({
            profit,
            admin_take: Math.max(0, adminTake),
            commission_amount: Math.max(0, commission),
            refund_quantity: null,
            refund_amount: null,
            refund_reason: null,
            refund_size_quantities: null,
            refund_color_quantities: null,
            refund_variant_quantities: null,
            refunded_at: null,
          })
          .eq('id', id)

        if (updErr) {
          console.error('Delete undo-refund error:', updErr)
          return res.status(500).json({ error: 'Failed to undo refund during delete' })
        }
      }

      // 4. Undo return and restore store_inventory in a single update
      if (retQty > 0 || netToRestore > 0) {
        const siRow = order.store_inventory as any
        if (siRow?.id) {
          const price = num(order.selling_price)
          const ship = num(order.shipment_cost)
          const cost = num(order.cost_price)
          const pct = num(order.commission_percent)
          const gross = price * soldQty - ship
          const commission = Math.round(gross * pct / 100)
          const adminTake = gross - commission
          const profit = adminTake - cost * soldQty

          const { error: updErr } = await supabaseAdmin
            .from(TABLES.ORDERS)
            .update({
              order_returned: false,
              profit,
              admin_take: Math.max(0, adminTake),
              commission_amount: Math.max(0, commission),
              return_quantity: null,
              return_reason: null,
              return_size_quantities: null,
              return_color_quantities: null,
              return_variant_quantities: null,
              returned_at: null,
            })
            .eq('id', id)

          if (updErr) {
            console.error('Delete undo-return error:', updErr)
            return res.status(500).json({ error: 'Failed to undo return during delete' })
          }

          const netSizeRem = mergeFlat(siRow.size_quantities_remaining, order.size_quantities)
          const netColorRem = mergeFlat(siRow.color_quantities_remaining, order.color_quantities)
          const netVariantRem = mergeVariantQuantities(siRow.variant_quantities_remaining, order.variant_quantities)

          const { error: siUpdErr } = await supabaseAdmin
            .from(TABLES.STORE_INVENTORY)
            .update({
              quantity_remaining: num(siRow.quantity_remaining) + netToRestore,
              size_quantities_remaining: netSizeRem,
              color_quantities_remaining: netColorRem,
              variant_quantities_remaining: netVariantRem,
              pending_return_qty: 0,
              pending_return_size_quantities: null,
              pending_return_color_quantities: null,
              pending_return_variant_quantities: null,
            })
            .eq('id', siRow.id)

          if (siUpdErr) {
            console.error('Delete store_inventory restore error:', siUpdErr)
            return res.status(500).json({ error: 'Failed to restore store inventory during delete' })
          }
        } else if (retQty > 0) {
          const price = num(order.selling_price)
          const ship = num(order.shipment_cost)
          const cost = num(order.cost_price)
          const pct = num(order.commission_percent)
          const gross = price * soldQty - ship
          const commission = Math.round(gross * pct / 100)
          const adminTake = gross - commission
          const profit = adminTake - cost * soldQty

          const { error: updErr } = await supabaseAdmin
            .from(TABLES.ORDERS)
            .update({
              order_returned: false,
              profit,
              admin_take: Math.max(0, adminTake),
              commission_amount: Math.max(0, commission),
              return_quantity: null,
              return_reason: null,
              return_size_quantities: null,
              return_color_quantities: null,
              return_variant_quantities: null,
              returned_at: null,
            })
            .eq('id', id)

          if (updErr) {
            console.error('Delete undo-return error:', updErr)
            return res.status(500).json({ error: 'Failed to undo return during delete' })
          }
        }
      }

      // 6. Restore warehouse inventory (Direct sales only: store_inventory_id is null)
      // Best-effort only: if the batch (or its product) was already deleted from the
      // warehouse, there's nothing left to restore stock into — that must NOT block
      // deleting this stale order record, so failures here are logged, not fatal.
      if (!order.store_inventory_id && soldQty > 0) {
        try {
          const normalizedVariants = normalizeVariantQuantities(order.variant_quantities)
          const variantRollups = rollupVariantQuantities(normalizedVariants)
          const effectiveSizeQty = variantRollups.sizeQuantities ?? normalizeFlatQuantities(order.size_quantities)
          const effectiveColorQty = variantRollups.colorQuantities ?? normalizeFlatQuantities(order.color_quantities)

          let invQuery = supabaseAdmin
            .from(TABLES.INVENTORY)
            .select('id, quantity_available, size_quantities, color_quantities, variant_quantities')
            .order('created_at', { ascending: true })

          if (order.product_id) {
            invQuery = invQuery.eq('product_id', order.product_id)
          } else {
            invQuery = invQuery.eq('product_name', order.product_name)
          }

          const { data: invRows, error: invErr } = await invQuery
          if (invErr) {
            console.warn('Delete warehouse lookup skipped (non-fatal):', invErr)
          } else if (invRows && invRows.length > 0) {
            const firstRow = invRows[0]
            const newInvSizes = mergeFlat(firstRow.size_quantities, effectiveSizeQty)
            const newInvColors = mergeFlat(firstRow.color_quantities, effectiveColorQty)
            const newInvVariants = mergeVariantQuantities(firstRow.variant_quantities, normalizedVariants)

            const { error: invUpdErr } = await supabaseAdmin
              .from(TABLES.INVENTORY)
              .update({
                quantity_available: num(firstRow.quantity_available) + soldQty,
                size_quantities: newInvSizes,
                color_quantities: newInvColors,
                variant_quantities: newInvVariants,
              })
              .eq('id', firstRow.id)

            if (invUpdErr) {
              console.warn('Delete warehouse restore skipped (non-fatal):', invUpdErr)
            }
          }
        } catch (restoreErr) {
          console.warn('Delete warehouse restore step failed (non-fatal):', restoreErr)
        }
      }

      // 7. Hard-delete the order
      const { error: delErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .delete()
        .eq('id', id)

      if (delErr) {
        console.error('Delete final error:', delErr)
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
