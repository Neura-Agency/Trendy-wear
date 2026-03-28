import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession, toUserPayload } from '../../lib/api/session'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
}

const PRODUCT_IMAGES_BUCKET = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || 'Trendy Wear'

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
          // Extract base64 data
          const base64Data = picture.split(',')[1]
          const mimeType = picture.split(';')[0].split(':')[1]
          const fileExt = mimeType.split('/')[1]
          
          // Convert base64 to buffer
          const buffer = Buffer.from(base64Data, 'base64')
          
          // Generate unique filename
          const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`
          
          // Upload to Supabase storage bucket "Trendy Wear"
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from(PRODUCT_IMAGES_BUCKET)
            .upload(fileName, buffer, {
              contentType: mimeType,
              upsert: false
            })

          if (uploadError) {
            console.error('Upload error:', uploadError)
            return res.status(500).json({ error: 'Failed to upload image' })
          }

          // Get public URL
          const { data: urlData } = supabaseAdmin.storage
            .from(PRODUCT_IMAGES_BUCKET)
            .getPublicUrl(fileName)
          
          productImageUrl = urlData.publicUrl
        } catch (err) {
          console.error('Image processing error:', err)
          return res.status(500).json({ error: 'Failed to process image' })
        }
      }

      // If creating a new product
      if (newProduct) {
        const { data: product, error: productError } = await supabaseAdmin
          .from(TABLES.PRODUCTS)
          .insert({
            product_name: newProduct.productName,
            brand_name: newProduct.brandName || null,
            product_type: newProduct.productType,
            price_per_piece: pricePerPiece,
            colors: newProduct.colors || [],
            sizes: newProduct.sizes || [],
            product_image: productImageUrl
          })
          .select()
          .single()

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

      // Calculate total quantity from size quantities if provided
      let totalQuantity = quantity
      if (sizeQuantities && typeof sizeQuantities === 'object') {
        totalQuantity = Object.values(sizeQuantities).reduce((sum: number, qty: any) => sum + (Number(qty) || 0), 0)
      }

      // Insert into inventory
      const { data: inventoryItem, error: inventoryError } = await supabaseAdmin
        .from(TABLES.INVENTORY)
        .insert({
          product_id: finalProductId,
          batch_number: itemId,
          cost_price: pricePerPiece,
          selling_price: 0, // Default, can be set later
          quantity_available: totalQuantity,
          owner: user.username,
          low_stock_warning: 5
        })
        .select()
        .single()

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
        return {
          id: row.id,
          productId: row.product_id ?? null,
          productName: p.product_name ?? '',
          category: p.product_type ?? '',
          brand: p.brand_name ?? '',
          size: p.sizes ?? [],
          color: p.colors ?? [],
          sizeQuantities: null,
          otherVariants: {},
          batchNumber: row.batch_number,
          costPrice: Number(row.cost_price) || 0,
          sellingPrice: Number(row.selling_price) || 0,
          quantityAvailable: Number(row.quantity_available) || 0,
          lowStockWarning: Number(row.low_stock_warning) || 5,
          owner: row.owner ?? undefined
        }
      })

      return res.json({ inventory: formattedInventory })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('API error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

