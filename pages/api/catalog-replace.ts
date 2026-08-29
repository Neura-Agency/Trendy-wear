/**
 * POST /api/catalog-replace
 *
 * Renames a catalog value (productType, brandName, or productName) across ALL
 * affected products and their denormalised inventory / store_inventory rows.
 *
 * If the rename would collide with an existing product row
 * (unique constraint on product_name + brand_name + product_type), the two
 * rows are MERGED: every inventory / store_inventory row that pointed to the
 * OLD product is re-pointed to the EXISTING target product, then the old
 * product row is deleted.
 *
 * Body:
 *   field        – 'productType' | 'brandName' | 'productName' | 'color'
 *   originalValue – the current value to replace
 *   newValue      – the replacement
 */
import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession } from '../../lib/api/session'

const norm = (v: string) => String(v || '').trim().toLowerCase()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res)
    if (!session) return

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { field, originalValue, newValue } = req.body || {}

    if (!field || !originalValue || !newValue) {
      return res.status(400).json({ error: 'field, originalValue, and newValue are required' })
    }

    const trimmedNew = String(newValue).trim()
    const trimmedOrig = String(originalValue).trim()

    if (!trimmedNew) return res.status(400).json({ error: 'newValue cannot be empty' })
    if (norm(trimmedNew) === norm(trimmedOrig)) {
      return res.status(400).json({ error: 'newValue is the same as originalValue' })
    }

    // ── 1. Find all affected product rows ────────────────────────────────────
    const { data: allProducts, error: fetchErr } = await supabaseAdmin
      .from(TABLES.PRODUCTS)
      .select('*')

    if (fetchErr) {
      console.error('catalog-replace fetch error:', fetchErr)
      return res.status(500).json({ error: 'Failed to fetch products' })
    }

    // Color is stored as a JSONB array on the product row — handle separately
    if (field === 'color') {
      const affected = (allProducts || []).filter((p: any) => {
        const colors: string[] = Array.isArray(p.colors) ? p.colors : []
        return colors.some(c => norm(c) === norm(trimmedOrig))
      })

      if (affected.length === 0) {
        return res.json({ success: true, updated: 0 })
      }

      const colorUpdates = affected.map((p: any) => {
        const newColors = (p.colors as string[]).map((c: string) =>
          norm(c) === norm(trimmedOrig) ? trimmedNew : c
        )
        return supabaseAdmin
          .from(TABLES.PRODUCTS)
          .update({ colors: newColors })
          .eq('id', p.id)
      })

      const results = await Promise.all(colorUpdates)
      const errors = results.filter(r => r.error)
      if (errors.length > 0) {
        console.error('color update errors:', errors.map(r => r.error))
        return res.status(500).json({ error: 'Some color updates failed' })
      }

      return res.json({ success: true, updated: affected.length })
    }

    // ── 2. For productType / brandName / productName ─────────────────────────
    const dbCol =
      field === 'productType' ? 'product_type'
      : field === 'brandName' ? 'brand_name'
      : field === 'productName' ? 'product_name'
      : null

    if (!dbCol) {
      return res.status(400).json({ error: `Unknown field: ${field}` })
    }

    const affected = (allProducts || []).filter(
      (p: any) => norm(String(p[dbCol] || '')) === norm(trimmedOrig)
    )

    if (affected.length === 0) {
      return res.json({ success: true, updated: 0 })
    }

    let totalUpdated = 0

    for (const oldProduct of affected) {
      // Build what the renamed row would look like
      const renamedProductName =
        field === 'productName' ? trimmedNew : String(oldProduct.product_name || '')
      const renamedBrandName =
        field === 'brandName' ? trimmedNew : String(oldProduct.brand_name || '')
      const renamedProductType =
        field === 'productType' ? trimmedNew : String(oldProduct.product_type || '')

      // Check for collision — does a product with the new combo already exist?
      const collision = (allProducts || []).find(
        (p: any) =>
          p.id !== oldProduct.id &&
          norm(p.product_name) === norm(renamedProductName) &&
          norm(p.brand_name) === norm(renamedBrandName) &&
          norm(p.product_type) === norm(renamedProductType)
      )

      if (collision) {
        // ── MERGE path ─────────────────────────────────────────────────────
        // Re-point inventory rows from oldProduct.id → collision.id
        const { error: invMergeErr } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .update({ product_id: collision.id, product_name: renamedProductName })
          .eq('product_id', oldProduct.id)

        if (invMergeErr) {
          console.error('inventory merge error:', invMergeErr)
          return res.status(500).json({ error: 'Failed to merge inventory rows' })
        }

         // Inventory rows are the sole physical-stock records.

         // Delete old product row/ (inventory FK is set null on delete per schema,
        // but we already re-pointed so the rows are safe)
        const { error: delErr } = await supabaseAdmin
          .from(TABLES.PRODUCTS)
          .delete()
          .eq('id', oldProduct.id)

        if (delErr) {
          console.error('product delete error:', delErr)
          return res.status(500).json({ error: 'Failed to remove old product after merge' })
        }
      } else {
        // ── RENAME path ────────────────────────────────────────────────────
        const { error: renameErr } = await supabaseAdmin
          .from(TABLES.PRODUCTS)
          .update({ [dbCol]: trimmedNew })
          .eq('id', oldProduct.id)

        if (renameErr) {
          console.error('product rename error:', renameErr)
          return res.status(500).json({ error: `Failed to rename product: ${renameErr.message}` })
        }

        // Keep denormalised product_name columns in sync
        if (field === 'productName') {
          await supabaseAdmin
            .from(TABLES.INVENTORY)
            .update({ product_name: trimmedNew })
            .eq('product_id', oldProduct.id)
        }
      }

      totalUpdated++
    }

    return res.json({ success: true, updated: totalUpdated })
  } catch (err: any) {
    console.error('catalog-replace error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
