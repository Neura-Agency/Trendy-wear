import 'dotenv/config'
import { supabaseAdmin, TABLES } from '../lib/supabase'
import { rollupVariantQuantities, VariantQuantities } from '../lib/variantQuantities'

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function backfillVariantQuantities(row: any): VariantQuantities | null {
  const colors = row.color_quantities && typeof row.color_quantities === 'object' ? row.color_quantities : {}
  const sizes = row.size_quantities && typeof row.size_quantities === 'object' ? row.size_quantities : {}
  const colorKeys = Object.keys(colors)
  const sizeKeys = Object.keys(sizes)

  if (!colorKeys.length || !sizeKeys.length) return null

  const variants: VariantQuantities = {}
  colorKeys.forEach((color) => {
    const colorQty = num(colors[color])
    const base = Math.floor(colorQty / sizeKeys.length)
    let remainder = colorQty - base * sizeKeys.length
    variants[color] = {}
    sizeKeys.forEach((size) => {
      variants[color][size] = base + (remainder > 0 ? 1 : 0)
      remainder -= 1
    })
  })

  return variants
}

async function run() {
  const { data: rows, error } = await supabaseAdmin
    .from(TABLES.INVENTORY)
    .select('id, size_quantities, color_quantities, variant_quantities, other_variants')
    .is('variant_quantities', null)

  if (error) throw error

  let updated = 0
  for (const row of rows || []) {
    const variants = backfillVariantQuantities(row)
    if (!variants) continue
    const rollups = rollupVariantQuantities(variants)

    const { error: updateError } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .update({
        variant_quantities: variants,
        size_quantities: rollups.sizeQuantities,
        color_quantities: rollups.colorQuantities,
        other_variants: {
          ...(row.other_variants && typeof row.other_variants === 'object' ? row.other_variants : {}),
          needs_variant_review: true,
          variant_review_note: 'Backfilled by even color-to-size distribution. Please verify exact color-size counts.',
        },
      })
      .eq('id', row.id)

    if (updateError) throw updateError
    updated += 1
  }

  console.log(`Backfilled ${updated} inventory row(s).`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
