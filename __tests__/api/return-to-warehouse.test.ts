// Integration test: returnToWarehouse API — these tests verify the LEGACY read path
// (GET) and the retired write paths (PATCH/DELETE). Under the global inventory model:
//   - POST, PATCH, DELETE to /api/storeInventory return 410 STORE_ALLOTMENT_RETIRED
//   - GET still works for legacy inspection during the payout-cycle monitoring window
//
// Historical store_inventory rows can be inserted directly into the DB for migration
// verification, but the API no longer accepts mutations through store_inventory.
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

describe('Return to Main Store — API retirement boundary', () => {
  it('1. PATCH returnToWarehouse is retired (410)', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('PATCH', {
      action: 'returnToWarehouse',
      id: 'fake-id',
      returnQty: 6,
    }), res)
    expect(res.statusCode).toBe(410)
    expect(res.data.code).toBe('STORE_ALLOTMENT_RETIRED')
  })

  it('2. POST allotment is retired (410)', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('POST', {
      storeName: 'Test', batchNumber: 'TST-001', quantity: 6,
    }), res)
    expect(res.statusCode).toBe(410)
    expect(res.data.code).toBe('STORE_ALLOTMENT_RETIRED')
  })

  it('3. DELETE allotment row is retired (410)', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('DELETE', { id: 'fake-id' }), res)
    expect(res.statusCode).toBe(410)
    expect(res.data.code).toBe('STORE_ALLOTMENT_RETIRED')
  })

  it('4. GET legacy store inventory still works for inspection', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('GET', {}), res)
    expect(res.statusCode).toBe(200)
    expect(res.data).toHaveProperty('retired', true)
    expect(res.data).toHaveProperty('legacyStoreInventory')
    expect(Array.isArray(res.data.legacyStoreInventory)).toBe(true)
  })
})

describe('Return to Main Store — legacy migration window: read-only inspection', () => {
  let productId = ''
  let storeId = ''
  let inventoryId = ''
  let siId = ''
  const tag = Date.now()

  beforeAll(async () => {
    const p = await supabaseAdmin.from(TABLES.PRODUCTS).insert({
      product_name: `RTW-${tag}`, brand_name: 'RTW', product_type: 'Shirt', price_per_piece: 500,
      colors: ['Red', 'Blue'], sizes: ['S', 'M', 'L'],
    }).select('id').single()
    if (p.error) throw new Error('product: ' + p.error.message)
    productId = p.data.id

    const inv = await supabaseAdmin.from(TABLES.INVENTORY).insert({
      product_id: productId, batch_number: `RTW-${tag}`, cost_price: 300, selling_price: 500,
      quantity_available: 10,
      size_quantities: { S: 3, M: 4, L: 3 },
      color_quantities: { Red: 5, Blue: 5 },
      variant_quantities: { Red: { S: 2, M: 2, L: 1 }, Blue: { S: 1, M: 2, L: 2 } },
    }).select('id').single()
    if (inv.error) throw new Error('inventory: ' + inv.error.message)
    inventoryId = inv.data.id

    const st = await supabaseAdmin.from(TABLES.STORES).insert({ name: `RTW Store ${tag}` }).select('id').single()
    if (st.error) throw new Error('store: ' + st.error.message)
    storeId = st.data.id

    // Insert a legacy store_inventory row directly (simulating historical data)
    const si = await supabaseAdmin.from(TABLES.STORE_INVENTORY).insert({
      store_id: storeId, product_id: productId, inventory_id: inventoryId,
      owner_supply_price: 300, commission_percent: 10, store_selling_price: 300,
      quantity_assigned: 6, quantity_remaining: 4, returned_to_warehouse_qty: 2,
      size_quantities_assigned: { S: 4, M: 2, L: 0 },
      size_quantities_remaining: { S: 2, M: 2, L: 0 },
      color_quantities_assigned: { Red: 6, Blue: 0 },
      color_quantities_remaining: { Red: 4, Blue: 0 },
      variant_quantities_assigned: { Red: { S: 4, M: 2, L: 0 }, Blue: { S: 0, M: 0, L: 0 } },
      variant_quantities_remaining: { Red: { S: 2, M: 2, L: 0 }, Blue: { S: 0, M: 0, L: 0 } },
    }).select('id').single()
    if (si.error) throw new Error('store_inventory: ' + si.error.message)
    siId = si.data.id
  })

  afterAll(async () => {
    if (siId) await supabaseAdmin.from(TABLES.STORE_INVENTORY).delete().eq('id', siId)
    if (inventoryId) await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', inventoryId)
    if (storeId) await supabaseAdmin.from(TABLES.STORES).delete().eq('id', storeId)
    if (productId) await supabaseAdmin.from(TABLES.PRODUCTS).delete().eq('id', productId)
  })

  test('5. GET legacy store inventory returns the historical row for migration inspection', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('GET', {}), res)
    expect(res.statusCode).toBe(200)
    expect(res.data.retired).toBe(true)
    const row = res.data.legacyStoreInventory?.find((r: any) => r.id === siId)
    expect(row).toBeDefined()
    expect(num(row.quantity_assigned)).toBe(6)
    expect(num(row.quantity_remaining)).toBe(4)
  })

  test('6. PATCH returnToWarehouse still returns 410 (cannot use store_inventory to return stock)', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('PATCH', {
      action: 'returnToWarehouse', id: siId, returnQty: 4,
    }), res)
    expect(res.statusCode).toBe(410)
  })

  test('7. Global inventory remains unchanged (no allotment-layer mutation possible)', async () => {
    const { data } = await supabaseAdmin.from(TABLES.INVENTORY).select('quantity_available').eq('id', inventoryId).single()
    // quantity_available has not been changed by any allotment-layer mutation
    expect(num(data?.quantity_available)).toBe(10)
  })
})

describe('Return to Main Store — DELETE must not double-return', () => {
  it('8. DELETE of legacy store_inventory row returns 410 (not a valid write path)', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('DELETE', { id: '00000000-0000-0000-0000-000000000099' }), res)
    expect(res.statusCode).toBe(410)
    expect(res.data.code).toBe('STORE_ALLOTMENT_RETIRED')
  })
})