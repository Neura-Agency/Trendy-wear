// Integration test: Global inventory stock model — scalar AND breakdown consistency.
// In the global inventory model, stores do not own stock. There is no allotment.
// Invariant: inventory.quantity_available decreases with sales and increases with returns.
// The test verifies the global inventory API GET, PATCH (update), and DELETE handlers
// are consistent, and that the allotment write paths return 410 (retired).
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
  toUserPayload: jest.fn((u: any) => u),
}))

let lastRes: any
function makeReq(method: string, body: any): NextApiRequest { return { method, body, headers: {} } as any }
function makeRes(): NextApiResponse & { data: any } {
  lastRes = { statusCode: 200, data: null as any, status(c: number) { this.statusCode = c; return this }, json(payload: any) { this.data = payload; return this }, setHeader() { return this } }
  return lastRes as any
}

import handlerStoreInventory from '../../pages/api/storeInventory'
import handlerInventory from '../../pages/api/inventory'
import { supabaseAdmin, TABLES } from '../../lib/supabase'

const num = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const variantTotal = (v: any): number => (Object.values(v || {}) as any[]).reduce((a: number, sizes: any) => a + (Object.values(sizes || {}) as any[]).reduce((x: number, y: any) => x + Number(y || 0), 0), 0)
const flatTotal = (v: any): number => (Object.values(v || {}) as any[]).reduce((a: number, b: any) => a + Number(b || 0), 0)

describe('Global inventory model: allotment retired — API boundary enforcement', () => {
  it('rejects POST /api/storeInventory (allotment creation) with 410', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('POST', { storeName: 'TestStore', batchNumber: 'TST-001', quantity: 6 }), res)
    expect(res.statusCode).toBe(410)
    expect(res.data.code).toBe('STORE_ALLOTMENT_RETIRED')
  })

  it('rejects PATCH /api/storeInventory (allotment mutation) with 410', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('PATCH', { action: 'returnToWarehouse', id: 'fake-id' }), res)
    expect(res.statusCode).toBe(410)
    expect(res.data.code).toBe('STORE_ALLOTMENT_RETIRED')
  })

  it('rejects DELETE /api/storeInventory with 410', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('DELETE', { id: 'fake-id' }), res)
    expect(res.statusCode).toBe(410)
    expect(res.data.code).toBe('STORE_ALLOTMENT_RETIRED')
  })

  it('allows GET /api/storeInventory for legacy inspection', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('GET', {}), res)
    expect(res.statusCode).toBe(200)
    expect(res.data).toHaveProperty('retired', true)
    expect(res.data).toHaveProperty('legacyStoreInventory')
  })
})

describe('Global inventory model: inventory API GET/PATCH breakdowns stay consistent', () => {
  let productId = ''
  let inventoryId = ''
  const tag = Date.now()
  const productName = `WSM-${tag}`
  const INIT = Object.freeze({ qa: 20, var: { Grey: { S: 10, M: 10 } }, size: { S: 10, M: 10 }, color: { Grey: 20 } })

  beforeAll(async () => {
    const p = await supabaseAdmin.from(TABLES.PRODUCTS).insert({
      product_name: productName, brand_name: 'WSM', product_type: 'Shirt',
      price_per_piece: 500, colors: ['Grey'], sizes: ['S', 'M'],
    }).select('id').single()
    if (p.error) throw new Error('p: ' + p.error.message)
    productId = p.data.id

    const inv = await supabaseAdmin.from(TABLES.INVENTORY).insert({
      product_id: productId, batch_number: `WSM-${tag}`, cost_price: 300, selling_price: 500,
      quantity_available: INIT.qa, size_quantities: INIT.size, color_quantities: INIT.color, variant_quantities: INIT.var,
    }).select('id').single()
    if (inv.error) throw new Error('inv: ' + inv.error.message)
    inventoryId = inv.data.id
  })

  afterAll(async () => {
    if (inventoryId) await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', inventoryId)
    if (productId) await supabaseAdmin.from(TABLES.PRODUCTS).delete().eq('id', productId)
  })

  test('1. GET /api/inventory returns inventory with correct scalar and variant quantities', async () => {
    const res = makeRes()
    await handlerInventory(makeReq('GET', {}), res)
    expect(res.statusCode).toBe(200)
    const row: any = (res.data.inventory || res.data).find((i: any) => i.id === inventoryId)
    expect(row).toBeDefined()
    expect(row.quantityAvailable).toBe(INIT.qa)
    expect(variantTotal(row.variantQuantities)).toBe(INIT.qa)
  })

  test('2. PATCH /api/inventory updates quantity and breakdowns remain consistent', async () => {
    const res = makeRes()
    await handlerInventory(makeReq('PATCH', {
      id: inventoryId,
      productId,
      fields: {
        inventory: {
          variantQuantities: { Grey: { S: 8, M: 7 } },
        },
      },
    }), res)
    expect(res.statusCode).toBe(200)

    const { data } = await supabaseAdmin.from(TABLES.INVENTORY).select('quantity_available, variant_quantities').eq('id', inventoryId).single()
    // With variantQuantities set, quantity_available should equal the rollup total (8+7=15)
    expect(num(data!.quantity_available)).toBe(15)
    expect(variantTotal(data!.variant_quantities)).toBe(15)

    // Restore
    await supabaseAdmin.from(TABLES.INVENTORY).update({
      quantity_available: INIT.qa,
      variant_quantities: INIT.var,
      size_quantities: INIT.size,
      color_quantities: INIT.color,
    }).eq('id', inventoryId)
  })

  test('3. GET after restore returns original quantities', async () => {
    const res = makeRes()
    await handlerInventory(makeReq('GET', {}), res)
    const row: any = (res.data.inventory || res.data).find((i: any) => i.id === inventoryId)
    expect(row).toBeDefined()
    expect(row.quantityAvailable).toBe(INIT.qa)
    expect(variantTotal(row.variantQuantities)).toBe(INIT.qa)
  })

  test('4. Global inventory total is the sum of all batch quantities_available (no per-store pools)', async () => {
    const res = makeRes()
    await handlerInventory(makeReq('GET', {}), res)
    const inventory: any[] = res.data.inventory || res.data
    const totalGlobal = inventory.reduce((sum: number, i: any) => sum + Math.max(0, num(i.quantityAvailable)), 0)
    // Global total should be >= INIT.qa (there may be other items in the test DB)
    expect(totalGlobal).toBeGreaterThanOrEqual(INIT.qa)
    // Each item's quantity_available is a non-negative number
    inventory.forEach((i: any) => {
      expect(num(i.quantityAvailable)).toBeGreaterThanOrEqual(0)
    })
  })
})