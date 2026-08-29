// Integration test: Warehouse stock model — scalar AND breakdown consistency.
//   inventory.quantity_available and inventory.variant/size/color_quantities must all
//   describe the SAME current available warehouse state, maintained by allot/return/delete.
// Invariant: current breakdown total == quantity_available, and
//            quantity_available + SUM(assigned) == total physical stock.
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

describe('Warehouse stock model: allot -> GET -> return -> delete (breakdowns stay consistent)', () => {
  let productId = ''
  let storeId = ''
  let inventoryId = ''
  let siId = ''
  const tag = Date.now()
  const productName = `WSM-${tag}`
  // Grey: S10 M10 = 20
  const INIT = Object.freeze({ qa: 20, var: { Grey: { S: 10, M: 10 } }, size: { S: 10, M: 10 }, color: { Grey: 20 } })

  async function setup() {
    const p = await supabaseAdmin.from(TABLES.PRODUCTS).insert({ product_name: productName, brand_name: 'WSM', product_type: 'Shirt', price_per_piece: 500, colors: ['Grey'], sizes: ['S', 'M'] }).select('id').single()
    if (p.error) throw new Error('p: ' + p.error.message); productId = p.data.id
    const inv = await supabaseAdmin.from(TABLES.INVENTORY).insert({
      product_id: productId, batch_number: `WSM-${tag}`, cost_price: 300, selling_price: 500,
      quantity_available: INIT.qa, size_quantities: INIT.size, color_quantities: INIT.color, variant_quantities: INIT.var,
    }).select('id').single()
    if (inv.error) throw new Error('inv: ' + inv.error.message); inventoryId = inv.data.id
    const st = await supabaseAdmin.from(TABLES.STORES).insert({ name: `Grey WSM ${tag}` }).select('id').single()
    if (st.error) throw new Error('st: ' + st.error.message); storeId = st.data.id
  }

  beforeAll(async () => { await setup() })
  afterAll(async () => {
    if (siId) await supabaseAdmin.from(TABLES.STORE_INVENTORY).delete().eq('id', siId)
    if (inventoryId) await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', inventoryId)
    if (storeId) await supabaseAdmin.from(TABLES.STORES).delete().eq('id', storeId)
    if (productId) await supabaseAdmin.from(TABLES.PRODUCTS).delete().eq('id', productId)
  })

  async function readWarehouse() {
    const inv = await supabaseAdmin.from(TABLES.INVENTORY).select('quantity_available, variant_quantities, size_quantities, color_quantities').eq('id', inventoryId).single()
    const si = await supabaseAdmin.from(TABLES.STORE_INVENTORY).select('quantity_assigned').eq('id', siId).maybeSingle()
    return {
      qa: num(inv.data.quantity_available),
      var: inv.data.variant_quantities || {},
      size: inv.data.size_quantities || {},
      color: inv.data.color_quantities || {},
      assigned: num((si.data && si.data.quantity_assigned) || 0),
    }
  }

  test('1. Allot S3 M3 (6) -> qa 20->14, variant S7 M7, invariant 14+6=20', async () => {
    const res = makeRes()
    const batchRes = await supabaseAdmin.from(TABLES.INVENTORY).select('batch_number').eq('id', inventoryId).single()
    await handlerStoreInventory(makeReq('POST', {
      storeName: `Grey WSM ${tag}`, batchNumber: batchRes.data.batch_number, quantity: 6,
      variantQuantitiesAssigned: { Grey: { S: 3, M: 3 } }, sizeQuantitiesAssigned: { S: 3, M: 3 },
      colorQuantitiesAssigned: { Grey: 6 }, ownerSupplyPrice: 300, commissionPercent: 10, extraQty: 0,
    }), res)
    expect(res.statusCode).toBe(201)
    siId = res.data.id
    const w = await readWarehouse()
    expect(w.qa).toBe(14)
    expect(variantTotal(w.var)).toBe(14)
    expect(w.var.Grey.S).toBe(7)
    expect(w.var.Grey.M).toBe(7)
    expect(flatTotal(w.size)).toBe(14)
    expect(w.size.S).toBe(7)
    expect(flatTotal(w.color)).toBe(14)
    expect(w.assigned).toBe(6)
    expect(w.qa + w.assigned).toBe(INIT.qa) // 14+6=20
  })

  test('2. /api/inventory GET returns current scalar AND current breakdowns (all consistent)', async () => {
    const res = makeRes()
    await handlerInventory(makeReq('GET', {}), res)
    expect(res.statusCode).toBe(200)
    const row = (res.data.inventory || res.data).find((i: any) => i.id === inventoryId)
    expect(row).toBeDefined()
    expect(row.quantityAvailable).toBe(14)
    expect(variantTotal(row.variantQuantities)).toBe(14) // NOT 20 — allotment reduced it
  })

  test('3. Full return via returnToWarehouse -> qa 14->20, variant S10 M10, assigned 0', async () => {
    const res = makeRes()
    await handlerStoreInventory(makeReq('PATCH', {
      action: 'returnToWarehouse', id: siId, returnQty: 6,
      returnSizeQuantities: { S: 3, M: 3 }, returnColorQuantities: { Grey: 6 },
      returnVariantQuantities: { Grey: { S: 3, M: 3 } },
    }), res)
    expect(res.statusCode).toBe(200)
    const w = await readWarehouse()
    expect(w.qa).toBe(INIT.qa) // 20
    expect(variantTotal(w.var)).toBe(20)
    expect(w.var.Grey.S).toBe(10)
    expect(w.var.Grey.M).toBe(10)
    expect(w.size.S).toBe(10)
    expect(w.color.Grey).toBe(20)
    expect(w.assigned).toBe(0)
    expect(w.qa + w.assigned).toBe(INIT.qa)
  })

  test('4. Re-allot 6 then DELETE -> qa back to 20, variant S10 M10, allocation removed', async () => {
    // re-allot
    const res = makeRes()
    const batchRes = await supabaseAdmin.from(TABLES.INVENTORY).select('batch_number').eq('id', inventoryId).single()
    await handlerStoreInventory(makeReq('POST', {
      storeName: `Grey WSM ${tag}`, batchNumber: batchRes.data.batch_number, quantity: 6,
      variantQuantitiesAssigned: { Grey: { S: 3, M: 3 } }, sizeQuantitiesAssigned: { S: 3, M: 3 },
      colorQuantitiesAssigned: { Grey: 6 }, ownerSupplyPrice: 300, commissionPercent: 10, extraQty: 0,
    }), res)
    expect(res.statusCode).toBe(201)
    siId = res.data.id
    let w = await readWarehouse()
    expect(w.qa).toBe(14)

    // DELETE (returns quantity_remaining = 6 AND restores breakdowns)
    const del = makeRes()
    await handlerStoreInventory(makeReq('DELETE', { id: siId }), del)
    expect(del.statusCode).toBe(200)
    expect(num(del.data.returned)).toBe(6)
    w = await readWarehouse()
    expect(w.qa).toBe(INIT.qa)
    expect(variantTotal(w.var)).toBe(20)
    expect(w.var.Grey.S).toBe(10)
    expect(w.var.Grey.M).toBe(10)
    const gone = await supabaseAdmin.from(TABLES.STORE_INVENTORY).select('id').eq('id', siId).maybeSingle()
    expect(gone.data).toBeNull()
  })

  test('5. Partial return S1 M1 -> qa 16, variant S7->SWAP, assigned S2 M2=4, invariant 16+4=20', async () => {
    const res = makeRes()
    const batchRes = await supabaseAdmin.from(TABLES.INVENTORY).select('batch_number').eq('id', inventoryId).single()
    await handlerStoreInventory(makeReq('POST', {
      storeName: `Grey WSM ${tag}`, batchNumber: batchRes.data.batch_number, quantity: 6,
      variantQuantitiesAssigned: { Grey: { S: 3, M: 3 } }, sizeQuantitiesAssigned: { S: 3, M: 3 },
      colorQuantitiesAssigned: { Grey: 6 }, ownerSupplyPrice: 300, commissionPercent: 10, extraQty: 0,
    }), res)
    expect(res.statusCode).toBe(201)
    siId = res.data.id
    let w = await readWarehouse()
    expect(w.qa).toBe(14)

    const part = makeRes()
    await handlerStoreInventory(makeReq('PATCH', {
      action: 'returnToWarehouse', id: siId, returnQty: 2,
      returnSizeQuantities: { S: 1, M: 1 }, returnColorQuantities: { Grey: 2 },
      returnVariantQuantities: { Grey: { S: 1, M: 1 } },
    }), part)
    expect(part.statusCode).toBe(200)
    w = await readWarehouse()
    expect(w.qa).toBe(16)
    expect(variantTotal(w.var)).toBe(16)
    expect(w.var.Grey.S).toBe(8)
    expect(w.var.Grey.M).toBe(8)
    expect(w.assigned).toBe(4)
    expect(w.qa + w.assigned).toBe(INIT.qa) // 16+4=20
  })
})