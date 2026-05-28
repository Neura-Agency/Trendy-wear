import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession, toUserPayload } from '../../lib/api/session'
import { buildDeterministicProductId, findMatchingProduct, normalizeCatalogValue, resolveCanonicalBrand } from '../../lib/catalog'

const PRODUCT_IMAGES_BUCKET = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || 'Trendy Wear'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function uploadProductImage(picture: string): Promise<string | null> {
  if (!picture || !picture.startsWith('data:image')) return null

  const base64Data = picture.split(',')[1]
  const mimeType = picture.split(';')[0].split(':')[1]
  const fileExt = mimeType.split('/')[1]
  const buffer = Buffer.from(base64Data, 'base64')
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`

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

    if (req.method === 'GET') {
      const { data: products, error } = await supabaseAdmin
        .from(TABLES.PRODUCTS)
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Fetch products error:', error)
        return res.status(500).json({ error: 'Failed to fetch products' })
      }

      // Transform to match expected format
      const formattedProducts = products.map(p => ({
        id: p.id,
        productName: p.product_name,
        brandName: p.brand_name,
        productType: p.product_type,
        pricePerPiece: Number(p.price_per_piece) || 0,
        colors: p.colors || [],
        sizes: p.sizes || [],
        productImage: p.product_image
      }))

      return res.json({ products: formattedProducts })
    }

    if (req.method === 'POST') {
      const {
        productName,
        brandName,
        productType,
        pricePerPiece,
        colors,
        sizes,
        picture,
      } = req.body || {}

      const pn = String(productName || '').trim()
      if (!pn) {
        return res.status(400).json({ error: 'productName is required' })
      }

      const bn = String(brandName || '').trim()
      const pt = String(productType || '').trim()
      if (!bn) {
        return res.status(400).json({ error: 'brandName is required' })
      }
      if (!pt) {
        return res.status(400).json({ error: 'productType is required' })
      }
      const imageUrl = await uploadProductImage(String(picture || ''))

      const { data: products, error: fetchError } = await supabaseAdmin
        .from(TABLES.PRODUCTS)
        .select('*')

      if (fetchError) {
        console.error('Fetch products error:', fetchError)
        return res.status(500).json({ error: 'Failed to fetch products' })
      }

      const canonicalBrand = resolveCanonicalBrand(products || [], bn)
      const existing = findMatchingProduct(products || [], pn, canonicalBrand, pt)
      const existingByNameBrand = (products || []).find((product: any) =>
        normalizeCatalogValue(String(product?.product_name ?? product?.productName ?? '')) === normalizeCatalogValue(pn) &&
        normalizeCatalogValue(String(product?.brand_name ?? product?.brandName ?? '')) === normalizeCatalogValue(canonicalBrand)
      )
      const targetExisting = existing?.id ? existing : existingByNameBrand
      const productId = buildDeterministicProductId(pn, canonicalBrand, pt)

      const basePayload = {
        product_name: pn,
        brand_name: canonicalBrand,
        product_type: pt,
        price_per_piece: num(pricePerPiece),
        colors: Array.isArray(colors) ? colors : [],
        sizes: Array.isArray(sizes) ? sizes : [],
        product_image: imageUrl,
      }

      const insertPayload = {
        id: productId,
        ...basePayload,
      }

      let saved
      let error

      if (targetExisting?.id) {
        const result = await supabaseAdmin
          .from(TABLES.PRODUCTS)
          .update(basePayload)
          .eq('id', targetExisting.id)
          .select('*')
          .single()
        saved = result.data
        error = result.error
      } else {
        const result = await supabaseAdmin
          .from(TABLES.PRODUCTS)
          .insert(insertPayload)
          .select('*')
          .single()
        saved = result.data
        error = result.error
      }

      if (error) {
        console.error('Save product error:', error)
        const message = error?.message ? `Failed to save product: ${error.message}` : 'Failed to save product'
        return res.status(500).json({ error: message })
      }

      return res.status(201).json({
        product: {
          id: saved.id,
          productName: saved.product_name,
          brandName: saved.brand_name,
          productType: saved.product_type,
          pricePerPiece: Number(saved.price_per_piece) || 0,
          colors: saved.colors || [],
          sizes: saved.sizes || [],
          productImage: saved.product_image,
        }
      })
    }

    if (req.method === 'DELETE') {
      const { id, productName, brandName, field, value } = req.body || {}
      const deleteQuery = supabaseAdmin.from(TABLES.PRODUCTS).delete()

      if (id) {
        const { error } = await deleteQuery.eq('id', String(id))
        if (error) {
          console.error('Delete product error:', error)
          return res.status(500).json({ error: 'Failed to delete product' })
        }
        return res.json({ success: true })
      }

      const nameFilter = String(productName || (field === 'productName' ? value : '') || '').trim()
      const brandFilter = String(brandName || (field === 'brandName' ? value : '') || '').trim()

      if (!nameFilter && !brandFilter) {
        return res.status(400).json({ error: 'id or productName/brandName is required' })
      }

      let q = supabaseAdmin.from(TABLES.PRODUCTS).delete()
      if (nameFilter) q = q.eq('product_name', nameFilter)
      if (brandFilter) q = q.eq('brand_name', brandFilter)

      const { error } = await q
      if (error) {
        console.error('Delete product error:', error)
        return res.status(500).json({ error: 'Failed to delete product' })
      }

      return res.json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('API error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
