// Regression tests for inventory/payout edge cases and fixed code paths
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

const PRICE = 500
const COST = 300
const COMMISSION_PCT = 10

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function safeDelete(table: string, field: string, id: string) {
  try {
    await supabaseAdmin.from(table).delete().eq(field, id)
  } catch {
    // ignore
  }
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

async function createProduct(name: string): Promise<string> {
  const { data: p } = await supabaseAdmin
    .from(TABLES.PRODUCTS)
    .insert({
      product_name: name,
      brand_name: 'TestBrand',
      product_type: 'Shirt',
      price_per_piece: PRICE,
      colors: ['Red', 'Blue'],
      sizes: ['S', 'M', 'L'],
    })
    .select('id')
    .single()
  if (!p) throw new Error(`Product insert failed for ${name}`)
  return p.id
}

async function createInventory(productId: string): Promise<{ id: string; batch: string }> {
  const bn = 'BATCH-REG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
  const { data: inv } = await supabaseAdmin
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
  if (!inv) throw new Error('Inventory insert failed')
  return { id: inv.id, batch: inv.batch_number }
}

async function createStore(name: string): Promise<{ id: string; name: string }> {
  const { data: s } = await supabaseAdmin
    .from(TABLES.STORES)
    .insert({ name, commission: COMMISSION_PCT, paid_amount: 0, paid: false })
    .select('id, name')
    .single()
  if (!s) throw new Error('Store insert failed')
  return { id: s.id, name: s.name }
}

async function allot(storeName: string, batchNumber: string): Promise<string> {
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
  expect(res.statusCode).toBe(201)
  return res.data.id
}

async function sell(name: string, storeName: string, variantMap: Record<string, Record<string, number>>): Promise<string> {
  const req = makeReq('POST', {
    productName: 'REG-' + name,
    brandName: 'TestBrand',
    productType: 'Shirt',
    quantity: 2,
    variantQuantities: variantMap,
    sellingPrice: PRICE,
    shipmentCost: 0,
    extraCharges: 0,
    clientName: 'Reg Client',
    storeName,
  })
  const res = makeRes()
  await handlerOrders(req, res)
  expect(res.statusCode).toBe(201)
  return res.data.orderId
}

async function doReturn(orderId: string, qty: number, variants: Record<string, Record<string, number>>): Promise<any> {
  const req = makeReq('PATCH', {
    id: orderId,
    isReturn: true,
    returnQuantity: qty,
    returnVariantQuantities: variants,
    returnReason: 'Test return',
  })
  const res = makeRes()
  await handlerOrders(req, res)
  return res
}

async function doRefund(orderId: string, qty: number, variants: Record<string, Record<string, number>>): Promise<any> {
  const req = makeReq('PATCH', {
    id: orderId,
    isRefund: true,
    refundQuantity: qty,
    refundVariantQuantities: variants,
    refundReason: 'Test refund',
  })
  const res = makeRes()
  await handlerOrders(req, res)
  return res
}

async function cleanupAll(storeId: string, productName: string) {
  const { data: orders } = await supabaseAdmin.from(TABLES.ORDERS).select('id, store_id').eq('store_id', storeId)
  for (const o of orders || []) {
    await supabaseAdmin.from(TABLES.ORDERS).delete().eq('id', o.id)
  }
  const { data: siRows } = await supabaseAdmin.from(TABLES.STORE_INVENTORY).select('id').eq('store_id', storeId)
  for (const si of siRows || []) {
    await supabaseAdmin.from(TABLES.STORE_INVENTORY).delete().eq('id', si.id)
  }
  await supabaseAdmin.from(TABLES.STORES).delete().eq('id', storeId)
  const { data: p } = await supabaseAdmin.from(TABLES.PRODUCTS).select('id').eq('product_name', productName).single()
  if (p) {
    const { data: inv } = await supabaseAdmin.from(TABLES.INVENTORY).select('id').eq('product_id', p.id).single()
    if (inv) await safeDelete(TABLES.INVENTORY, 'id', inv.id)
    await safeDelete(TABLES.PRODUCTS, 'id', p.id)
  }
}

async function freshSetup(prefix: string): Promise<{ productName: string; storeName: string; storeId: string }> {
  const productName = `REG-${prefix}-${Date.now()}`
  const productId = await createProduct(productName)
  const inv = await createInventory(productId)
  const store = await createStore(`REG-${prefix}-${Date.now()}`)
  await allot(store.name, inv.batch)
  return { productName, storeName: store.name, storeId: store.id }
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite F: PATCH commissionPercent regression
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH commissionPercent regression', () => {
  test('F1: commission update before return uses full qty', async () => {
    const ctx = await freshSetup('F1')
    const orderId = await sell('F1', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })

    const req = makeReq('PATCH', { id: orderId, commissionPercent: 20 })
    const res = makeRes()
    await handlerOrders(req, res)
    expect(res.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('profit, commission_amount, admin_take').eq('id', orderId).single()
    const gross = PRICE * 2
    const received = gross
    const commission = Math.round(received * 20) / 100
    const adminTake = received - commission
    const profit = adminTake - COST * 2
    expect(num(order!.commission_amount)).toBeCloseTo(commission)
    expect(num(order!.admin_take)).toBeCloseTo(adminTake)
    expect(num(order!.profit)).toBeCloseTo(profit)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('F2: commission update after partial return uses remaining qty', async () => {
    const ctx = await freshSetup('F2')
    const orderId = await sell('F2', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    await doReturn(orderId, 1, { Red: { S: 1 } })

    const req = makeReq('PATCH', { id: orderId, commissionPercent: 20 })
    const res = makeRes()
    await handlerOrders(req, res)
    expect(res.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('profit, commission_amount, admin_take').eq('id', orderId).single()
    const gross = PRICE * 1
    const received = gross
    const commission = Math.round(received * 20) / 100
    const adminTake = received - commission
    const profit = adminTake - COST * 1
    expect(num(order!.commission_amount)).toBeCloseTo(commission)
    expect(num(order!.admin_take)).toBeCloseTo(adminTake)
    expect(num(order!.profit)).toBeCloseTo(profit)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('F3: commission update after partial refund uses remaining qty', async () => {
    const ctx = await freshSetup('F3')
    const orderId = await sell('F3', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    await doRefund(orderId, 1, { Red: { S: 1 } })

    const req = makeReq('PATCH', { id: orderId, commissionPercent: 20 })
    const res = makeRes()
    await handlerOrders(req, res)
    expect(res.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('profit, commission_amount, admin_take').eq('id', orderId).single()
    const gross = PRICE * 1
    const received = gross
    const commission = Math.round(received * 20) / 100
    const adminTake = received - commission
    const profit = adminTake - COST * 2
    expect(num(order!.commission_amount)).toBeCloseTo(commission)
    expect(num(order!.admin_take)).toBeCloseTo(adminTake)
    expect(num(order!.profit)).toBeCloseTo(profit)
    await cleanupAll(ctx.storeId, ctx.productName)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Suite G: Payout inclusion edge cases
// ══════════════════════════════════════════════════════════════════════════════
describe('Payout inclusion edge cases', () => {
  test('G1: return still allowed on order included in payout', async () => {
    const ctx = await freshSetup('G1')
    const orderId = await sell('G1', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })

    await supabaseAdmin.from(TABLES.ORDERS).update({ included_in_payout: true }).eq('id', orderId)

    const res = await doReturn(orderId, 1, { Red: { S: 1 } })
    expect(res.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('return_quantity, profit').eq('id', orderId).single()
    expect(num(order!.return_quantity)).toBe(1)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('G2: refund still allowed on order included in payout', async () => {
    const ctx = await freshSetup('G2')
    const orderId = await sell('G2', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })

    await supabaseAdmin.from(TABLES.ORDERS).update({ included_in_payout: true }).eq('id', orderId)

    const res = await doRefund(orderId, 1, { Red: { S: 1 } })
    expect(res.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('refund_quantity, profit').eq('id', orderId).single()
    expect(num(order!.refund_quantity)).toBe(1)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('G3: delete blocked on order included in payout', async () => {
    const ctx = await freshSetup('G3')
    const orderId = await sell('G3', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })

    await supabaseAdmin.from(TABLES.ORDERS).update({ included_in_payout: true }).eq('id', orderId)

    const delReq = makeReq('DELETE', { id: orderId })
    const delRes = makeRes()
    await handlerOrders(delReq, delRes)
    expect(delRes.statusCode).toBe(409)
    expect(delRes.data.error).toContain('payout')
    await cleanupAll(ctx.storeId, ctx.productName)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Suite H: Order creation variant-row consistency regression
// ══════════════════════════════════════════════════════════════════════════════
describe('Order creation variant-row consistency', () => {
  test('H1: sale with variants decrements both qty and variant breakdown on single row', async () => {
    const productName = uniqueName('H1')
    const productId = await createProduct(productName)
    const { batch } = await createInventory(productId)
    const storeName = uniqueName('H1')
    const store = await createStore(storeName)
    const storeInventoryId = await allot(storeName, batch)

    const req = makeReq('POST', {
      productName,
      brandName: 'TestBrand',
      productType: 'Shirt',
      quantity: 2,
      variantQuantities: { Red: { S: 1 }, Blue: { S: 1 } },
      sellingPrice: PRICE,
      shipmentCost: 0,
      extraCharges: 0,
      clientName: 'H1 Client',
      storeName,
    })
    const res = makeRes()
    await handlerOrders(req, res)
    expect(res.statusCode).toBe(201)

    const { data: si } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining, variant_quantities_remaining').eq('id', storeInventoryId).single()
    expect(num(si!.quantity_remaining)).toBe(4)
    expect(num((si!.variant_quantities_remaining as any)?.['Red']?.['S'])).toBe(0)
    expect(num((si!.variant_quantities_remaining as any)?.['Blue']?.['S'])).toBe(0)

    await cleanupAll(store.id, productName)
  })
})
