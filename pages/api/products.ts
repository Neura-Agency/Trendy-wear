import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession, toUserPayload } from '../../lib/api/session'

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

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('API error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
