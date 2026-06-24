/** @jest-environment node */
// Integration test: Inventory → Sale → Return → Refund → Undo Return → Undo Refund
// Uses real Supabase DB with mocked auth session.
// Goals:
// 1. Exercise full lifecycle end-to-end against actual API handlers
// 2. Verify invariants: no inventory loss on return, COGS loss on refund, financials reconcile
import type { NextApiRequest, NextApiResponse } from 'next'

// ── Mock auth layer ──────────────────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
let lastRes: any
function makeReq(method: string, body: any): NextApiRequest {
  return {
    method,
    body,
    headers: {},
  } as any
}
function makeRes(): NextApiResponse {
  lastRes = {
    statusCode: 200,
    data: null as any,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: any) {
      this.data = payload
      return this
    },
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
const SALE_QTY = 2
const TOTAL_ASSIGNED = 6 // from variant rollup: Red(S1,M2,L1)+Blue(S1,M1)

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

describe('Inventory lifecycle: allot → sale → return → refund → undo return → undo refund', () => {
  let productId: string
  let storeId: string
  let inventoryId: string
  let storeInventoryId: string
  let orderId: string
  const batchNumber = `BATCH-LIFECYCLE-${Date.now()}`
  const storeName = `Test Store ${NOW}`

  beforeAll(async () => {
    // ── Seed product ─────────────────────────────────────────────────────────
    const { data: product, error: productErr } = await supabaseAdmin
      .from(TABLES.PRODUCTS)
      .insert({
        product_name: `Test Product ${NOW}`,
        brand_name: 'TestBrand',
        product_type: 'Shirt',
        price_per_piece: PRICE,
        colors: ['Red', 'Blue'],
        sizes: ['S', 'M', 'L'],
      })
      .select('id')
      .single()
    if (productErr) throw new Error(`Product insert failed: ${productErr.message}`)
    productId = product!.id

    // ── Seed warehouse inventory batch ────────────────────────────────────────
    const { data: inv, error: invErr } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .insert({
        product_id: productId,
        batch_number: batchNumber,
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
    if (invErr) throw new Error(`Inventory insert failed: ${invErr.message}`)
    inventoryId = inv!.id

    // ── Seed store ────────────────────────────────────────────────────────────
    const { data: store, error: storeErr } = await supabaseAdmin
      .from(TABLES.STORES)
      .insert({
        name: storeName,
        commission: COMMISSION_PCT,
        paid_amount: 0,
        paid: false,
      })
      .select('id')
      .single()
    if (storeErr) throw new Error(`Store insert failed: ${storeErr.message}`)
    storeId = store!.id
  })

  afterAll(async () => {
    const { data: orders } = await supabaseAdmin
      .from(TABLES.ORDERS).select('id').eq('store_id', storeId)
    for (const o of orders || []) {
      await supabaseAdmin.from(TABLES.ORDERS).delete().eq('id', o.id)
    }
    const { data: si } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('id').eq('store_id', storeId)
    for (const r of si || []) {
      await supabaseAdmin.from(TABLES.STORE_INVENTORY).delete().eq('id', r.id)
    }
    await supabaseAdmin.from(TABLES.STORES).delete().eq('id', storeId)
    await supabaseAdmin.from(TABLES.INVENTORY).delete().eq('id', inventoryId)
    await supabaseAdmin.from(TABLES.PRODUCTS).delete().eq('id', productId)
  })

  test('1. Allot inventory to store', async () => {
    const res = makeRes()
    const req = makeReq('POST', {
      storeName,
      batchNumber,
      quantity: 5,
      variantQuantitiesAssigned: { Red: { S: 1, M: 2, L: 1 }, Blue: { S: 1, M: 1 } },
      ownerSupplyPrice: COST,
      commissionPercent: COMMISSION_PCT,
    })

    await handlerStoreInventory(req, res)
    console.log('Allot response:', res.statusCode, res.data)
    expect(res.statusCode).toBe(201)
    expect(res.data.success).toBe(true)
    storeInventoryId = res.data.id

    const { data: si } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('*').eq('id', storeInventoryId).single()
    console.log('Store inventory after allot:', si)
    expect(si!.quantity_assigned).toBe(TOTAL_ASSIGNED)
    expect(si!.quantity_remaining).toBe(TOTAL_ASSIGNED)
  })

  test('2. Record a sale (qty=2)', async () => {
    const res = makeRes()
    const req = makeReq('POST', {
      productId,
      productName: `Test Product ${NOW}`,
      brandName: 'TestBrand',
      productType: 'Shirt',
      quantity: SALE_QTY,
      variantQuantities: { Red: { S: 1, M: 1 }, Blue: { S: 1 } },
      sellingPrice: PRICE,
      shipmentCost: 0,
      extraCharges: 0,
      clientName: 'Test Client',
      storeName,
    })

    await handlerOrders(req, res)
    console.log('Sale response:', res.statusCode, res.data)
    expect(res.statusCode).toBe(201)
    expect(res.data.success).toBe(true)
    orderId = res.data.orderId

    const { data: order } = await supabaseAdmin
      .from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    console.log('Order after sale:', order)
    expect(order!.quantity).toBe(SALE_QTY)
    expect(num(order!.selling_price)).toBe(PRICE)
    expect(num(order!.cost_price)).toBe(COST)

    const { data: si } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('*').eq('id', storeInventoryId).single()
    console.log('Store inventory after sale:', si)
    expect(num(si!.quantity_remaining)).toBe(TOTAL_ASSIGNED - SALE_QTY)
  })

  test('3. Return 1 item from the sale', async () => {
    const res = makeRes()
    const req = makeReq('PATCH', {
      id: orderId,
      isReturn: true,
      returnQuantity: 1,
      returnVariantQuantities: { Red: { S: 1 } },
      returnReason: 'Customer changed mind',
    })

    await handlerOrders(req, res)
    console.log('Return response:', res.statusCode, res.data)
    expect(res.statusCode).toBe(200)
    expect(res.data.success).toBe(true)

    const { data: order } = await supabaseAdmin
      .from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    console.log('Order after return:', order)
    expect(num(order!.return_quantity)).toBe(1)
    expect(order!.order_returned).toBe(false) // partial return: explicitly false

    // Financials after return (1 of 2 returned, 1 remains)
    // remainingGross = 500*1 - 0 = 500
    // commission = 500*0.10 = 50
    // adminTake = 450
    // remainingProfit = adminTake - cost*remainingUnits = 450 - 300 = 150
    expect(num(order!.commission_amount)).toBe(50)
    expect(num(order!.admin_take)).toBe(450)
    expect(num(order!.profit)).toBe(150)

    const { data: si } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('*').eq('id', storeInventoryId).single()
    console.log('Store inventory after return:', si)
    // After sale remaining was 4, return restores 1 → 5
    expect(num(si!.quantity_remaining)).toBe(TOTAL_ASSIGNED - SALE_QTY + 1)
    expect(num(si!.pending_return_qty)).toBe(1)
  })

  test('4. Refund 1 item from the sale', async () => {
    const res = makeRes()
    const req = makeReq('PATCH', {
      id: orderId,
      isRefund: true,
      refundQuantity: 1,
      refundVariantQuantities: { Red: { M: 1 } },
      refundReason: 'Damaged item',
    })

    await handlerOrders(req, res)
    console.log('Refund response:', res.statusCode, res.data)
    expect(res.statusCode).toBe(200)
    expect(res.data.success).toBe(true)

    const { data: order } = await supabaseAdmin
      .from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    console.log('Order after refund:', order)
    expect(num(order!.refund_quantity)).toBe(1)
    expect(num(order!.refund_amount)).toBe(PRICE)
    // remainingUnits = 0, remainingGross = 0
    // commission = 0, adminTake = 0
    // remainingProfit = 0 - 300*2 = -600
    expect(num(order!.profit)).toBe(-600)
    expect(num(order!.admin_take)).toBe(0)
    expect(num(order!.commission_amount)).toBe(0)

    const { data: si } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('*').eq('id', storeInventoryId).single()
    console.log('Store inventory after refund:', si)
    // NO inventory change on refund
    expect(num(si!.quantity_remaining)).toBe(TOTAL_ASSIGNED - SALE_QTY + 1)
    expect(num(si!.pending_return_qty)).toBe(1) // unchanged
  })

  test('5. Undo the 1-item return', async () => {
    const res = makeRes()
    const req = makeReq('PATCH', {
      id: orderId,
      isUndoReturn: true,
    })

    await handlerOrders(req, res)
    console.log('Undo return response:', res.statusCode, res.data)
    expect(res.statusCode).toBe(200)
    expect(res.data.success).toBe(true)

    const { data: order } = await supabaseAdmin
      .from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    console.log('Order after undo return:', order)
    expect(order!.order_returned).toBe(false)
    expect(order!.return_quantity).toBeNull()
    // Refund of 1 unit still stands, so effectiveQty = 2 - 1 = 1
    // gross = 500*1 - 0 = 500, commission = 50, adminTake = 450, profit = 150
    expect(num(order!.profit)).toBe(150)
    expect(num(order!.admin_take)).toBe(450)
    expect(num(order!.commission_amount)).toBe(50)

    const { data: si } = await supabaseAdmin
      .from(TABLES.STORE_INVENTORY).select('*').eq('id', storeInventoryId).single()
    console.log('Store inventory after undo return:', si)
    expect(num(si!.quantity_remaining)).toBe(TOTAL_ASSIGNED - SALE_QTY)
    expect(num(si!.pending_return_qty)).toBe(0)
  })

  test('6. Undo the 1-item refund', async () => {
    const res = makeRes()
    const req = makeReq('PATCH', {
      id: orderId,
      isUndoRefund: true,
    })

    await handlerOrders(req, res)
    console.log('Undo refund response:', res.statusCode, res.data)
    expect(res.statusCode).toBe(200)
    expect(res.data.success).toBe(true)

    const { data: order } = await supabaseAdmin
      .from(TABLES.ORDERS).select('*').eq('id', orderId).single()
    console.log('Order after undo refund:', order)
    expect(order!.refund_quantity).toBeNull()
    expect(order!.refund_amount).toBeNull()
    // Back to original sale financials: 2 units, gross=1000, commission=100, adminTake=900, profit=300
    expect(num(order!.profit)).toBe(300)
    expect(num(order!.admin_take)).toBe(900)
    expect(num(order!.commission_amount)).toBe(100)
  })
})
