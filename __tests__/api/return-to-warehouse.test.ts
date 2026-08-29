// Integration test: Return to Main Store (returnToWarehouse) consistency.
//   - FULL return must net quantity_assigned + *_assigned breakdowns (Details/Edit/table)
//   - PARTIAL return must net only the returned per-color/size units
//   - DELETE after a full return must not re-return stock to the warehouse
// Uses the real Supabase DB (via jest.setup.ts env) with a mocked auth session.
import type { NextApiRequest, NextApiResponse } from 'next'

const mockSession = {
  accountId: '00000000-0000-0000-0000-000000000001',
  username: 'testadmin',
  role: 'admin' as const,
  scope: 'all' as const,
  storeId: null,
  storeName: null,
  managedStores: [],
}

jest.mock('../../lib/api/session', () => ({
  requireSession: jest.fn(() => Promise.resolve(mockSession as any)),
  requireAdmin: jest.fn(() => Promise.resolve(mockSession as any)),
  getAllowedStoreIds: jest.fn(() => Promise.resolve(null)),
  createSession: jest.fn(),
  SESSION_COOKIE_NAME: 'tw_session',
  isAdmin: jest.fn(() => true),
  isSuperAdmin: jest.fn(() => true),
}))

let lastRes: any
function makeReq(method: string, body: any): NextApiRequest {
  return { method, body, headers: {} } as any
}
function makeRes(): NextApiResponse & { data: any } {
  lastRes = {
    statusCode: 200,
    data: null as any,
    status(code: number) { this.statusCode = code; return this },
    json(payload: any) { this.data = payload; return this },
    setHeader() { return this },
  }
  return lastRes as any
}

import handlerStoreInventory from '../../pages/api/storeInventory'
import { supabaseAdmin, TABLES } from '../../lib/supabase'

const num = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

describe('Return to Main Store — allocation consistency', () => {
  let productId = ''
  let storeId = ''
  let inventoryId = ''
  let siId = ''
  const tag = Date.now()
  const productName = `RTW-${tag}`

  async function cleanup() {
    if (siId) await supabaseAdmin.from(TABLES.STORE_INVENTORY).delete().eq('id', siId)
    if (inventoryId) await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', inventoryId)
    if (storeId) await supabaseAdmin.from(TABLES.STORES).delete().eq('id', storeId)
    if (productId) await supabaseAdmin.from(TABLES.PRODUCTS).delete().eq('id', productId)
  }

  async function setup() {
    const p = await supabaseAdmin.from(TABLES.PRODUCTS).insert({
      product_name: productName, brand_name: 'RTW', product_type: 'Shirt', price_per_piece: 500,
      colors: ['Red', 'Blue'], sizes: ['S', 'M', 'L'],
    }).select('id').single()
    if (p.error) throw new Error('product: ' + p.error.message); productId = p.data.id

    const inv = await supabaseAdmin.from(TABLES.INVENTORY).insert({
      product_id: productId, batch_number: `RTW-${tag}`, cost_price: 300, selling_price: 500,
      quantity_available: 10,
      size_quantities: { S: 3, M: 4, L: 3 },
      color_quantities: { Red: 5, Blue: 5 },
      variant_quantities: { Red: { S: 2, M: 2, L: 1 }, Blue: { S: 1, M: 2, L: 2 } },
    }).select('id').single()
    if (inv.error) throw new Error('inventory: ' + inv.error.message); inventoryId = inv.data.id

    const st = await supabaseAdmin.from(TABLES.STORES).insert({ name: `RTW Store ${tag}` }).select('id').single()
    if (st.error) throw new Error('store: ' + st.error.message); storeId = st.data.id

    const si = await supabaseAdmin.from(TABLES.STORE_INVENTORY).insert({
      store_id: storeId, product_id: productId, inventory_id: inventoryId,
      owner_supply_price: 300, commission_percent: 10, store_selling_price: 300,
      quantity_assigned: 6, quantity_remaining: 6, returned_to_warehouse_qty: 0,
      size_quantities_assigned: { S: 4, M: 2, L: 0 }, size_quantities_remaining: { S: 4, M: 2, L: 0 },
      color_quantities_assigned: { Red: 6, Blue: 0 }, color_quantities_remaining: { Red: 6, Blue: 0 },
      variant_quantities_assigned: { Red: { S: 4, M: 2, L: 0 }, Blue: { S: 0, M: 0, L: 0 } },
      variant_quantities_remaining: { Red: { S: 4, M: 2, L: 0 }, Blue: { S: 0, M: 0, L: 0 } },
    }).select('id').single()
    if (si.error) throw new Error('store_inventory: ' + si.error.message); siId = si.data.id
  }

  beforeAll(async () => { await setup() })
  afterAll(async () => { await cleanup() })

  test('1. FULL return (all 6) reflects current database state', async () => {
    // Capture pre-return state to verify the invariant
    const { data: invBefore } = await supabaseAdmin.from(TABLES.INVENTORY).select('quantity_available').eq('id', inventoryId).single()
    const { data: siBefore } = await supabaseAdmin.from(TABLES.STORE_INVENTORY).select('quantity_assigned, quantity_remaining').eq('id', siId).single()
    const preInvariant = num(invBefore!.quantity_available) + num(siBefore!.quantity_assigned)
    // The invariant: warehouse_available + allocated = total physical stock (constant)
    // For this test warehouse=10, allocated=6, total=16

    const res = makeRes()
    await handlerStoreInventory(makeReq('PATCH', {
      action: 'returnToWarehouse',
      id: siId,
      returnQty: 6,
      returnSizeQuantities: { S: 4, M: 2, L: 0 },
      returnColorQuantities: { Red: 6 },
      returnVariantQuantities: { Red: { S: 4, M: 2, L: 0 } },
    }), res)
    expect(res.statusCode).toBe(200)
    expect(num(res.data.returned)).toBe(6)

    const { data: si } = await supabaseAdmin.from(TABLES.STORE_INVENTORY).select('*').eq('id', siId).single()
    expect(si!.quantity_assigned).toBe(0)
    expect(si!.quantity_remaining).toBe(0)
    expect(si!.returned_to_warehouse_qty).toBe(6)
    const va = si!.variant_quantities_assigned
    const sa = si!.size_quantities_assigned
    const ca = si!.color_quantities_assigned
    const zeroTotal = (o: any) => !o || Object.keys(o).length === 0
    expect(zeroTotal(va) || Object.values(Object.values(va || {}).flat()).every((n: any) => num(n) === 0)).toBe(true)
    expect(zeroTotal(sa) || Object.values(sa || {}).every((n: any) => num(n) === 0)).toBe(true)
    expect(zeroTotal(ca) || Object.values(ca || {}).every((n: any) => num(n) === 0)).toBe(true)

    const { data: invAfter } = await supabaseAdmin.from(TABLES.INVENTORY).select('quantity_available').eq('id', inventoryId).single()
    expect(invAfter!.quantity_available).toBe(16)
    // Assert the INVARIANT: warehouse_available + allocated = constant (no double-count)
    const postInvariant = num(invAfter!.quantity_available) + num(si!.quantity_assigned)
    expect(postInvariant).toBe(preInvariant)
    // The display Qty = quantity_available (NOT quantity_available - allocated)
    // So displayed Qty goes from 41 (for 47-6) to 47 (for 47-0) — correct
    expect(invAfter!.quantity_available).toBe(10 + 6) // physical increment = 6, not 12
  })

  test('2. GET returns assigned=0 so Details/Edit/table are consistent', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('GET', {}), res)
    expect(res.statusCode).toBe(200)
    const flat = Object.values(res.data.storeInventory).flatMap((v: any) => Object.values(v))
    const row: any = flat.find((r: any) => r.id === siId)
    expect(row).toBeDefined()
    expect(row.quantityAssigned).toBe(0)
    expect(row.quantityRemaining).toBe(0)
  })

  test('3. PARTIAL return nets only the returned units', async () => {
    await supabaseAdmin.from(TABLES.STORE_INVENTORY).update({
      quantity_assigned: 6, quantity_remaining: 6, returned_to_warehouse_qty: 0,
      size_quantities_assigned: { S: 4, M: 2, L: 0 }, size_quantities_remaining: { S: 4, M: 2, L: 0 },
      color_quantities_assigned: { Red: 6, Blue: 0 }, color_quantities_remaining: { Red: 6, Blue: 0 },
      variant_quantities_assigned: { Red: { S: 4, M: 2, L: 0 }, Blue: { S: 0, M: 0, L: 0 } },
      variant_quantities_remaining: { Red: { S: 4, M: 2, L: 0 }, Blue: { S: 0, M: 0, L: 0 } },
    }).eq('id', siId)
    await supabaseAdmin.from(TABLES.INVENTORY).update({ quantity_available: 10 }).eq('id', inventoryId)

    const res = makeRes()
    await handlerStoreInventory(makeReq('PATCH', {
      action: 'returnToWarehouse',
      id: siId,
      returnQty: 2,
      returnSizeQuantities: { S: 2 },
      returnColorQuantities: { Red: 2 },
      returnVariantQuantities: { Red: { S: 2 } },
    }), res)
    expect(res.statusCode).toBe(200)
    expect(num(res.data.returned)).toBe(2)

    const { data: si } = await supabaseAdmin.from(TABLES.STORE_INVENTORY).select('*').eq('id', siId).single()
    expect(si!.quantity_assigned).toBe(4)
    expect(si!.quantity_remaining).toBe(4)
    expect(si!.returned_to_warehouse_qty).toBe(2)
    const va = si!.variant_quantities_assigned || {}
    expect(num(va.Red?.S)).toBe(2)
    expect(num(va.Red?.M)).toBe(2)
  })

  test('4. Details/Edit data after partial return mirrors canonical state', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('GET', {}), res)
    const flat = Object.values(res.data.storeInventory).flatMap((v: any) => Object.values(v))
    const row: any = flat.find((r: any) => r.id === siId)
    expect(row).toBeDefined()
    expect(row.quantityAssigned).toBe(4)
    expect(row.quantityRemaining).toBe(4)
    expect(num(row.variantQuantitiesAssigned?.Red?.S)).toBe(2)
    expect(num(row.variantQuantitiesAssigned?.Red?.M)).toBe(2)
  })
})
describe('Return to Main Store — DELETE must not double-return', () => {
  let productId = ''; let storeId = ''; let inventoryId = ''; let siId = ''
  const tag = Date.now()

  beforeAll(async () => {
    const p = await supabaseAdmin.from(TABLES.PRODUCTS).insert({ product_name: `RTW-DEL-${tag}`, brand_name: 'RTW', product_type: 'Shirt', price_per_piece: 500, colors: ['Red'], sizes: ['S', 'M'] }).select('id').single()
    productId = p.data.id
    const inv = await supabaseAdmin.from(TABLES.INVENTORY).insert({ product_id: productId, batch_number: `RTW-DEL-${tag}`, cost_price: 300, selling_price: 500, quantity_available: 10, size_quantities: { S: 5, M: 5 }, color_quantities: { Red: 10 } }).select('id').single()
    inventoryId = inv.data.id
    const st = await supabaseAdmin.from(TABLES.STORES).insert({ name: `RTW Del ${tag}` }).select('id').single()
    storeId = st.data.id
    // fully-returned-style row: assigned 0, remaining 0, retWH 6
    const si = await supabaseAdmin.from(TABLES.STORE_INVENTORY).insert({
      store_id: storeId, product_id: productId, inventory_id: inventoryId,
      owner_supply_price: 300, commission_percent: 10, store_selling_price: 300,
      quantity_assigned: 0, quantity_remaining: 0, returned_to_warehouse_qty: 6,
      size_quantities_assigned: null, size_quantities_remaining: { S: 0, M: 0 },
      color_quantities_assigned: null, color_quantities_remaining: { Red: 0 },
    }).select('id').single()
    siId = si.data.id
  })

  afterAll(async () => {
    if (siId) await supabaseAdmin.from(TABLES.STORE_INVENTORY).delete().eq('id', siId)
    if (inventoryId) await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', inventoryId)
    if (storeId) await supabaseAdmin.from(TABLES.STORES).delete().eq('id', storeId)
    if (productId) await supabaseAdmin.from(TABLES.PRODUCTS).delete().eq('id', productId)
  })

  test('5. DELETE after full return returns 0 and does not increase warehouse stock', async () => {
    const { data: invBefore } = await supabaseAdmin.from(TABLES.INVENTORY).select('quantity_available').eq('id', inventoryId).single()
    const res = makeRes()
    await handlerStoreInventory(makeReq('DELETE', { id: siId }), res)
    expect(res.statusCode).toBe(200)
    expect(num(res.data.returned)).toBe(0)
    const { data: invAfter } = await supabaseAdmin.from(TABLES.INVENTORY).select('quantity_available').eq('id', inventoryId).single()
    expect(invAfter!.quantity_available).toBe(invBefore!.quantity_available)
    const { data: gone } = await supabaseAdmin.from(TABLES.STORE_INVENTORY).select('id').eq('id', siId).maybeSingle()
    expect(gone).toBeNull()
  })
})