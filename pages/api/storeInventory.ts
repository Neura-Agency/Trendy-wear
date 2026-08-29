import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession } from '../../lib/api/session'

const retired = {
  error: 'Inventory allotment is retired. Stores sell from global inventory.',
  code: 'STORE_ALLOTMENT_RETIRED',
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireSession(req, res)
  if (!session) return

  if (req.method !== 'GET') return res.status(410).json(retired)

  // Read-only legacy inspection endpoint kept during the payout-cycle migration window.
  // No current sales, returns, replacements, or UI depend on this data.
  const { data, error } = await supabaseAdmin
    .from(TABLES.STORE_INVENTORY)
    .select('id, store_id, product_id, inventory_id, quantity_assigned, quantity_remaining, returned_to_warehouse_qty, created_at, updated_at')
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: 'Failed to fetch legacy store inventory' })

  return res.json({
    storeInventory: {},
    legacyStoreInventory: data || [],
    retired: true,
    meta: { latestUpdatedAt: null },
  })
}
