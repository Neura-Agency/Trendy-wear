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

      // ── Refund / replacement — transactional global inventory engine ────────
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

        const refundMethod = refundType === 'amount'
          ? 'amount'
          : refundType === 'replacement'
            ? 'replacement'
            : 'quantity';

        if (refundMethod === 'amount' && num(fixedAmount) <= 0) {
          return res.status(400).json({ error: 'fixedAmount must be greater than 0 when refundType is amount' });
        }

        if (refundMethod === 'replacement' && !String(replacementProductId || '').trim()) {
          return res.status(400).json({ error: 'replacementProductId is required when refundType is replacement' });
        }

        const normalizedRefundVariants = normalizeVariantQuantities(refundVariantQuantities);
        const normalizedReplacementVariants = normalizeVariantQuantities(replacementVariantQuantities);

        const { data, error } = await supabaseAdmin.rpc('process_global_refund', {
          p_payload: {
            engine_version: 2,
            order_id: id,
            refund_quantity: refundQuantity ?? null,
            refund_reason: refundReason || null,
            refund_type: refundMethod,
            fixed_amount: Math.max(0, num(fixedAmount)),
            replacement_item: typeof replacementItem === 'string' ? replacementItem.trim() : null,
            replacement_product_id: String(replacementProductId || '').trim() || null,
            replacement_quantity: Math.max(1, Math.floor(num(replacementQuantity)) || 1),
            replacement_size: replacementSize ? String(replacementSize).trim() : null,
            replacement_color: replacementColor ? String(replacementColor).trim() : null,
            replacement_variant_quantities: normalizedReplacementVariants,
            original_item_returned: refundMethod === 'replacement' ? Boolean(originalItemReturned) : null,
            refund_size_quantities: refundSizeQuantities || null,
            refund_color_quantities: refundColorQuantities || null,
            refund_variant_quantities: normalizedRefundVariants,
            refund_proof_url: refundProofUrl || null,
          },
        });

        if (error) {
          const message = error.message || 'Failed to process refund';
          if (message.includes('ORDER_NOT_FOUND')) return res.status(404).json({ error: 'Order not found' });
          if (message.includes('NO_REMAINING_UNITS')) return res.status(400).json({ error: 'No remaining units available to refund' });
          if (message.includes('REFUND_QUANTITY_MUST_BE_POSITIVE')) return res.status(400).json({ error: 'refundQuantity must be at least 1' });
          if (message.includes('FIXED_REFUND_AMOUNT_REQUIRED')) return res.status(400).json({ error: 'fixedAmount must be greater than 0 when refundType is amount' });
          if (message.includes('REPLACEMENT_PRODUCT_REQUIRED')) return res.status(400).json({ error: 'replacementProductId is required when refundType is replacement' });
          if (message.includes('INSUFFICIENT_GLOBAL_STOCK')) return res.status(409).json({ error: 'Insufficient global inventory for replacement' });
          return res.status(500).json({ error: message });
        }

        return res.json({
          success: true,
          refundAmount: data?.refund_amount ?? 0,
          ...(refundMethod === 'replacement'
            ? {
                replacementCostTotal: data?.replacement_cost_total ?? 0,
                replacementConsumedInventoryIds: data?.replacement_consumed_inventory_ids ?? [],
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

      // ── Undo Refund — reverse global replacement/refund movements atomically ──
      if (req.body?.isUndoRefund === true) {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { data, error } = await supabaseAdmin.rpc('undo_global_refund', {
          p_order_id: id,
          p_engine_version: 2,
        });

        if (error) {
          const message = error.message || 'Failed to undo refund';
          if (message.includes('ORDER_NOT_FOUND')) return res.status(404).json({ error: 'Order not found' });
          if (message.includes('NO_REFUND_TO_UNDO')) return res.status(400).json({ error: 'Order has no refund to undo' });
          if (message.includes('INSUFFICIENT_GLOBAL_STOCK')) return res.status(409).json({ error: 'Global inventory no longer has enough stock to undo this refund' });
          return res.status(500).json({ error: message });
        }

        return res.json({ success: true, restored: data?.restored ?? 0 });
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
