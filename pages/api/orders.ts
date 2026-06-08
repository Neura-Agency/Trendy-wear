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
        if (!store) return res.status(404).json({ error: 'Store not found' })
        storeId = store.id
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
            order_code: generateOrderCode(),
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
      const { data: order, error: orderErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .insert({
          order_code: generateOrderCode(),
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

      // ── Decrement quantity_remaining across rows FIFO (sold + bonus) ────
      let remaining = totalDispatch
      let remainingVariants = normalizedOrderVariants
      for (const row of rows) {
        if (remaining <= 0) break
        const rowQty = num((row as any).quantity_remaining)
        const deduct = Math.min(rowQty, remaining)
        
        const updatePayload: Record<string, any> = { quantity_remaining: rowQty - deduct }
        if (remainingVariants) {
          const validationError = validateVariantRequest(remainingVariants, (row as any).variant_quantities_remaining)
          if (!validationError) {
            const nextVariants = adjustVariantQuantities((row as any).variant_quantities_remaining, remainingVariants, -1)
            const rollups = rollupVariantQuantities(nextVariants)
            updatePayload.variant_quantities_remaining = nextVariants
            updatePayload.size_quantities_remaining = rollups.sizeQuantities
            updatePayload.color_quantities_remaining = rollups.colorQuantities
            remainingVariants = null
          }
        }
        const { error: updErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .update(updatePayload)
          .eq('id', (row as any).id)
        if (updErr) console.error('stock decrement error:', updErr)
        remaining -= deduct
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
        const remainingProfit = remainingGross - (num(order.cost_price) * remainingUnits)

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
          .select('id, quantity, size_quantities, color_quantities, variant_quantities, return_quantity, return_variant_quantities, refund_quantity, refund_size_quantities, refund_color_quantities, refund_variant_quantities, commission_percent, selling_price, shipment_cost, cost_price')
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

        // Refund amount = selling_price x refunded units
        const refundAmount = num(order.selling_price) * refQty;

        // Remaining revenue = non-returned, non-refunded units only
        // Cost stays for ALL original units (refunded items still cost us money)
        const remainingUnits = Math.max(0, originalQty - alreadyReturnedQty - newRefundQty);
        const remainingGross = num(order.selling_price) * remainingUnits - num(order.shipment_cost);
        // Commission clawed back on refunded units (Option A)
        const remainingCommission = Math.round(remainingGross * num(order.commission_percent)) / 100;
        const remainingAdminTake = remainingGross - remainingCommission;
        // Full original cost absorbed
        const remainingProfit = remainingAdminTake - (num(order.cost_price) * originalQty);

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

        // NO inventory restoration — customer keeps the item
        return res.json({ success: true, refundAmount });
      }

      // ── Undo Return ─────────────────────────────────────────────────────────
      if (req.body?.isUndoReturn === true) {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { data: order, error: fetchErr } = await supabaseAdmin
          .from(TABLES.ORDERS)
          .select('id, quantity, selling_price, shipment_cost, cost_price, commission_percent, store_inventory_id, order_returned, return_quantity, return_size_quantities, return_color_quantities, return_variant_quantities')
          .eq('id', id)
          .single();

        if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });
        if (!order.order_returned) return res.status(400).json({ error: 'Order is not marked as returned' });

        // Recalculate original financials
        const qty = num(order.quantity);
        const price = num(order.selling_price);
        const ship = num(order.shipment_cost);
        const cost = num(order.cost_price);
        const pct = num(order.commission_percent);
        const gross = price * qty - ship;
        const commission = Math.round(gross * pct / 100);
        const adminTake = gross - commission;
        const profit = gross - cost * qty;

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
        const profit = gross - cost * remainingUnits;

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
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .select('selling_price, quantity, shipment_cost, cost_price, stores:store_id(name)')
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
