// Integration test: Order DELETE rollback
// Uses real Supabase DB with mocked auth session.
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

import handlerOrders from '../../pages/api/orders'
import handlerStoreInventory from '../../pages/api/storeInventory'
import { supabaseAdmin, TABLES } from '../../lib/supabase'

const NOW = new Date().toISOString()
const PRICE = 500
const COST = 300
const COMMISSION_PCT = 10

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

describe('Order DELETE rollback', () => {
  let productId: string
  let inventoryId: string

  beforeAll(async () => {
    const { data: p } = await supabaseAdmin
      .from(TABLES.PRODUCTS)
      .insert({
        product_name: 'DelProduct ' + NOW,
        brand_name: 'TestBrand',
        product_type: 'Shirt',
        price_per_piece: PRICE,
        colors: ['Red', 'Blue'],
        sizes: ['S', 'M', 'L'],
      })
      .select('id')
      .single()
    if (!p) throw new Error('Product insert failed')
    productId = p.id

    const { data: inv } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .insert({
        product_id: productId,
        batch_number: 'BATCH-DEL-' + Date.now(),
        cost_price: COST,
        selling_price: PRICE,
        quantity_available: 10,
        size_quantities: { S: 3, M: 4, L: 3 },
        color_quantities: { Red: 5, Blue: 5 },
        variant_quantities: { Red: { S: 2, M: 2, L: 1 }, Blue: { S: 1, M: 2, L: 2 } },
        owner: 'testadmin',
        low_stock_warning: 0,
      })
      .select('id')
      .single()
    if (!inv) throw new Error('Inventory insert failed')
    inventoryId = inv.id
  }, 30000)

  afterAll(async () => {
    const { data: orders } = await supabaseAdmin.from(TABLES.ORDERS).select('id')
    for (const o of orders || []) {
      await supabaseAdmin.from(TABLES.ORDERS).delete().eq('id', o.id)
    }
    const { data: allSi } = await supabaseAdmin.from(TABLES.STORE_INVENTORY).select('id, store_id')
    for (const si of allSi || []) {
      await supabaseAdmin.from(TABLES.STORE_INVENTORY).delete().eq('id', si.id)
    }
    const { data: stores } = await supabaseAdmin.from(TABLES.STORES).select('id')
    for (const s of stores || []) {
      await supabaseAdmin.from(TABLES.STORES).delete().eq('id', s.id)
    }
    await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', inventoryId)
    await supabaseAdmin.from(TABLES.PRODUCTS).delete().eq('id', productId)
  }, 60000)

  const createStore = async (name: string): Promise<string> => {
    const { data: store } = await supabaseAdmin
      .from(TABLES.STORES)
      .insert({ name, commission: 10, paid_amount: 0, paid: false })
      .select('id')
      .single()
    if (!store) throw new Error('Store insert failed for ' + name)
    return store.id
  }

  const createInventory = async () => {
    const bn = 'BATCH-DEL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
    return supabaseAdmin
      .from(TABLES.INVENTORY)
      .insert({
        product_id: productId,
        batch_number: bn,
        cost_price: COST,
        selling_price: PRICE,
        quantity_available: 10,
        size_quantities: { S: 3, M: 4, L: 3 },
        color_quantities: { Red: 5, Blue: 5 },
        variant_quantities: { Red: { S: 2, M: 2, L: 1 }, Blue: { S: 1, M: 2, L: 2 } },
        owner: 'testadmin',
        low_stock_warning: 0,
      })
      .select('id, batch_number')
      .single()
  }

  const allot = async (storeName: string, batchNumber: string) => {
    const req = makeReq('POST', {
      storeName,
      batchNumber,
      quantity: 6,
      variantQuantitiesAssigned: { Red: { S: 1, M: 2, L: 1 }, Blue: { S: 1, M: 1 } },
      ownerSupplyPrice: COST,
      commissionPercent: COMMISSION_PCT,
    })
    const res = makeRes()
    await handlerStoreInventory(req, res)
    return { res, id: res.data.id }
  }

  const sell = async (storeName: string) => {
    const req = makeReq('POST', {
      productId,
      productName: 'DelProd ' + NOW,
      brandName: 'TestBrand',
      productType: 'Shirt',
      quantity: 3,
      variantQuantities: { Red: { S: 1, M: 1 }, Blue: { S: 1 } },
      sellingPrice: PRICE,
      shipmentCost: 0,
      extraCharges: 0,
      clientName: 'DelClient',
      storeName,
    })
    const res = makeRes()
    await handlerOrders(req, res)
    return { res, id: res.data.orderId }
  }

  const cleanupStore = async (storeId: string) => {
    const { data: siRows } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('id').eq('store_id', storeId)
    for (const si of siRows || []) {
      await supabaseAdmin.from(TABLES.STORE_INVENTORY).delete().eq('id', si.id)
    }
    await supabaseAdmin.from(TABLES.STORES).delete().eq('id', storeId)
  }

  test('delete a clean sale restores everything', async () => {
    const storeName = 'Del01-' + NOW
    const storeId = await createStore(storeName)

    const { data: inv } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .insert({
        product_id: productId,
        batch_number: 'BATCH-DEL01-' + Date.now(),
        cost_price: COST,
        selling_price: PRICE,
        quantity_available: 10,
        size_quantities: { S: 3, M: 4, L: 3 },
        color_quantities: { Red: 5, Blue: 5 },
        variant_quantities: { Red: { S: 2, M: 2, L: 1 }, Blue: { S: 1, M: 2, L: 2 } },
        owner: 'testadmin',
        low_stock_warning: 0,
      })
      .select('id, batch_number')
      .single()
    if (!inv) throw new Error('Inv insert failed')
    const invId = inv.id
    const batchNumber = inv.batch_number

    await allot(storeName, batchNumber)
    const { id: orderId } = await sell(storeName)

    const { data: siAfterSale } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('quantity_remaining').eq('store_id', storeId).single()
    expect(num(siAfterSale!.quantity_remaining)).toBe(3)

    const delReq = makeReq('DELETE', { id: orderId })
    const delRes = makeRes()
    await handlerOrders(delReq, delRes)
    expect(delRes.statusCode).toBe(200)
    expect(delRes.data.success).toBe(true)

    const { data: gone } = await supabaseAdmin
      .from(TABLES.ORDERS).select('id').eq('id', orderId).maybeSingle()
    expect(gone).toBeNull()

    const { data: siAfterDelete } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('quantity_remaining').eq('store_id', storeId).single()
    expect(num(siAfterDelete!.quantity_remaining)).toBe(6)

    const { data: invAfterDelete } = await supabaseAdmin
      .from(TABLES.INVENTORY).select('quantity_available').eq('id', invId).single()
    expect(num(invAfterDelete!.quantity_available)).toBe(4)

    await cleanupStore(storeId)
    await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', invId)
  })

  test('delete a sale with a return reverses the return', async () => {
    const storeName = 'Del02-' + NOW
    const storeId = await createStore(storeName)

    const { data: inv } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .insert({
        product_id: productId,
        batch_number: 'BATCH-DEL02-' + Date.now(),
        cost_price: COST,
        selling_price: PRICE,
        quantity_available: 10,
        size_quantities: { S: 3, M: 4, L: 3 },
        color_quantities: { Red: 5, Blue: 5 },
        variant_quantities: { Red: { S: 2, M: 2, L: 1 }, Blue: { S: 1, M: 2, L: 2 } },
        owner: 'testadmin',
        low_stock_warning: 0,
      })
      .select('id, batch_number')
      .single()
    if (!inv) throw new Error('Inv insert failed')
    const invId = inv.id
    const batchNumber = inv.batch_number

    await allot(storeName, batchNumber)
    const { id: oid } = await sell(storeName)

    const retReq = makeReq('PATCH', {
      id: oid,
      isReturn: true,
      returnQuantity: 1,
      returnVariantQuantities: { Red: { S: 1 } },
      returnReason: 'test',
    })
    const retRes = makeRes()
    await handlerOrders(retReq, retRes)
    expect(retRes.statusCode).toBe(200)

    const { data: siAfterRet } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('quantity_remaining').eq('store_id', storeId).single()
    expect(num(siAfterRet!.quantity_remaining)).toBe(4)

    const delReq = makeReq('DELETE', { id: oid })
    const delRes = makeRes()
    await handlerOrders(delReq, delRes)
    expect(delRes.statusCode).toBe(200)
    expect(delRes.data.success).toBe(true)

    const { data: gone } = await supabaseAdmin
      .from(TABLES.ORDERS).select('id').eq('id', oid).maybeSingle()
    expect(gone).toBeNull()

    const { data: siFinal } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('quantity_remaining').eq('store_id', storeId).single()
    expect(num(siFinal!.quantity_remaining)).toBe(6)

    const { data: invFinal } = await supabaseAdmin
      .from(TABLES.INVENTORY).select('quantity_available').eq('id', invId).single()
    expect(num(invFinal!.quantity_available)).toBe(4)

    await cleanupStore(storeId)
    await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', invId)
  })

  test('delete a sale in a payout returns 409', async () => {
    const storeName = 'Del03-' + NOW
    const storeId = await createStore(storeName)

    const { data: inv } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .insert({
        product_id: productId,
        batch_number: 'BATCH-DEL03-' + Date.now(),
        cost_price: COST,
        selling_price: PRICE,
        quantity_available: 10,
        size_quantities: { S: 3, M: 4, L: 3 },
        color_quantities: { Red: 5, Blue: 5 },
        variant_quantities: { Red: { S: 2, M: 2, L: 1 }, Blue: { S: 1, M: 2, L: 2 } },
        owner: 'testadmin',
        low_stock_warning: 0,
      })
      .select('id, batch_number')
      .single()
    if (!inv) throw new Error('Inv insert failed')
    const invId = inv.id
    const batchNumber = inv.batch_number

    await allot(storeName, batchNumber)
    const { id: oid } = await sell(storeName)

    await supabaseAdmin
      .from(TABLES.ORDERS)
      .update({ included_in_payout: true })
      .eq('id', oid)

    const delReq = makeReq('DELETE', { id: oid })
    const delRes = makeRes()
    await handlerOrders(delReq, delRes)
    expect(delRes.statusCode).toBe(409)
    expect(delRes.data.error).toContain('payout')

    await supabaseAdmin
      .from(TABLES.ORDERS)
      .update({ included_in_payout: false })
      .eq('id', oid)

    await cleanupStore(storeId)
    await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', invId)
  })
})
