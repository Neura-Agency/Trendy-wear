import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const log: string[] = [];

  try {
    // Get the inventory row for ITEM-R5F930
    const { data: inv } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .select('*')
      .eq('batch_number', 'ITEM-R5F930')
      .maybeSingle();
    log.push(`Inventory row: ${JSON.stringify(inv)}`);

    // Check store_inventory rows linked to this inventory id
    const { data: storeInv } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY)
      .select('*')
      .eq('inventory_id', inv?.id);
    log.push(`Store inventory rows: ${JSON.stringify(storeInv)}`);

    // Check orders that might reference this product
    const { data: orders } = await supabaseAdmin
      .from(TABLES.ORDERS)
      .select('*')
      .eq('inventory_id', inv?.id)
      .limit(5);
    log.push(`Orders: ${JSON.stringify(orders)}`);

    // Check all products to see if any orphaned product exists (null or empty name)
    const { data: blankProducts } = await supabaseAdmin
      .from(TABLES.PRODUCTS)
      .select('*')
      .or('product_name.is.null,product_name.eq.');
    log.push(`Blank/null name products: ${JSON.stringify(blankProducts)}`);

    return res.json({ success: true, log });
  } catch (e: any) {
    return res.status(500).json({ error: e.message, log });
  }
}
