import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import globalSaleHandler from './global-sale'
import { requireSession, getAllowedStoreIds, isSuperAdmin } from '../../lib/api/session'
import {
  adjustVariantQuantities,
  mergeVariantQuantities,
  normalizeFlatQuantities,
  normalizeVariantQuantities,
  rollupVariantQuantities,
  validateVariantRequest,
  type VariantQuantities,
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

/**
 * Deduct stock for the replacement item across store_inventory rows FIFO (oldest first),
 * mirroring the sale-deduction loop. The consumed store_inventory rows are selected
 * automatically by FIFO — never by a user-picked batch.
 * Returns consumed row ids and the replacement COGS (sum of owner_supply_price × qty),
 * matching the sale branch's cost basis.
 */
async function deductGlobalInventoryFIFO(
  productId: string,
  variants: VariantQuantities | null,
  qty: number,
): Promise<{ consumedIds: string[]; replacementCostTotal: number } | { error: string }> {
  const { data: rows, error } = await supabaseAdmin
    .from(TABLES.INVENTORY)
    .select('id, cost_price, quantity_available, variant_quantities')
    .eq('product_id', productId)
    .gt('quantity_available', 0)
    .order('created_at', { ascending: true });

  if (error) return { error: error.message };

  const avail = (rows || []).filter((r: any) => num(r.quantity_available) > 0);
  const totalAvailable = avail.reduce((s: number, r: any) => s + num(r.quantity_available), 0);
  if (totalAvailable < qty) {
    return { error: `Insufficient global stock for replacement. Only ${totalAvailable} unit(s) available (need ${qty}).` };
  }

  let remaining = qty;
  const consumedIds: string[] = [];
  let replacementCostTotal = 0;

  for (const row of avail) {
    if (remaining <= 0) break;
    const take = Math.min(num(row.quantity_available), remaining);
    const { error: updErr } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .update({ quantity_available: num(row.quantity_available) - take })
      .eq('id', row.id)
      .gte('quantity_available', take);

    if (updErr) return { error: updErr.message };
    replacementCostTotal += num(row.cost_price) * take;
    consumedIds.push(row.id);
    remaining -= take;
  }

  if (remaining > 0) return { error: 'Insufficient global stock for replacement after concurrency check.' };
  return { consumedIds, replacementCostTotal };
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
          inventory_id,
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
          refund_type,
          replacement_item,
          replacement_product_id,
          replacement_quantity,
          replacement_size,
          replacement_color,
          original_item_returned,
          refund_reason,
          refund_size_quantities,
          refund_color_quantities,
          refund_variant_quantities,
          refunded_at,
          return_proof_url,
          refund_proof_url,
          created_at,
          stores:store_id ( name ),
          inventory:inventory_id (
            cost_price,
            batch_number
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
        // Global sales link directly to the primary inventory batch. Legacy orders
        // may still use store_inventory_id, so retain the stored cost fallback.
        const inventoryCostPrice = row.inventory?.cost_price
        const costPrice = inventoryCostPrice != null
          ? num(inventoryCostPrice)
          : num(row.cost_price)

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
          batchNumber: row.inventory?.batch_number ?? null,
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
          refundType: row.refund_type ?? 'quantity',
          replacementItem: row.replacement_item ?? null,
          replacementProductId: row.replacement_product_id ?? null,
          replacementQuantity: row.replacement_quantity ?? null,
          replacementSize: row.replacement_size ?? null,
          replacementColor: row.replacement_color ?? null,
          originalItemReturned: row.original_item_returned ?? null,
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
      // All new sales use the transactional global inventory engine. The legacy
      // implementation remains below only during the staged retirement window.
      return globalSaleHandler(req, res);
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

      // ── Mark order as returned — global inventory ───────────────────────────
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

        const { data, error } = await supabaseAdmin.rpc('process_global_order_return', {
          p_payload: {
            order_id: id,
            return_quantity: returnQuantity ?? null,
            return_reason: returnReason || null,
            return_size_quantities: returnSizeQuantities || null,
            return_color_quantities: returnColorQuantities || null,
            return_variant_quantities: returnVariantQuantities || null,
            return_proof_url: returnProofUrl || null,
          },
        });

        if (error) {
          const message = error.message || 'Failed to process return';
          if (message.includes('ORDER_NOT_FOUND')) return res.status(404).json({ error: 'Order not found' });
          if (message.includes('RETURN_QUANTITY_MUST_BE_POSITIVE')) return res.status(400).json({ error: 'returnQuantity must be at least 1' });
          if (message.includes('RETURN_EXCEEDS_SOLD_ALLOCATION')) return res.status(400).json({ error: 'Return quantity exceeds the inventory consumed by this order' });
          return res.status(500).json({ error: message });
        }

        return res.json({ success: true, returned: data?.returned ?? null });
      }

      // ── Refund ──────────────────────────────────────────────────────────────
      // Customer KEEPS the item. No inventory restored. Full cost of goods is absorbed as loss.
      // Commission is clawed back on refunded units (Option A).
      if (req.body?.isRefund === true) {
        const {
          id,
          refundQuantity,
          refundReason,
          refundType,
          fixedAmount,
          replacementItem,
          replacementProductId,
          replacementQuantity,
          replacementSize,
          replacementColor,
          replacementVariantQuantities,
          originalItemReturned,
          refundSizeQuantities,
          refundColorQuantities,
          refundVariantQuantities,
          refundProofUrl,
        } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const refundMethod = refundType === 'amount' ? 'amount' : refundType === 'replacement' ? 'replacement' : 'quantity';
        const normalizedFixedAmount = Math.max(0, num(fixedAmount));
        const normalizedReplacement = typeof replacementItem === 'string' ? replacementItem.trim() : '';
        const normalizedReplacementProductId = String(replacementProductId || '').trim();
        const normalizedReplacementQty = Math.max(1, Math.floor(num(replacementQuantity)) || 1);
        const normalizedReplacementSize = refundMethod === 'replacement' && replacementSize ? String(replacementSize).trim() : null;
        const normalizedReplacementColor = refundMethod === 'replacement' && replacementColor ? String(replacementColor).trim() : null;
        const normalizedOriginalReturned = refundMethod === 'replacement' ? Boolean(originalItemReturned) : null;

        if (refundMethod === 'amount' && normalizedFixedAmount <= 0) {
          return res.status(400).json({ error: 'fixedAmount must be greater than 0 when refundType is amount' });
        }
        if (refundMethod === 'replacement') {
          if (!normalizedReplacementProductId) {
            return res.status(400).json({ error: 'replacementProductId is required when refundType is replacement' });
          }
          if (!normalizedReplacement || !normalizedReplacementProductId) {
            return res.status(400).json({ error: 'A real replacement product must be selected when refundType is replacement' });
          }
        }

        const { data: order, error: fetchErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .select('id, quantity, store_id, size_quantities, color_quantities, variant_quantities, return_quantity, return_variant_quantities, refund_quantity, refund_size_quantities, refund_color_quantities, refund_variant_quantities, commission_percent, selling_price, shipment_cost, cost_price, store_inventory_id, refund_amount')
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

        const refundAmount = refundMethod === 'amount'
          ? (num(order.refund_amount) || 0) + normalizedFixedAmount
          : refundMethod === 'replacement'
            ? 0
            : num(order.selling_price) * newRefundQty;

        const resolvedRefundReason = refundMethod === 'replacement'
          ? `Replacement: ${normalizedReplacement}`
          : refundMethod === 'amount'
            ? `${refundReason || 'Other'} — Fixed amount refund`
            : refundReason || null;

        // ── Replacement inventory handling ──────────────────────────────────
        let replacementCostTotal = 0
        let replacementConsumedInventoryIds: string[] = []
        if (refundMethod === 'replacement') {
          // Build the replacement variant request from the selected product/variant.
          // Product/variant identity is the source of truth; FIFO picks the batches.
          const suppliedReplacementVariants = normalizeVariantQuantities(replacementVariantQuantities)
          const replacementVariants: VariantQuantities | null =
            suppliedReplacementVariants ||
            (normalizedReplacementColor && normalizedReplacementSize
              ? { [normalizedReplacementColor]: { [normalizedReplacementSize]: normalizedReplacementQty } }
              : null)

          const deduction = await deductGlobalInventoryFIFO(
            normalizedReplacementProductId,
            replacementVariants,
            normalizedReplacementQty,
          )
          if ('error' in deduction) {
            return res.status(400).json({ error: deduction.error })
          }
          replacementCostTotal = deduction.replacementCostTotal
          replacementConsumedInventoryIds = deduction.consumedIds

          // Scenario A: the original item physically came back. Restock it into
          // the same global inventory batches represented by this order's allocations.
          if (normalizedOriginalReturned) {
            const { error: restockError } = await supabaseAdmin.rpc('restock_order_original_for_replacement', {
              p_order_id: order.id,
              p_quantity: refQty,
            })
            if (restockError) {
              return res.status(409).json({ error: restockError.message || 'Failed to restock returned replacement item' })
            }
          }


          }
        }


        // ── Revenue & profit calculation per refund method ──────────────────
        //
        // 'quantity': Customer keeps the item. No physical return.
        //   Revenue kept  = sellingPrice × (originalQty - returnedQty - refundedQty)
        //   COGS absorbed = costPrice × (originalQty - returnedQty)  ← all un-returned units lost
        //
        // 'amount': Customer keeps ALL items. Partial cash paid back.
        //   Revenue kept  = sellingPrice × (originalQty - returnedQty) - fixedRefundAmount
        //   COGS absorbed = costPrice × (originalQty - returnedQty)  ← customer still has all items
        //
        // 'replacement' Scenario A (original returned): No cash out, replacement sent.
        //   Revenue kept  = sellingPrice × (originalQty - returnedQty)  ← full sale revenue kept
        //   COGS absorbed = costPrice × still-lost-originals + replacementCostTotal
        //
        // 'replacement' Scenario B (original kept): No cash out, replacement sent.
        //   Revenue kept  = sellingPrice × (originalQty - returnedQty)  ← full sale revenue kept
        //   COGS absorbed = costPrice × (originalQty - returnedQty) + replacementCostTotal

        const chargeableUnits = Math.max(0, originalQty - alreadyReturnedQty); // units that generated revenue

        let remainingGross: number;
        if (refundMethod === 'amount') {
          // Revenue = full sale revenue minus the fixed cash returned
          remainingGross = num(order.selling_price) * chargeableUnits - num(order.shipment_cost) - normalizedFixedAmount;
        } else if (refundMethod === 'replacement') {
          // Revenue = full sale revenue (customer paid in full, no cash returned)
          remainingGross = num(order.selling_price) * chargeableUnits - num(order.shipment_cost);
        } else {
          // 'quantity': revenue reduced by refunded units × selling price
          const remainingUnitsQty = Math.max(0, chargeableUnits - newRefundQty);
          remainingGross = num(order.selling_price) * remainingUnitsQty - num(order.shipment_cost);
        }

        // Commission clawed back proportionally based on retained gross
        const remainingCommission = Math.round(remainingGross * num(order.commission_percent)) / 100;
        const remainingAdminTake = remainingGross - remainingCommission;

        // COGS: absorb cost only for units actually lost (not returned to warehouse)
        // - 'quantity'/'amount': all chargeable units stay with customer → full COGS absorbed
        // - 'replacement' Scenario A: original came back → only still-lost units absorbed
        // - 'replacement' Scenario B: original kept → full chargeable COGS + replacement COGS
        let lostOriginalUnits = chargeableUnits;
        if (refundMethod === 'replacement' && normalizedOriginalReturned) {
          // Original items were returned; only un-returned originals remain as lost
          lostOriginalUnits = Math.max(0, chargeableUnits - newRefundQty);
        }
        const remainingProfit = remainingAdminTake - (num(order.cost_price) * lostOriginalUnits) - replacementCostTotal;

        const { error: updErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .update({
            profit: remainingProfit,
            admin_take: Math.max(0, remainingAdminTake),
            commission_amount: Math.max(0, remainingCommission),
            refund_quantity: newRefundQty,
            refund_amount: refundAmount,
            refund_type: refundMethod,
            replacement_item: refundMethod === 'replacement' ? normalizedReplacement : null,
            replacement_product_id: refundMethod === 'replacement' ? normalizedReplacementProductId : null,
            replacement_quantity: refundMethod === 'replacement' ? normalizedReplacementQty : null,
            replacement_size: normalizedReplacementSize,
            replacement_color: normalizedReplacementColor,
            original_item_returned: refundMethod === 'replacement' ? normalizedOriginalReturned : null,
            refund_reason: resolvedRefundReason || null,
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
        // Skip for replacement Scenario A: the original WAS returned and re-stocked above.
        if (order.store_inventory_id && !(refundMethod === 'replacement' && normalizedOriginalReturned)) {
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
        return res.json({
          success: true,
          refundAmount,
          ...(refundMethod === 'replacement'
            ? {
                replacementCostTotal,
                replacementConsumedInventoryIds,
              }
            : {}),
        });
      }

      // ── Undo Return — reverse the exact global batch movements ───────────────
      if (req.body?.isUndoReturn === true) {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { data, error } = await supabaseAdmin.rpc('undo_global_order_return', {
          p_order_id: id,
        });

        if (error) {
          const message = error.message || 'Failed to undo return';
          if (message.includes('ORDER_NOT_FOUND')) return res.status(404).json({ error: 'Order not found' });
          if (message.includes('ORDER_HAS_NO_RETURN')) return res.status(400).json({ error: 'Order has no return to undo' });
          if (message.includes('UNDO_RETURN_INSUFFICIENT_GLOBAL_STOCK')) {
            return res.status(409).json({ error: 'Global inventory no longer has enough stock to undo this return' });
          }
          return res.status(500).json({ error: message });
        }

        return res.json({ success: true, undone: data?.undone ?? null });
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
            refund_type: null,
            replacement_item: null,
            replacement_product_id: null,
            replacement_quantity: null,
            replacement_size: null,
            replacement_color: null,
            original_item_returned: null,
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
            refund_type: null,
            replacement_item: null,
            replacement_product_id: null,
            replacement_quantity: null,
            replacement_size: null,
            replacement_color: null,
            original_item_returned: null,
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
