import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { getAllowedStoreIds, requireAdmin, requireSession } from '../../lib/api/session'
import {
  adjustVariantQuantities,
  normalizeFlatQuantities,
  normalizeVariantQuantities,
  rollupVariantQuantities,
  validateVariantRequest,
} from '../../lib/variantQuantities'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // returnToWarehouse is allowed for store managers (any logged-in user) — not just admins
    const isReturnAction = req.method === 'PATCH' && req.body?.action === 'returnToWarehouse'
    const session = (req.method === 'GET' || isReturnAction) ? await requireSession(req, res) : await requireAdmin(req, res)
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
          "extra_Qty",
          created_at,
          updated_at,
          stores:store_id ( name ),
          products:product_id ( product_name, sizes, colors ),
          size_quantities_assigned,
          size_quantities_remaining,
          color_quantities_assigned,
          color_quantities_remaining,
          variant_quantities_assigned,
          variant_quantities_remaining,
          pending_return_qty,
          pending_return_size_quantities,
          pending_return_color_quantities,
          pending_return_variant_quantities
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

        // Key by unique store_inventory id to avoid combining different lots
        const key = row.id || `${productName}_${row.inventory_id || ''}_${row.created_at}`
        storeInventory[storeName][key] = {
          id: row.id,
          productName,
          productId: row.product_id,
          sizes: Array.isArray(row.products?.sizes) ? row.products.sizes : [],
          colors: Array.isArray(row.products?.colors) ? row.products.colors : [],
          inventoryId: row.inventory_id,
          ownerSupplyPrice: num(row.owner_supply_price),
          commissionPercent: num(row.commission_percent),
          storeSellingPrice: num(row.store_selling_price),
          quantityAssigned: qtyAssigned,
          quantityRemaining: qtyRemaining,
          sizeQuantitiesAssigned: row.size_quantities_assigned ?? null,
          sizeQuantitiesRemaining: row.size_quantities_remaining ?? null,
          colorQuantitiesAssigned: row.color_quantities_assigned ?? null,
          colorQuantitiesRemaining: row.color_quantities_remaining ?? null,
          variantQuantitiesAssigned: row.variant_quantities_assigned ?? null,
          variantQuantitiesRemaining: row.variant_quantities_remaining ?? null,
          extraQty: num(row['extra_Qty'] ?? 0),
          pendingReturnQty: num(row.pending_return_qty ?? 0),
          pendingReturnSizeQuantities: row.pending_return_size_quantities ?? null,
          pendingReturnColorQuantities: row.pending_return_color_quantities ?? null,
          pendingReturnVariantQuantities: row.pending_return_variant_quantities ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at
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
      const { storeName, batchNumber, quantity, sizeQuantitiesAssigned, colorQuantitiesAssigned, variantQuantitiesAssigned, ownerSupplyPrice, commissionPercent, extraQty: rawExtra } = req.body || {}
      const extraQty = num(rawExtra)

      if (!storeName || !batchNumber) {
        return res.status(400).json({ error: 'storeName and batchNumber are required' })
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
        .select('id, product_id, quantity_available, size_quantities, color_quantities, variant_quantities, cost_price, products:product_id(product_name)')
        .eq('batch_number', String(batchNumber))
        .maybeSingle()

      if (invErr) {
        console.error('inventory lookup error:', invErr)
        return res.status(500).json({ error: 'Failed to lookup inventory batch' })
      }
      if (!inv) return res.status(404).json({ error: 'Inventory batch not found' })
      if (!inv.product_id) return res.status(400).json({ error: 'Inventory batch is missing product_id' })

      // Calculate total quantity from detailed variant allocations if provided
      let qty = num(quantity)
      const normalizedVariantsAssigned = normalizeVariantQuantities(variantQuantitiesAssigned)
      const variantRollups = rollupVariantQuantities(normalizedVariantsAssigned)
      const effectiveSizeQuantitiesAssigned = variantRollups.sizeQuantities ?? normalizeFlatQuantities(sizeQuantitiesAssigned)
      const effectiveColorQuantitiesAssigned = variantRollups.colorQuantities ?? normalizeFlatQuantities(colorQuantitiesAssigned)

      if (normalizedVariantsAssigned) {
        qty = variantRollups.total
      } else if (effectiveSizeQuantitiesAssigned) {
        qty = Object.values(effectiveSizeQuantitiesAssigned).reduce<number>(
          (sum, q) => sum + (Number(q) || 0),
          0
        )
      } else if (effectiveColorQuantitiesAssigned) {
        qty = Object.values(effectiveColorQuantitiesAssigned).reduce<number>(
          (sum, q) => sum + (Number(q) || 0),
          0
        )
      }

      // Validate quantity
      if (!qty || qty < 1) {
        return res.status(400).json({ error: 'quantity must be >= 1' })
      }

      const variantValidationError = validateVariantRequest(normalizedVariantsAssigned, inv.variant_quantities)
      if (variantValidationError) {
        return res.status(400).json({ error: variantValidationError })
      }

      // Validate size quantities against available inventory
      if (effectiveSizeQuantitiesAssigned && inv.size_quantities) {
        // Check each size
        for (const [size, requestedQty] of Object.entries(effectiveSizeQuantitiesAssigned)) {
          const availableQty = (inv.size_quantities as any)[size] || 0
          if (Number(requestedQty) > availableQty) {
            return res.status(400).json({ 
              error: `Size ${size}: requested ${requestedQty} exceeds available ${availableQty}` 
            })
          }
        }
      }

      if (effectiveColorQuantitiesAssigned && inv.color_quantities) {
        for (const [color, requestedQty] of Object.entries(effectiveColorQuantitiesAssigned)) {
          const availableQty = (inv.color_quantities as any)[color] || 0
          if (Number(requestedQty) > availableQty) {
            return res.status(400).json({
              error: `Color ${color}: requested ${requestedQty} exceeds available ${availableQty}`
            })
          }
        }
      }

      const normalizeBreakdown = (value: unknown) => {
        if (!value || typeof value !== 'object') return null
        const normalized: Record<string, number> = {}
        Object.entries(value as Record<string, unknown>).forEach(([key, qty]) => {
          normalized[key] = Math.max(0, num(qty))
        })
        return normalized
      }

      const total = num(inv.quantity_available)
      if (qty + extraQty > total) {
        return res.status(400).json({ error: `Quantity exceeds available stock (${total}) for this batch` })
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
          quantity_remaining: qty,
          size_quantities_assigned: normalizeBreakdown(effectiveSizeQuantitiesAssigned),
          size_quantities_remaining: normalizeBreakdown(effectiveSizeQuantitiesAssigned),
          color_quantities_assigned: normalizeBreakdown(effectiveColorQuantitiesAssigned),
          color_quantities_remaining: normalizeBreakdown(effectiveColorQuantitiesAssigned),
          variant_quantities_assigned: normalizedVariantsAssigned,
          variant_quantities_remaining: normalizedVariantsAssigned,
          'extra_Qty': extraQty || null
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error('storeInventory insert error:', insertErr)
        return res.status(500).json({ error: 'Failed to save allotment' })
      }

      // Deduct alloted quantity from warehouse inventory (regular + extra)
      const totalDeduction = qty + extraQty
      await supabaseAdmin
        .from(TABLES.INVENTORY)
        .update({ quantity_available: Math.max(0, total - totalDeduction) })
        .eq('id', inv.id)

      // Auto-create expense for gifted (extra) units
      if (extraQty > 0) {
        const costPrice = num((inv as any).cost_price)
        const productName = (inv as any).products?.product_name || 'Unknown'
        const expenseAmount = costPrice * extraQty
        if (expenseAmount > 0) {
          await supabaseAdmin
            .from(TABLES.EXPENSES)
            .insert({
              title: `Store Gift: ${productName} ×${extraQty} → ${storeName}`,
              amount: expenseAmount,
              category: 'Store Gift',
              expense_date: new Date().toISOString().slice(0, 10),
              notes: `Auto-recorded from allotment. Batch: ${batchNumber}`,
            })
        }
      }

      return res.status(201).json({ success: true, id: inserted?.id })
    }

    if (req.method === 'PATCH') {
      // ── Scenario B: Return pending stock back to warehouse ──────────────────
      if (req.body?.action === 'returnToWarehouse') {
        const { id, returnQty, returnSizeQuantities, returnColorQuantities, returnVariantQuantities } = req.body || {}
        if (!id) return res.status(400).json({ error: 'id is required' })
        const retQty = num(returnQty)
        if (retQty < 1) return res.status(400).json({ error: 'returnQty must be at least 1' })

        // Fetch the allotment row
        const { data: siRow, error: siFetchErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('id, inventory_id, quantity_remaining, size_quantities_remaining, color_quantities_remaining, variant_quantities_remaining, pending_return_qty, pending_return_size_quantities, pending_return_color_quantities, pending_return_variant_quantities')
          .eq('id', id)
          .single()

        if (siFetchErr || !siRow) return res.status(404).json({ error: 'Allotment not found' })

        const remainingQty = num(siRow.quantity_remaining) || 0
        if (retQty > remainingQty) {
          return res.status(400).json({ error: `Can only return up to ${remainingQty} piece(s) to warehouse` })
        }

        const normalizedReturnVariants = normalizeVariantQuantities(returnVariantQuantities)
        const returnVariantRollups = rollupVariantQuantities(normalizedReturnVariants)
        const effectiveReturnSizeQuantities = returnVariantRollups.sizeQuantities ?? normalizeFlatQuantities(returnSizeQuantities)
        const effectiveReturnColorQuantities = returnVariantRollups.colorQuantities ?? normalizeFlatQuantities(returnColorQuantities)

        // Rebuild pending & remaining size/color
        const newPendingSize = { ...(siRow.pending_return_size_quantities || {}) } as Record<string, number>
        const newSizeRem = { ...(siRow.size_quantities_remaining || {}) } as Record<string, number>
        if (effectiveReturnSizeQuantities) {
          Object.entries(effectiveReturnSizeQuantities).forEach(([size, qty]) => {
            newPendingSize[size] = Math.max(0, (newPendingSize[size] || 0) - num(qty))
            newSizeRem[size] = Math.max(0, (newSizeRem[size] || 0) - num(qty))
          })
        }

        const newPendingColor = { ...(siRow.pending_return_color_quantities || {}) } as Record<string, number>
        const newColorRem = { ...(siRow.color_quantities_remaining || {}) } as Record<string, number>
        if (effectiveReturnColorQuantities) {
          Object.entries(effectiveReturnColorQuantities).forEach(([color, qty]) => {
            newPendingColor[color] = Math.max(0, (newPendingColor[color] || 0) - num(qty))
            newColorRem[color] = Math.max(0, (newColorRem[color] || 0) - num(qty))
          })
        }

        const pendingQty = num(siRow.pending_return_qty) || 0

        // ── Validate pending return quantities before subtracting ──────────────
        if (retQty > pendingQty) {
          return res.status(400).json({ error: `Cannot return ${retQty} piece(s); only ${pendingQty} piece(s) are pending return from this store.` })
        }
        if (effectiveReturnSizeQuantities) {
          for (const [size, qty] of Object.entries(effectiveReturnSizeQuantities)) {
            const pendingSize = num((siRow.pending_return_size_quantities as any)?.[size] || 0)
            if (num(qty) > pendingSize) {
              return res.status(400).json({ error: `Size ${size}: cannot return ${qty}, only ${pendingSize} pending` })
            }
          }
        }
        if (effectiveReturnColorQuantities) {
          for (const [color, qty] of Object.entries(effectiveReturnColorQuantities)) {
            const pendingColor = num((siRow.pending_return_color_quantities as any)?.[color] || 0)
            if (num(qty) > pendingColor) {
              return res.status(400).json({ error: `Color ${color}: cannot return ${qty}, only ${pendingColor} pending` })
            }
          }
        }

        // Update store_inventory: deduct from quantity_remaining (items physically leave the store)
        // and deduct from pending_return_qty (tracking counter)
        // (no Math.max(0, ...) needed since we validated above)
        const { error: siUpdErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .update({
            quantity_remaining: num(siRow.quantity_remaining) - retQty,
            size_quantities_remaining: Object.keys(newSizeRem).length ? newSizeRem : null,
            color_quantities_remaining: Object.keys(newColorRem).length ? newColorRem : null,
            variant_quantities_remaining: adjustVariantQuantities(siRow.variant_quantities_remaining, normalizedReturnVariants, -1),
            pending_return_qty: pendingQty - retQty,
            pending_return_size_quantities: Object.values(newPendingSize).some(v => v > 0) ? newPendingSize : null,
            pending_return_color_quantities: Object.values(newPendingColor).some(v => v > 0) ? newPendingColor : null,
            pending_return_variant_quantities: adjustVariantQuantities(siRow.pending_return_variant_quantities, normalizedReturnVariants, -1),
          })
          .eq('id', id)

        if (siUpdErr) {
          console.error('returnToWarehouse store_inventory update error:', siUpdErr)
          return res.status(500).json({ error: 'Failed to update store inventory' })
        }

        // Restore warehouse inventory
        if (siRow.inventory_id) {
          const { data: invRow, error: invFetchErr } = await supabaseAdmin
            .from(TABLES.INVENTORY)
            .select('id, quantity_available, size_quantities, color_quantities, variant_quantities')
            .eq('id', siRow.inventory_id)
            .single()

          if (!invFetchErr && invRow) {
            const newInvSizes = { ...(invRow.size_quantities || {}) } as Record<string, number>
            if (effectiveReturnSizeQuantities) {
              Object.entries(effectiveReturnSizeQuantities).forEach(([size, qty]) => {
                newInvSizes[size] = (newInvSizes[size] || 0) + num(qty)
              })
            }
            const newInvColors = { ...(invRow.color_quantities || {}) } as Record<string, number>
            if (effectiveReturnColorQuantities) {
              Object.entries(effectiveReturnColorQuantities).forEach(([color, qty]) => {
                newInvColors[color] = (newInvColors[color] || 0) + num(qty)
              })
            }

            const { error: invUpdErr } = await supabaseAdmin
              .from(TABLES.INVENTORY)
              .update({
                quantity_available: num(invRow.quantity_available) + retQty,
                size_quantities: Object.keys(newInvSizes).length ? newInvSizes : invRow.size_quantities,
                color_quantities: Object.keys(newInvColors).length ? newInvColors : invRow.color_quantities,
                variant_quantities: adjustVariantQuantities(invRow.variant_quantities, normalizedReturnVariants, 1) ?? invRow.variant_quantities,
              })
              .eq('id', siRow.inventory_id)

            if (invUpdErr) console.error('returnToWarehouse inventory update error:', invUpdErr)
          }
        }

        return res.json({ success: true, returned: retQty })
      }

      // Update existing store_inventory row (admin only)
      const { id, fields } = req.body || {}

      if (!id) return res.status(400).json({ error: 'id is required' })
      if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'fields are required' })

      // Only allow updating specific fields
      const allowed: Record<string, any> = {}
      if (fields.owner_supply_price !== undefined) allowed.owner_supply_price = fields.owner_supply_price
      if (fields.commission_percent !== undefined) allowed.commission_percent = fields.commission_percent
      if (fields.store_selling_price !== undefined) allowed.store_selling_price = fields.store_selling_price
      if (fields.quantity_assigned !== undefined) {
        if (Number(fields.quantity_assigned) < 1) return res.status(400).json({ error: 'Quantity assigned must be at least 1' })

        // Validate that increasing assigned qty doesn't exceed batch availability.
        // Fetch current row to know inventory_id and current assigned qty
        const { data: existingRow, error: existingErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('id, inventory_id, quantity_assigned')
          .eq('id', id)
          .maybeSingle()

        if (existingErr) {
          console.error('storeInventory lookup error on patch:', existingErr)
          return res.status(500).json({ error: 'Failed to lookup allotment' })
        }
        if (!existingRow) return res.status(404).json({ error: 'Allotment not found' })

        // Sum assigned quantities for the same inventory batch excluding this row
        const { data: assignedRowsOther, error: assignedOtherErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('quantity_assigned')
          .eq('inventory_id', existingRow.inventory_id)
          .neq('id', existingRow.id)

        if (assignedOtherErr) {
          console.error('assigned sum error on patch:', assignedOtherErr)
          return res.status(500).json({ error: 'Failed to validate available quantity' })
        }

        const alreadyAssignedOther = (assignedRowsOther || []).reduce((acc: number, r: any) => acc + num(r.quantity_assigned), 0)

        // Fetch batch total available
        const { data: invRow, error: invRowErr } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .select('quantity_available')
          .eq('id', existingRow.inventory_id)
          .maybeSingle()

        if (invRowErr) {
          console.error('inventory lookup error on patch:', invRowErr)
          return res.status(500).json({ error: 'Failed to lookup inventory' })
        }
        if (!invRow) return res.status(404).json({ error: 'Inventory batch not found' })

        const total = num(invRow.quantity_available)
        const currentAssigned = num(existingRow.quantity_assigned)
        const strictRemaining = Math.max(0, total - alreadyAssignedOther - currentAssigned)
        const increaseDelta = Math.max(0, num(fields.quantity_assigned) - currentAssigned)

        if (increaseDelta > strictRemaining) {
          return res.status(400).json({ error: `Quantity increase (${increaseDelta}) exceeds remaining stock (${strictRemaining}) for this batch` })
        }

        allowed.quantity_assigned = fields.quantity_assigned
      }
      // Support updating size/color breakdowns
      if (fields.variant_quantities_assigned !== undefined) {
        const normalizedVariants = normalizeVariantQuantities(fields.variant_quantities_assigned)
        if (!normalizedVariants) return res.status(400).json({ error: 'variant_quantities_assigned must be a color-size object' })

        const { data: existingRowForVariants, error: existingErrForVariants } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('id, inventory_id, quantity_assigned, variant_quantities_assigned')
          .eq('id', id)
          .maybeSingle()

        if (existingErrForVariants) {
          console.error('storeInventory lookup error on patch (variants):', existingErrForVariants)
          return res.status(500).json({ error: 'Failed to lookup allotment for variants' })
        }
        if (!existingRowForVariants) return res.status(404).json({ error: 'Allotment not found' })

        const { data: invRowForVariants, error: invRowErrForVariants } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .select('variant_quantities, quantity_available')
          .eq('id', existingRowForVariants.inventory_id)
          .maybeSingle()

        if (invRowErrForVariants) {
          console.error('inventory lookup error on patch (variants):', invRowErrForVariants)
          return res.status(500).json({ error: 'Failed to lookup inventory for variants' })
        }
        if (!invRowForVariants) return res.status(404).json({ error: 'Inventory batch not found' })

        const validationError = validateVariantRequest(normalizedVariants, invRowForVariants.variant_quantities)
        if (validationError) return res.status(400).json({ error: validationError })

        const { data: assignedRowsOtherVariants, error: assignedOtherErrVariants } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('quantity_assigned, variant_quantities_assigned')
          .eq('inventory_id', existingRowForVariants.inventory_id)
          .neq('id', existingRowForVariants.id)

        if (assignedOtherErrVariants) {
          console.error('assigned sum error on patch (variants):', assignedOtherErrVariants)
          return res.status(500).json({ error: 'Failed to validate available quantity for variants' })
        }

        const batchVariantAvail = (invRowForVariants.variant_quantities || {}) as Record<string, Record<string, number>>
        const alreadyAssignedOtherVariants: Record<string, Record<string, number>> = {}
        ;(assignedRowsOtherVariants || []).forEach((row: any) => {
          const variants = normalizeVariantQuantities(row.variant_quantities_assigned) || {}
          Object.entries(variants).forEach(([color, sizes]) => {
            if (!alreadyAssignedOtherVariants[color]) alreadyAssignedOtherVariants[color] = {}
            Object.entries(sizes).forEach(([size, qty]) => {
              alreadyAssignedOtherVariants[color][size] = (alreadyAssignedOtherVariants[color][size] || 0) + num(qty)
            })
          })
        })

        for (const [color, sizes] of Object.entries(normalizedVariants)) {
          for (const [size, requested] of Object.entries(sizes)) {
            const available = num((batchVariantAvail as any)?.[color]?.[size])
            const alreadyOther = num((alreadyAssignedOtherVariants as any)?.[color]?.[size])
            if (requested + alreadyOther > available) {
              return res.status(400).json({ error: `Variant ${color}/${size}: requested ${requested} exceeds remaining ${Math.max(0, available - alreadyOther)}` })
            }
          }
        }

        const alreadyAssignedOtherTotal = (assignedRowsOtherVariants || []).reduce((acc: number, row: any) => acc + num(row.quantity_assigned), 0)
        const totalBatch = num((invRowForVariants as any).quantity_available)
        const currentAssigned = num(existingRowForVariants.quantity_assigned)
        const strictRemaining = Math.max(0, totalBatch - alreadyAssignedOtherTotal - currentAssigned)

        const rollups = rollupVariantQuantities(normalizedVariants)
        const increaseDelta = Math.max(0, rollups.total - currentAssigned)
        if (increaseDelta > strictRemaining) {
          return res.status(400).json({ error: `Quantity increase (${increaseDelta}) exceeds remaining stock (${strictRemaining}) for this batch` })
        }

        allowed.variant_quantities_assigned = normalizedVariants
        allowed.variant_quantities_remaining = normalizedVariants
        allowed.size_quantities_assigned = rollups.sizeQuantities
        allowed.size_quantities_remaining = rollups.sizeQuantities
        allowed.color_quantities_assigned = rollups.colorQuantities
        allowed.color_quantities_remaining = rollups.colorQuantities
        allowed.quantity_assigned = rollups.total
        allowed.quantity_remaining = rollups.total
      }

      if (fields.size_quantities_assigned !== undefined) {
        // Validate structure
        if (typeof fields.size_quantities_assigned !== 'object') return res.status(400).json({ error: 'size_quantities_assigned must be an object' })
        // Validate per-size increases do not exceed batch availability
        // Fetch existing row to know inventory_id and current assigned breakdown
        const { data: existingRowForSizes, error: existingErrForSizes } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('id, inventory_id, size_quantities_assigned')
          .eq('id', id)
          .maybeSingle()

        if (existingErrForSizes) {
          console.error('storeInventory lookup error on patch (sizes):', existingErrForSizes)
          return res.status(500).json({ error: 'Failed to lookup allotment for sizes' })
        }
        if (!existingRowForSizes) return res.status(404).json({ error: 'Allotment not found' })

        // Sum assigned sizes for other allotments of same inventory
        const { data: assignedRowsOtherSizes, error: assignedOtherErrSizes } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('size_quantities_assigned')
          .eq('inventory_id', existingRowForSizes.inventory_id)
          .neq('id', existingRowForSizes.id)

        if (assignedOtherErrSizes) {
          console.error('assigned sum error on patch (sizes):', assignedOtherErrSizes)
          return res.status(500).json({ error: 'Failed to validate available quantity for sizes' })
        }

        // Fetch inventory batch sizes availability
        const { data: invRowForSizes, error: invRowErrForSizes } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .select('size_quantities')
          .eq('id', existingRowForSizes.inventory_id)
          .maybeSingle()

        if (invRowErrForSizes) {
          console.error('inventory lookup error on patch (sizes):', invRowErrForSizes)
          return res.status(500).json({ error: 'Failed to lookup inventory for sizes' })
        }
        if (!invRowForSizes) return res.status(404).json({ error: 'Inventory batch not found' })

        const batchSizeAvail = invRowForSizes.size_quantities || {}

        // Compute already assigned for each size across other allotments
        const alreadyAssignedPerSize: Record<string, number> = {}
        ;(assignedRowsOtherSizes || []).forEach((r: any) => {
          const sj = r.size_quantities_assigned || {}
          Object.entries(sj).forEach(([k, v]) => { alreadyAssignedPerSize[k] = (alreadyAssignedPerSize[k] || 0) + (Number(v) || 0) })
        })

        // Now validate requested sizes
        for (const [size, requested] of Object.entries(fields.size_quantities_assigned)) {
          const avail = Number(batchSizeAvail[size] || 0)
          const already = Number(alreadyAssignedPerSize[size] || 0)
          if (Number(requested) + already > avail) {
            return res.status(400).json({ error: `Size ${size}: requested ${requested} exceeds available ${avail}` })
          }
        }

        allowed.size_quantities_assigned = fields.size_quantities_assigned
      }
      if (fields.color_quantities_assigned !== undefined) {
        if (typeof fields.color_quantities_assigned !== 'object') return res.status(400).json({ error: 'color_quantities_assigned must be an object' })

        const { data: existingRowForColors, error: existingErrForColors } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('id, inventory_id, color_quantities_assigned')
          .eq('id', id)
          .maybeSingle()

        if (existingErrForColors) {
          console.error('storeInventory lookup error on patch (colors):', existingErrForColors)
          return res.status(500).json({ error: 'Failed to lookup allotment for colors' })
        }
        if (!existingRowForColors) return res.status(404).json({ error: 'Allotment not found' })

        const { data: assignedRowsOtherColors, error: assignedOtherErrColors } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('color_quantities_assigned')
          .eq('inventory_id', existingRowForColors.inventory_id)
          .neq('id', existingRowForColors.id)

        if (assignedOtherErrColors) {
          console.error('assigned sum error on patch (colors):', assignedOtherErrColors)
          return res.status(500).json({ error: 'Failed to validate available quantity for colors' })
        }

        const { data: invRowForColors, error: invRowErrForColors } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .select('color_quantities')
          .eq('id', existingRowForColors.inventory_id)
          .maybeSingle()

        if (invRowErrForColors) {
          console.error('inventory lookup error on patch (colors):', invRowErrForColors)
          return res.status(500).json({ error: 'Failed to lookup inventory for colors' })
        }
        if (!invRowForColors) return res.status(404).json({ error: 'Inventory batch not found' })

        const batchColorAvail = invRowForColors.color_quantities || {}
        const alreadyAssignedPerColor: Record<string, number> = {}
        ;(assignedRowsOtherColors || []).forEach((r: any) => {
          const cj = r.color_quantities_assigned || {}
          Object.entries(cj).forEach(([k, v]) => { alreadyAssignedPerColor[k] = (alreadyAssignedPerColor[k] || 0) + (Number(v) || 0) })
        })

        for (const [color, requested] of Object.entries(fields.color_quantities_assigned)) {
          const avail = Number(batchColorAvail[color] || 0)
          const already = Number(alreadyAssignedPerColor[color] || 0)
          if (Number(requested) + already > avail) {
            return res.status(400).json({ error: `Color ${color}: requested ${requested} exceeds available ${avail}` })
          }
        }

        allowed.color_quantities_assigned = fields.color_quantities_assigned
      }
      if (fields.quantity_remaining !== undefined) {
        if (Number(fields.quantity_remaining) < 0) return res.status(400).json({ error: 'Quantity remaining cannot be negative' })
        allowed.quantity_remaining = fields.quantity_remaining
      }

      // Allow updating store by storeName (resolve to store_id)
      if (fields.storeName) {
        const { data: storeRow, error: storeErr } = await supabaseAdmin
          .from(TABLES.STORES)
          .select('id')
          .eq('name', String(fields.storeName))
          .maybeSingle()
        if (storeErr) {
          console.error('store lookup error on patch:', storeErr)
          return res.status(500).json({ error: 'Failed to lookup store' })
        }
        if (!storeRow) return res.status(404).json({ error: 'Store not found' })
        allowed.store_id = storeRow.id
      }

      if (Object.keys(allowed).length === 0) return res.status(400).json({ error: 'no updatable fields provided' })

      // Handle extra_Qty adjustments: adjust inventory.quantity_available and record expense when increasing
      if (fields.extra_Qty !== undefined) {
        const newExtra = num(fields.extra_Qty)

        const { data: existingRowFull, error: existingRowFullErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('id, inventory_id, "extra_Qty"')
          .eq('id', id)
          .maybeSingle()

        if (existingRowFullErr) {
          console.error('storeInventory lookup error on patch (extra):', existingRowFullErr)
          return res.status(500).json({ error: 'Failed to lookup allotment for extra_Qty' })
        }
        if (!existingRowFull) return res.status(404).json({ error: 'Allotment not found' })

        const currentExtra = num((existingRowFull as any)['extra_Qty'] || 0)
        const delta = newExtra - currentExtra
        if (delta !== 0 && existingRowFull.inventory_id) {
          const { data: invRow, error: invRowErr } = await supabaseAdmin
            .from(TABLES.INVENTORY)
            .select('quantity_available, cost_price, products:product_id(product_name)')
            .eq('id', existingRowFull.inventory_id)
            .maybeSingle()

          if (invRowErr) {
            console.error('inventory lookup error on patch (extra):', invRowErr)
            return res.status(500).json({ error: 'Failed to lookup inventory for extra_Qty' })
          }
          if (!invRow) return res.status(404).json({ error: 'Inventory batch not found' })

          const availableNow = num(invRow.quantity_available)
          if (delta > 0) {
            if (delta > availableNow) return res.status(400).json({ error: `Not enough warehouse stock to increase extra_Qty by ${delta}` })

            // Deduct from warehouse
            await supabaseAdmin
              .from(TABLES.INVENTORY)
              .update({ quantity_available: availableNow - delta })
              .eq('id', existingRowFull.inventory_id)

            // Create expense for gifted units
            const costPrice = num((invRow as any).cost_price)
            const productName = (invRow as any).products?.product_name || 'Unknown'
            const expenseAmount = costPrice * delta
            if (expenseAmount > 0) {
              await supabaseAdmin
                .from(TABLES.EXPENSES)
                .insert({
                  title: `Store Gift: ${productName} ×${delta} (edit)`,
                  amount: expenseAmount,
                  category: 'Store Gift',
                  expense_date: new Date().toISOString().slice(0, 10),
                  notes: `Auto-recorded from allotment edit. Allotment: ${id}`,
                })
            }
          } else if (delta < 0) {
            // Return surplus back to warehouse
            await supabaseAdmin
              .from(TABLES.INVENTORY)
              .update({ quantity_available: availableNow + Math.abs(delta) })
              .eq('id', existingRowFull.inventory_id)
          }
        }

        allowed['extra_Qty'] = newExtra || null
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .update(allowed)
        .eq('id', id)
        .select()
        .maybeSingle()

      if (updateErr) {
        console.error('storeInventory update error:', updateErr)
        return res.status(500).json({ error: 'Failed to update allotment' })
      }

      return res.json({ success: true, updated })
    }

    if (req.method === 'DELETE') {
      // id of the store_inventory row to remove
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })

      // Fetch the row so we know how many unsold pieces to return to warehouse
      const { data: row, error: fetchErr } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .select('id, inventory_id, quantity_remaining')
        .eq('id', id)
        .maybeSingle()

      if (fetchErr || !row) {
        return res.status(404).json({ error: 'Allotment not found' })
      }

      const unsold = Number(row.quantity_remaining) || 0

      // Return unsold pieces to warehouse inventory
      if (unsold > 0 && row.inventory_id) {
        const { data: invRow, error: invFetchErr } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .select('quantity_available')
          .eq('id', row.inventory_id)
          .maybeSingle()

        if (!invFetchErr && invRow) {
          const newQty = (Number(invRow.quantity_available) || 0) + unsold
          await supabaseAdmin
            .from(TABLES.INVENTORY)
            .update({ quantity_available: newQty })
            .eq('id', row.inventory_id)
        }
      }

      // Delete the store_inventory row
      const { error: deleteErr } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .delete()
        .eq('id', id)

      if (deleteErr) {
        console.error('storeInventory delete error:', deleteErr)
        return res.status(500).json({ error: 'Failed to delete allotment' })
      }

      return res.json({ success: true, returned: unsold })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('storeInventory API error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}
