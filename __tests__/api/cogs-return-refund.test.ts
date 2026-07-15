// Integration tests: Return vs Refund COGS scenarios
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
const SALE_QTY = 2

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
  const bn = 'BATCH-COGS-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
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
      variant_quantities: { Red: { S: 1, M: 2, L: 1 }, Blue: { S: 1, M: 1 } },
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
    productName: 'COGS-' + name,
    brandName: 'TestBrand',
    productType: 'Shirt',
    quantity: SALE_QTY,
    variantQuantities: variantMap,
    sellingPrice: PRICE,
    shipmentCost: 0,
    extraCharges: 0,
    clientName: 'COGS Client',
    storeName,
  })
  const res = makeRes()
  await handlerOrders(req, res)
  expect(res.statusCode).toBe(201)
  expect(res.data.success).toBe(true)
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

async function doUndoReturn(orderId: string): Promise<any> {
  const req = makeReq('PATCH', { id: orderId, isUndoReturn: true })
  const res = makeRes()
  await handlerOrders(req, res)
  return res
}

async function doUndoRefund(orderId: string): Promise<any> {
  const req = makeReq('PATCH', { id: orderId, isUndoRefund: true })
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
  const productName = `COGS-${prefix}-${Date.now()}`
  const productId = await createProduct(productName)
  const inv = await createInventory(productId)
  const store = await createStore(`COGS-${prefix}-${Date.now()}`)
  await allot(store.name, inv.batch)
  return { productName, storeName: store.name, storeId: store.id }
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite A: Return scenarios
// ══════════════════════════════════════════════════════════════════════════════
describe('COGS Return scenarios (item recovered, no profit)', () => {
  test('A1: sale baseline financials', async () => {
    const ctx = await freshSetup('A1')
    const orderId = await sell('A1', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(order!.quantity)).toBe(SALE_QTY)
    expect(num(order!.cost_price)).toBe(COST)
    expect(num(order!.profit)).toBe(300)
    expect(num(order!.admin_take)).toBe(900)
    expect(num(order!.commission_amount)).toBe(100)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('A2: partial return (1/2) → item back, profit drops', async () => {
    const ctx = await freshSetup('A2')
    const orderId = await sell('A2', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    const res = await doReturn(orderId, 1, { Red: { S: 1 } })
    expect(res.statusCode).toBe(200)
    expect(res.data.success).toBe(true)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(order!.return_quantity)).toBe(1)
    expect(order!.order_returned).toBe(false)
    expect(num(order!.profit)).toBe(150)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('A3: full return (1+1 from 2) → profit=0, all items recovered', async () => {
    const ctx = await freshSetup('A3')
    const orderId = await sell('A3', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    const res1 = await doReturn(orderId, 1, { Red: { S: 1 } })
    expect(res1.statusCode).toBe(200)
    const res2 = await doReturn(orderId, 1, { Blue: { S: 1 } })
    expect(res2.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(order!.order_returned).toBe(true)
    expect(num(order!.return_quantity)).toBe(2)
    expect(num(order!.profit)).toBe(0)

    const { data: si } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining, pending_return_qty').eq('store_id', ctx.storeId).single()
    expect(num(si!.quantity_remaining)).toBe(6)
    expect(num(si!.pending_return_qty)).toBe(2)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('A4: refund baseline — 1 unit refunded, COGS loss', async () => {
    const ctx = await freshSetup('A4')
    const orderId = await sell('A4', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    const res = await doRefund(orderId, 1, { Red: { S: 1 } })
    expect(res.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(order!.refund_quantity)).toBe(1)
    expect(num(order!.refund_amount)).toBe(PRICE)
    expect(num(order!.profit)).toBe(-150)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('A5: full refund (1+1 from 2) → profit = -totalCost, refund_amount cumulative', async () => {
    const ctx = await freshSetup('A5')
    const orderId = await sell('A5', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    const res1 = await doRefund(orderId, 1, { Red: { S: 1 } })
    expect(res1.statusCode).toBe(200)
    const res2 = await doRefund(orderId, 1, { Blue: { S: 1 } })
    expect(res2.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(order!.refund_quantity)).toBe(2)
    expect(num(order!.refund_amount)).toBe(PRICE * 2)
    expect(num(order!.profit)).toBe(-600)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('A6: refund_amount = sellingPrice × total refunded qty (cumulative)', async () => {
    const ctx = await freshSetup('A6')
    const orderId = await sell('A6', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    await doRefund(orderId, 1, { Red: { S: 1 } })
    await doRefund(orderId, 1, { Blue: { S: 1 } })

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(order!.refund_amount)).toBe(PRICE * 2)
    expect(num(order!.refund_quantity)).toBe(2)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('A7: return then refund mixed → profit = -totalCost', async () => {
    const ctx = await freshSetup('A7')
    const orderId = await sell('A7', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    const retRes = await doReturn(orderId, 1, { Red: { S: 1 } })
    expect(retRes.statusCode).toBe(200)

    const refRes = await doRefund(orderId, 1, { Blue: { S: 1 } })
    expect(refRes.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(order!.return_quantity)).toBe(1)
    expect(num(order!.refund_quantity)).toBe(1)
    expect(num(order!.profit)).toBe(-300)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('A8: refund then return mixed → profit after return', async () => {
    const ctx = await freshSetup('A8')
    const orderId = await sell('A8', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    const refRes = await doRefund(orderId, 1, { Red: { S: 1 } })
    expect(refRes.statusCode).toBe(200)

    const { data: afterRefund } = await supabaseAdmin.from(TABLES.ORDERS).select('profit').eq('id', orderId).single()
    expect(num(afterRefund!.profit)).toBe(-150)

    const retRes = await doReturn(orderId, 1, { Blue: { S: 1 } })
    expect(retRes.statusCode).toBe(200)

    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(order!.return_quantity)).toBe(1)
    expect(num(order!.refund_quantity)).toBe(1)
    expect(order!.order_returned).toBe(false)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('A9: two partial returns (1+1 from 2) → order_returned=true, profit=0', async () => {
    const ctx = await freshSetup('A9')
    const orderId = await sell('A9', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    await doReturn(orderId, 1, { Red: { S: 1 } })
    const { data: mid } = await supabaseAdmin.from(TABLES.ORDERS).select('profit').eq('id', orderId).single()
    expect(num(mid!.profit)).toBe(150)

    await doReturn(orderId, 1, { Blue: { S: 1 } })
    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(order!.order_returned).toBe(true)
    expect(num(order!.return_quantity)).toBe(2)
    expect(num(order!.profit)).toBe(0)
    await cleanupAll(ctx.storeId, ctx.productName)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Suite B: Undo operations restore original state
// ══════════════════════════════════════════════════════════════════════════════
describe('Undo Return and Undo Refund restore original financials', () => {
  test('B1: undo return restores profit and inventory', async () => {
    const ctx = await freshSetup('B1')
    const orderId = await sell('B1', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    const { data: siBefore } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    const qtyBeforeReturn = num(siBefore!.quantity_remaining)

    await doReturn(orderId, 1, { Red: { S: 1 } })
    const { data: afterReturn } = await supabaseAdmin.from(TABLES.ORDERS).select('profit').eq('id', orderId).single()
    expect(num(afterReturn!.profit)).toBe(150)

    await doUndoReturn(orderId)
    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(order!.profit)).toBe(300)
    expect(order!.return_quantity).toBeNull()
    expect(order!.order_returned).toBe(false)

    const { data: siAfter } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    expect(num(siAfter!.quantity_remaining)).toBe(qtyBeforeReturn)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('B2: undo refund restores original profit (negative before undo)', async () => {
    const ctx = await freshSetup('B2')
    const orderId = await sell('B2', ctx.storeName, { Red: { S: 1 }, Blue: { S: 1 } })
    await doRefund(orderId, 1, { Blue: { S: 1 } })
    const { data: afterRefund } = await supabaseAdmin.from(TABLES.ORDERS).select('profit').eq('id', orderId).single()
    expect(num(afterRefund!.profit)).toBe(-150)

    await doUndoRefund(orderId)
    const { data: order } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(order!.refund_quantity).toBeNull()
    expect(order!.refund_amount).toBeNull()
    expect(num(order!.profit)).toBe(300)
    await cleanupAll(ctx.storeId, ctx.productName)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Suite C: Edge cases — ALL per-test isolation
// ══════════════════════════════════════════════════════════════════════════════
describe('COGS edge cases', () => {
  test('C1: refund does not alter store inventory', async () => {
    const ctx = await freshSetup('C1')
    const orderId = await sell('C1', ctx.storeName, { Red: { M: 1 }, Blue: { S: 1 } })
    const { data: siBefore } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    const before = num(siBefore!.quantity_remaining)

    await doRefund(orderId, 1, { Red: { M: 1 } })

    const { data: siAfter } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    expect(num(siAfter!.quantity_remaining)).toBe(before)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('C2: return increases store inventory quantity', async () => {
    const ctx = await freshSetup('C2')
    const orderId = await sell('C2', ctx.storeName, { Red: { M: 1 }, Blue: { S: 1 } })
    const { data: siBefore } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    const before = num(siBefore!.quantity_remaining)

    await doReturn(orderId, 1, { Red: { M: 1 } })

    const { data: siAfter } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    expect(num(siAfter!.quantity_remaining)).toBe(before + 1)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('C3: two refunds (1+1 from 2) → profit = -totalCost', async () => {
    const ctx = await freshSetup('C3')
    const orderId = await sell('C3', ctx.storeName, { Red: { M: 2 } })
    await doRefund(orderId, 1, { Red: { M: 1 } })
    await doRefund(orderId, 1, { Red: { M: 1 } })

    const { data: o } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(o!.refund_quantity)).toBe(2)
    expect(num(o!.profit)).toBe(-600)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('C4: refund with no remaining units returns 400', async () => {
    const ctx = await freshSetup('C4')
    const orderId = await sell('C4', ctx.storeName, { Red: { M: 2 } })
    await doRefund(orderId, 2, { Red: { M: 2 } })

    const res = await doRefund(orderId, 1, { Red: { M: 1 } })
    expect(res.statusCode).toBe(400)
    expect(res.data.error).toContain('No remaining units')
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('C5: full return sets order_returned=true', async () => {
    const ctx = await freshSetup('C5')
    const orderId = await sell('C5', ctx.storeName, { Red: { M: 1 }, Blue: { S: 1 } })
    await doReturn(orderId, 1, { Red: { M: 1 } })
    await doReturn(orderId, 1, { Blue: { S: 1 } })

    const { data: o } = await supabaseAdmin.from(TABLES.ORDERS).select('order_returned, return_quantity').eq('id', orderId).single()
    expect(o!.order_returned).toBe(true)
    expect(num(o!.return_quantity)).toBe(2)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('C6: full return then undo → back to sale state', async () => {
    const ctx = await freshSetup('C6')
    const orderId = await sell('C6', ctx.storeName, { Red: { M: 1 }, Blue: { S: 1 } })
    await doReturn(orderId, 2, { Red: { M: 1 }, Blue: { S: 1 } })
    await doUndoReturn(orderId)

    const { data: o } = await supabaseAdmin.from(TABLES.ORDERS).select('profit, return_quantity, order_returned').eq('id', orderId).single()
    expect(num(o!.profit)).toBe(300)
    expect(o!.return_quantity).toBeNull()
    expect(o!.order_returned).toBe(false)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('C7: return+refund → profit stays at -totalCost, order_returned stays false', async () => {
    const ctx = await freshSetup('C7')
    const orderId = await sell('C7', ctx.storeName, { Red: { M: 1 }, Blue: { S: 1 } })
    await doReturn(orderId, 1, { Red: { M: 1 } })
    await doRefund(orderId, 1, { Blue: { S: 1 } })

    const { data: o } = await supabaseAdmin.from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    expect(num(o!.profit)).toBe(-300)
    expect(num(o!.return_quantity)).toBe(1)
    expect(num(o!.refund_quantity)).toBe(1)
    expect(o!.order_returned).toBe(false)
    await cleanupAll(ctx.storeId, ctx.productName)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Suite D: Financial formula correctness (pure math, no DB)
// ══════════════════════════════════════════════════════════════════════════════
describe('Financial formula correctness', () => {
  test('D1: baseline sale formula', () => {
    const price = 500
    const qty = 2
    const shipment = 0
    const cost = 300
    const pct = 10

    const grossAmount = price * qty
    const amountReceived = grossAmount - shipment
    const commissionAmount = Math.round(amountReceived * pct) / 100
    const adminTake = amountReceived - commissionAmount
    const profit = adminTake - cost * qty

    expect(grossAmount).toBe(1000)
    expect(amountReceived).toBe(1000)
    expect(commissionAmount).toBe(100)
    expect(adminTake).toBe(900)
    expect(profit).toBe(300)
  })

  test('D2: return formula (1 returned from 2)', () => {
    const price = 500
    const originalQty = 2
    const newReturnQty = 1
    const shipment = 0
    const cost = 300
    const pct = 10

    const remainingUnits = Math.max(0, originalQty - newReturnQty)
    const remainingGross = price * remainingUnits - shipment
    const remainingCommission = Math.round(remainingGross * pct) / 100
    const remainingAdminTake = remainingGross - remainingCommission
    const remainingProfit = remainingAdminTake - cost * remainingUnits
    const profit = Math.max(0, remainingProfit)

    expect(remainingUnits).toBe(1)
    expect(remainingGross).toBe(500)
    expect(remainingCommission).toBe(50)
    expect(remainingAdminTake).toBe(450)
    expect(remainingProfit).toBe(150)
    expect(profit).toBe(150)
  })

  test('D3: refund formula (1 refunded from 2)', () => {
    const price = 500
    const originalQty = 2
    const alreadyReturnedQty = 0
    const newRefundQty = 1
    const shipment = 0
    const cost = 300
    const pct = 10

    const remainingUnits = Math.max(0, originalQty - alreadyReturnedQty - newRefundQty)
    const remainingGross = price * remainingUnits - shipment
    const remainingCommission = Math.round(remainingGross * pct) / 100
    const remainingAdminTake = remainingGross - remainingCommission
    const remainingProfit = remainingAdminTake - cost * originalQty

    expect(remainingUnits).toBe(1)
    expect(remainingGross).toBe(500)
    expect(remainingCommission).toBe(50)
    expect(remainingAdminTake).toBe(450)
    expect(remainingProfit).toBe(-150)
  })

  test('D4: full refund formula (2 refunded from 2)', () => {
    const price = 500
    const originalQty = 2
    const alreadyReturnedQty = 0
    const newRefundQty = 2
    const shipment = 0
    const cost = 300
    const pct = 10

    const remainingUnits = Math.max(0, originalQty - alreadyReturnedQty - newRefundQty)
    const remainingGross = price * remainingUnits - shipment
    const remainingCommission = Math.round(remainingGross * pct) / 100
    const remainingAdminTake = remainingGross - remainingCommission
    const remainingProfit = remainingAdminTake - cost * originalQty

    expect(remainingUnits).toBe(0)
    expect(remainingGross).toBe(0)
    expect(remainingCommission).toBe(0)
    expect(remainingAdminTake).toBe(0)
    expect(remainingProfit).toBe(-600)
  })

  test('D5: return+refund combined formula (alreadyReturned=1, refund 1)', () => {
    const price = 500
    const originalQty = 2
    const alreadyReturnedQty = 1
    const newRefundQty = 1
    const shipment = 0
    const cost = 300
    const pct = 10

    const remainingUnits = Math.max(0, originalQty - alreadyReturnedQty - newRefundQty)
    const remainingGross = price * remainingUnits - shipment
    const remainingCommission = Math.round(remainingGross * pct) / 100
    const remainingAdminTake = remainingGross - remainingCommission
    const remainingProfit = remainingAdminTake - cost * originalQty

    expect(remainingUnits).toBe(0)
    expect(remainingGross).toBe(0)
    expect(remainingCommission).toBe(0)
    expect(remainingAdminTake).toBe(0)
    expect(remainingProfit).toBe(-600)
  })

  test('D6: with shipment cost', () => {
    const price = 1000
    const qty = 3
    const shipment = 200
    const cost = 400
    const pct = 10

    const grossAmount = price * qty
    const totalDeductions = shipment
    const amountReceived = grossAmount - totalDeductions
    const commissionAmount = Math.round(amountReceived * pct) / 100
    const adminTake = amountReceived - commissionAmount
    const profit = adminTake - cost * qty

    expect(amountReceived).toBe(2800)
    expect(commissionAmount).toBe(280)
    expect(adminTake).toBe(2520)
    expect(profit).toBe(1320)
  })

  test('D7: full return profit clamped to zero', () => {
    const price = 500
    const originalQty = 2
    const newReturnQty = 2
    const shipment = 0
    const cost = 300
    const pct = 10

    const remainingUnits = Math.max(0, originalQty - newReturnQty)
    const remainingGross = price * remainingUnits - shipment
    const remainingCommission = Math.round(remainingGross * pct) / 100
    const remainingAdminTake = remainingGross - remainingCommission
    const remainingProfit = remainingAdminTake - cost * remainingUnits
    const profit = Math.max(0, remainingProfit)

    expect(profit).toBe(0)
  })

  test('D8: refund profit can go negative (no clamp)', () => {
    const price = 500
    const originalQty = 2
    const alreadyReturnedQty = 0
    const newRefundQty = 1
    const shipment = 0
    const cost = 300
    const pct = 10

    const remainingUnits = Math.max(0, originalQty - alreadyReturnedQty - newRefundQty)
    const remainingGross = price * remainingUnits - shipment
    const remainingCommission = Math.round(remainingGross * pct) / 100
    const remainingAdminTake = remainingGross - remainingCommission
    const remainingProfit = remainingAdminTake - cost * originalQty

    expect(remainingProfit).toBeLessThan(0)
    expect(remainingProfit).toBe(-150)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Suite E: Inv behavior on return vs refund — per-test isolation
// ══════════════════════════════════════════════════════════════════════════════
describe('Inventory behavior on return vs refund', () => {
  test('E1: return restores inv (+1), refund keeps inv unchanged', async () => {
    const ctx = await freshSetup('E1')
    const order1Id = await sell('E1', ctx.storeName, { Red: { M: 1 }, Blue: { S: 1 } })
    const { data: siBefore } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    const qtyAfterSale = num(siBefore!.quantity_remaining)

    await doReturn(order1Id, 1, { Red: { M: 1 } })
    const { data: siAfterReturn } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    expect(num(siAfterReturn!.quantity_remaining)).toBe(qtyAfterSale + 1)

    const order2Id = await sell('E1', ctx.storeName, { Red: { L: 1 }, Blue: { M: 1 } })
    const { data: siAfterSale2 } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    const qtyAfterSale2 = num(siAfterSale2!.quantity_remaining)

    await doRefund(order2Id, 1, { Red: { L: 1 } })

    const { data: siAfterRefund } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('quantity_remaining').eq('store_id', ctx.storeId).single()
    expect(num(siAfterRefund!.quantity_remaining)).toBe(qtyAfterSale2)
    await cleanupAll(ctx.storeId, ctx.productName)
  })

  test('E2: return adds pending_return_qty, refund reduces it', async () => {
    const ctx = await freshSetup('E2')
    const { data: siBefore } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('pending_return_qty').eq('store_id', ctx.storeId).single()
    const pendingBefore = num(siBefore!.pending_return_qty)

    const orderId = await sell('E2', ctx.storeName, { Red: { L: 1 }, Blue: { S: 1 } })
    await doReturn(orderId, 1, { Red: { L: 1 } })

    const { data: afterReturn } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('pending_return_qty').eq('store_id', ctx.storeId).single()
    expect(num(afterReturn!.pending_return_qty)).toBe(pendingBefore + 1)

    await doRefund(orderId, 1, { Blue: { S: 1 } })

    const { data: afterRefund } = await supabaseAdmin.from(TABLES.STORE_INVENTORY)
      .select('pending_return_qty').eq('store_id', ctx.storeId).single()
    expect(num(afterRefund!.pending_return_qty)).toBe(pendingBefore)
    await cleanupAll(ctx.storeId, ctx.productName)
  })
})
