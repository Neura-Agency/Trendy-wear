import { supabaseAdmin, TABLES } from '../supabase'

export type AppSettings = {
  defaultCommission: number
  lowStockThreshold: number
}

export async function getSettings(): Promise<AppSettings> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.SETTINGS)
    .select('key,value')
    .in('key', ['defaultCommission', 'lowStockThreshold'])

  if (error) throw error

  const out: AppSettings = {
    defaultCommission: 10,
    lowStockThreshold: 5
  }

  for (const row of data ?? []) {
    if (row.key === 'defaultCommission') out.defaultCommission = Number(row.value)
    if (row.key === 'lowStockThreshold') out.lowStockThreshold = Number(row.value)
  }

  return out
}

export type StoreRow = {
  id: string
  name: string
  commission: number
  paid_amount: number
  paid: boolean
  created_at: string
  paid_at: string | null
}

export function storeRowToAppStore(row: StoreRow) {
  return {
    commission: Number(row.commission) || 0,
    paidAmount: Number(row.paid_amount) || 0,
    paid: Boolean(row.paid),
    createdAt: row.created_at,
    paidAt: row.paid_at ?? undefined
  }
}

export function storeRowsToRecord(rows: StoreRow[]) {
  const out: Record<string, any> = {}
  for (const row of rows) out[row.name] = storeRowToAppStore(row)
  return out
}

export async function getStoreByName(storeName: string): Promise<StoreRow | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.STORES)
    .select('id,name,commission,paid_amount,paid,created_at,paid_at')
    .eq('name', storeName)
    .maybeSingle()

  if (error) throw error
  return (data as any) ?? null
}

export async function ensureStore(storeName: string, commissionDefault: number): Promise<StoreRow> {
  const existing = await getStoreByName(storeName)
  if (existing) return existing

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from(TABLES.STORES)
    .insert({ name: storeName, commission: commissionDefault })
    .select('id,name,commission,paid_amount,paid,created_at,paid_at')
    .single()

  if (insertError) {
    // If there was a race/conflict, read again.
    const retry = await getStoreByName(storeName)
    if (retry) return retry
    throw insertError
  }

  return inserted as any
}

export async function getInventoryTotalQty(productName: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.INVENTORY)
    .select('quantity_available')
    .eq('product_name', productName)

  if (error) throw error
  return (data ?? []).reduce((sum, r: any) => sum + (Number(r.quantity_available) || 0), 0)
}

export async function getAllotedQty(productName: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.STORE_INVENTORY)
    .select('quantity_assigned')
    .eq('product_name', productName)

  if (error) throw error
  return (data ?? []).reduce((sum, r: any) => sum + (Number(r.quantity_assigned) || 0), 0)
}

export async function pickInventoryBatchForSale(productName: string) {
  const { data, error } = await supabaseAdmin
    .from(TABLES.INVENTORY)
    .select('id,cost_price,quantity_available')
    .eq('product_name', productName)
    .gt('quantity_available', 0)
    .order('quantity_available', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as any
}
