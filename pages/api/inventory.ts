import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession, toUserPayload, isSuperAdmin } from '../../lib/api/session'
import { buildDeterministicProductId, findMatchingProduct, resolveCanonicalBrand } from '../../lib/catalog'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
}

const PRODUCT_IMAGES_BUCKET = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || 'Trendy Wear'

const mergeQuantities = (existingValue: any, incomingValue: any) => {
  const current = existingValue && typeof existingValue === 'object' && !Array.isArray(existingValue) ? existingValue : {}
  const incoming = incomingValue && typeof incomingValue === 'object' && !Array.isArray(incomingValue) ? incomingValue : {}
  const merged: Record<string, number> = { ...current }

  Object.entries(incoming).forEach(([key, value]) => {
    merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0)
  })

  return merged
}

const totalQuantityFrom = (value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
  return Object.values(value).reduce((sum: number, qty: any) => sum + (Number(qty) || 0), 0)
}

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function uploadProductImage(picture: string): Promise<string | null> {
  if (!picture || !picture.startsWith('data:image')) return null

  // Extract base64 data
  const base64Data = picture.split(',')[1]
  const mimeType = picture.split(';')[0].split(':')[1]
  const fileExt = mimeType.split('/')[1]

  // Convert base64 to buffer
  const buffer = Buffer.from(base64Data, 'base64')

  // Generate unique filename
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`

  // Upload to Supabase storage bucket
  const { error: uploadError } = await supabaseAdmin.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: false
    })

  if (uploadError) {
    throw new Error('Failed to upload image')
  }

  const { data: urlData } = supabaseAdmin.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(fileName)

  return urlData.publicUrl
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res)
    if (!session) return
    const user = toUserPayload(session)

    if (req.method === 'POST') {
      const {
        itemId,
        quantity,
        sizeQuantities,
        colorQuantities,
        pricePerPiece,
        picture,
        productId,
        newProduct
      } = req.body

      let finalProductId = productId
      let productImageUrl = null

      // Handle image upload if picture exists
      if (picture && picture.startsWith('data:image')) {
        try {
          productImageUrl = await uploadProductImage(picture)
        } catch (err) {
          console.error('Image processing error:', err)
          return res.status(500).json({ error: 'Failed to process image' })
        }
      }

      // If creating a new product
      if (newProduct) {
        const productName = String(newProduct.productName || '').trim()
        const brandName = String(newProduct.brandName || '').trim()
        const productType = newProduct.productType === 'Other'
          ? String(newProduct.customType || '').trim()
          : String(newProduct.productType || '').trim()

        if (!productName) {
          return res.status(400).json({ error: 'productName is required' })
        }
        if (!brandName) {
          return res.status(400).json({ error: 'brandName is required' })
        }
        if (!productType) {
          return res.status(400).json({ error: 'productType is required' })
        }

        const { data: existingProducts, error: existingProductsError } = await supabaseAdmin
          .from(TABLES.PRODUCTS)
          .select('*')

        if (existingProductsError) {
          console.error('Fetch products error:', existingProductsError)
          return res.status(500).json({ error: 'Failed to fetch products' })
        }

        const canonicalBrand = resolveCanonicalBrand(existingProducts || [], brandName)
        const existingProduct = findMatchingProduct(existingProducts || [], productName, canonicalBrand, productType)
  const productId = buildDeterministicProductId(productName, canonicalBrand, productType)

        let product
        let productError

        if (existingProduct?.id) {
          const result = await supabaseAdmin
            .from(TABLES.PRODUCTS)
            .update({
              product_name: productName,
              brand_name: canonicalBrand,
              product_type: productType,
              price_per_piece: pricePerPiece,
              colors: newProduct.colors || [],
              sizes: newProduct.sizes || [],
              product_image: productImageUrl
            })
            .eq('id', existingProduct.id)
            .select()
            .single()

          product = result.data
          productError = result.error
        } else {
          const result = await supabaseAdmin
            .from(TABLES.PRODUCTS)
            .insert({
              id: productId,
              product_name: productName,
              brand_name: canonicalBrand,
              product_type: productType,
              price_per_piece: pricePerPiece,
              colors: newProduct.colors || [],
              sizes: newProduct.sizes || [],
              product_image: productImageUrl
            })
            .select()
            .single()

          product = result.data
          productError = result.error
        }

        if (productError) {
          console.error('Product creation error:', productError)
          return res.status(500).json({ error: 'Failed to create product' })
        }

        finalProductId = product.id
      } else if (productImageUrl && finalProductId) {
        // Update existing product with new image
        await supabaseAdmin
          .from(TABLES.PRODUCTS)
          .update({ product_image: productImageUrl })
          .eq('id', finalProductId)
      }

      const totalQuantity = Math.max(0, num(quantity))

      const { data: existingInventory, error: inventoryLookupError } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .select('*')
        .eq('product_id', finalProductId)
        .maybeSingle()

      if (inventoryLookupError) {
        console.error('Inventory lookup error:', inventoryLookupError)
        return res.status(500).json({ error: 'Failed to fetch existing inventory' })
      }

      const nextSizeQuantities = mergeQuantities(existingInventory?.size_quantities, sizeQuantities)
      const nextColorQuantities = mergeQuantities(existingInventory?.color_quantities, colorQuantities)

      let inventoryItem
      let inventoryError

      if (existingInventory?.id) {
        const updatePayload: Record<string, any> = {
            batch_number: existingInventory.batch_number || itemId,
            cost_price: pricePerPiece,
            selling_price: Number(existingInventory.selling_price) || 0,
            quantity_available: (Number(existingInventory.quantity_available) || 0) + totalQuantity,
            owner: existingInventory.owner || user.username,
            low_stock_warning: Number(existingInventory.low_stock_warning) || 5
          }
          if (Object.keys(nextSizeQuantities).length) updatePayload.size_quantities = nextSizeQuantities
          if (Object.keys(nextColorQuantities).length) updatePayload.color_quantities = nextColorQuantities

        const result = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .update(updatePayload)
          .eq('id', existingInventory.id)
          .select()
          .single()

        inventoryItem = result.data
        inventoryError = result.error
      } else {
        const insertPayload: Record<string, any> = {
            product_id: finalProductId,
            batch_number: itemId,
            cost_price: pricePerPiece,
            selling_price: 0,
            quantity_available: totalQuantity,
            owner: user.username,
            low_stock_warning: 5
          }
          if (sizeQuantities && typeof sizeQuantities === 'object' && Object.keys(sizeQuantities).length) insertPayload.size_quantities = sizeQuantities
          if (colorQuantities && typeof colorQuantities === 'object' && Object.keys(colorQuantities).length) insertPayload.color_quantities = colorQuantities

        const result = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .insert(insertPayload)
          .select()
          .single()

        inventoryItem = result.data
        inventoryError = result.error
      }

      if (inventoryError) {
        console.error('Inventory creation error:', inventoryError)
        return res.status(500).json({ error: 'Failed to create inventory item' })
      }

      return res.json({
        success: true,
        inventory: inventoryItem,
        productId: finalProductId,
        imageUrl: productImageUrl
      })
    }

    if (req.method === 'GET') {
      // Fetch inventory items
      const { data: inventory, error } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .select(`
          *,
          products:product_id (
            id,
            product_name,
            brand_name,
            product_type,
            product_image,
            colors,
            sizes
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Fetch inventory error:', error)
        return res.status(500).json({ error: 'Failed to fetch inventory' })
      }

      const formattedInventory = (inventory || []).map((row: any) => {
        const p = row.products || {}
        // Item ID is ALWAYS derived from the product UUID — never from the stored batch_number.
        // This auto-corrects all old records (ITEM-6P2FOU etc.) without touching the DB.
        const productUuid: string = row.product_id ?? ''
        const derivedItemId = productUuid
          ? `ITEM-${productUuid.replace(/-/g, '').slice(0, 8).toUpperCase()}`
          : row.batch_number // fallback for orphaned rows with no product_id
        return {
          id: row.id,
          productId: row.product_id ?? null,
          productName: p.product_name ?? '',
          category: p.product_type ?? '',
          brand: p.brand_name ?? '',
          size: p.sizes ?? [],
          color: p.colors ?? [],
          sizeQuantities: row.size_quantities ?? null,
          colorQuantities: row.color_quantities ?? null,
          otherVariants: { picture: p.product_image ?? null },
          productImage: p.product_image ?? null,
          batchNumber: derivedItemId,
          costPrice: Number(row.cost_price) || 0,
          sellingPrice: Number(row.selling_price) || 0,
          quantityAvailable: Number(row.quantity_available) || 0,
          lowStockWarning: Number(row.low_stock_warning) || 5,
          owner: row.owner ?? undefined
        }
      })

      return res.json({ inventory: formattedInventory })
    }

    if (req.method === 'PATCH') {
      const { id, productId, fields } = req.body || {}

      if (!id) return res.status(400).json({ error: 'id is required' })
      if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'fields are required' })

      const inventoryFields = fields.inventory || {}
      const productFields = fields.product || {}
      const picture = fields.picture

      const inventoryUpdate: Record<string, any> = {}
      const productUpdate: Record<string, any> = {}

      const { data: currentInventory, error: currentInventoryError } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .select('id, size_quantities, color_quantities')
        .eq('id', id)
        .maybeSingle()

      if (currentInventoryError) {
        console.error('inventory lookup error:', currentInventoryError)
        return res.status(500).json({ error: 'Failed to lookup inventory' })
      }

      if (inventoryFields.batchNumber !== undefined) {
        const bn = String(inventoryFields.batchNumber).trim()
        if (!bn) return res.status(400).json({ error: 'batchNumber cannot be empty' })
        inventoryUpdate.batch_number = bn
      }
      if (inventoryFields.costPrice !== undefined) inventoryUpdate.cost_price = num(inventoryFields.costPrice)
      if (inventoryFields.sellingPrice !== undefined) inventoryUpdate.selling_price = num(inventoryFields.sellingPrice)
      if (inventoryFields.lowStockWarning !== undefined) {
        const warn = num(inventoryFields.lowStockWarning)
        if (warn < 0) return res.status(400).json({ error: 'lowStockWarning must be >= 0' })
        inventoryUpdate.low_stock_warning = warn
      }

      const rawSizeQuantities = inventoryFields.sizeQuantities
      if (rawSizeQuantities !== undefined) {
        if (rawSizeQuantities === null) {
          inventoryUpdate.size_quantities = null
        } else if (typeof rawSizeQuantities === 'object') {
          const normalized: Record<string, number> = {}
          Object.entries(rawSizeQuantities).forEach(([size, qty]) => {
            normalized[size] = Math.max(0, num(qty))
          })
          inventoryUpdate.size_quantities = normalized
        } else {
          return res.status(400).json({ error: 'sizeQuantities must be an object or null' })
        }
      }

      const rawColorQuantities = inventoryFields.colorQuantities
      if (rawColorQuantities !== undefined) {
        if (rawColorQuantities === null) {
          inventoryUpdate.color_quantities = null
        } else if (typeof rawColorQuantities === 'object') {
          const normalized: Record<string, number> = {}
          Object.entries(rawColorQuantities).forEach(([color, qty]) => {
            normalized[color] = Math.max(0, num(qty))
          })
          inventoryUpdate.color_quantities = normalized
        } else {
          return res.status(400).json({ error: 'colorQuantities must be an object or null' })
        }
      }

      if (inventoryFields.quantityAvailable !== undefined) {
        inventoryUpdate.quantity_available = Math.max(0, num(inventoryFields.quantityAvailable))
      }

      if (productFields.productName !== undefined) {
        const pn = String(productFields.productName).trim()
        if (!pn) return res.status(400).json({ error: 'productName cannot be empty' })
        productUpdate.product_name = pn
      }
      if (productFields.brandName !== undefined) {
        const bn = String(productFields.brandName).trim()
        productUpdate.brand_name = bn || null
      }
      if (productFields.productType !== undefined) {
        const pt = String(productFields.productType).trim()
        if (!pt) return res.status(400).json({ error: 'productType cannot be empty' })
        productUpdate.product_type = pt
      }
      if (productFields.colors !== undefined) {
        if (!Array.isArray(productFields.colors)) return res.status(400).json({ error: 'colors must be an array' })
        productUpdate.colors = productFields.colors
      }
      if (productFields.sizes !== undefined) {
        if (!Array.isArray(productFields.sizes)) return res.status(400).json({ error: 'sizes must be an array' })
        productUpdate.sizes = productFields.sizes
      }

      if (picture && typeof picture === 'string' && picture.startsWith('data:image')) {
        try {
          const uploadedUrl = await uploadProductImage(picture)
          if (uploadedUrl) productUpdate.product_image = uploadedUrl
        } catch (err) {
          console.error('Image processing error:', err)
          return res.status(500).json({ error: 'Failed to process image' })
        }
      }

      if (Object.keys(inventoryUpdate).length === 0 && Object.keys(productUpdate).length === 0) {
        return res.status(400).json({ error: 'no updatable fields provided' })
      }

      if (inventoryUpdate.quantity_available !== undefined) {
        const { data: assignedRows, error: assignedErr } = await supabaseAdmin
          .from(TABLES.STORE_INVENTORY)
          .select('quantity_assigned')
          .eq('inventory_id', id)

        if (assignedErr) {
          console.error('assigned sum error:', assignedErr)
          return res.status(500).json({ error: 'Failed to validate available quantity' })
        }

        const alreadyAssigned = (assignedRows || []).reduce((acc: number, r: any) => acc + num(r.quantity_assigned), 0)
        if (inventoryUpdate.quantity_available < alreadyAssigned) {
          return res.status(400).json({ error: `quantityAvailable cannot be below assigned total (${alreadyAssigned})` })
        }
      }

      let resolvedProductId: string | null = productId || null
      if (!resolvedProductId && Object.keys(productUpdate).length > 0) {
        const { data: invRow, error: invErr } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .select('product_id')
          .eq('id', id)
          .maybeSingle()
        if (invErr) {
          console.error('inventory lookup error:', invErr)
          return res.status(500).json({ error: 'Failed to lookup inventory' })
        }
        resolvedProductId = invRow?.product_id || null
      }

      let updatedInventory = null
      if (Object.keys(inventoryUpdate).length > 0) {
        const { data: updated, error: invUpdateErr } = await supabaseAdmin
          .from(TABLES.INVENTORY)
          .update(inventoryUpdate)
          .eq('id', id)
          .select()
          .maybeSingle()
        if (invUpdateErr) {
          console.error('inventory update error:', invUpdateErr)
          return res.status(500).json({ error: 'Failed to update inventory' })
        }
        updatedInventory = updated
      }

      let updatedProduct = null
      if (resolvedProductId && Object.keys(productUpdate).length > 0) {
        const { data: updated, error: prodUpdateErr } = await supabaseAdmin
          .from(TABLES.PRODUCTS)
          .update(productUpdate)
          .eq('id', resolvedProductId)
          .select()
          .maybeSingle()
        if (prodUpdateErr) {
          console.error('product update error:', prodUpdateErr)
          return res.status(500).json({ error: 'Failed to update product' })
        }
        updatedProduct = updated
      }

      return res.json({ success: true, inventory: updatedInventory, product: updatedProduct })
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}

      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Only super admins can delete inventory items' })
      }

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      const { error: storeInventoryError } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .delete()
        .eq('inventory_id', id)

      if (storeInventoryError) {
        console.error('store inventory delete error:', storeInventoryError)
        return res.status(500).json({ error: 'Failed to delete related store allocations' })
      }

      const { error: inventoryDeleteError } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .delete()
        .eq('id', id)

      if (inventoryDeleteError) {
        console.error('inventory delete error:', inventoryDeleteError)
        return res.status(500).json({ error: 'Failed to delete inventory item' })
      }

      return res.json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('API error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

