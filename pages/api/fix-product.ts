import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const log: string[] = [];

  try {
    // Create a new product with placeholder name
    const { data: product, error: e1 } = await supabaseAdmin
      .from(TABLES.PRODUCTS)
      .insert({
        product_name: 'Unknown Item (Rename Me)',
        product_type: 'Unknown',
        price_per_piece: 750,
        colors: [],
        sizes: [],
      })
      .select('id')
      .single();

    if (e1) { log.push(`ERROR creating product: ${e1.message}`); return res.json({ success: false, log }); }
    log.push(`OK: created product id = ${product.id}`);

    // Link inventory row to this new product
    const { error: e2 } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .update({ product_id: product.id })
      .eq('id', '05a433cb-d921-4e75-8456-f3e718b99433');

    if (e2) { log.push(`ERROR linking inventory: ${e2.message}`); }
    else { log.push('OK: inventory row linked to new product'); }

    // Link both store_inventory rows to this product
    const { error: e3 } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY)
      .update({ product_id: product.id })
      .eq('inventory_id', '05a433cb-d921-4e75-8456-f3e718b99433');

    if (e3) { log.push(`ERROR linking store_inventory: ${e3.message}`); }
    else { log.push('OK: store_inventory rows linked to new product'); }

    return res.json({ success: true, log });
  } catch (e: any) {
    return res.status(500).json({ error: e.message, log });
  }
}
