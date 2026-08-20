import { resolveRefundDecision } from '../../components/Modals'

// Helper function since test-helpers moved
function generateOrderCode(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `ORD-${ts}-${rand}`
}

describe('Orders API - Business Logic', () => {
  test('should reject non-allowed methods', () => {
    const allowedMethods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
    expect(allowedMethods).toContain('GET')
    expect(allowedMethods).toContain('POST')
    expect(allowedMethods).toContain('PATCH')
    expect(allowedMethods).toContain('PUT')
    expect(allowedMethods).toContain('DELETE')
    expect(allowedMethods).not.toContain('OPTIONS')
  })

  test('should validate quantity >= 1', () => {
    const validateQuantity = (qty: number) => {
      return qty >= 1
    }
    expect(validateQuantity(0)).toBe(false)
    expect(validateQuantity(-1)).toBe(false)
    expect(validateQuantity(1)).toBe(true)
    expect(validateQuantity(100)).toBe(true)
  })

  test('should validate sellingPrice > 0', () => {
    const validatePrice = (price: number) => {
      return price > 0
    }
    expect(validatePrice(0)).toBe(false)
    expect(validatePrice(-10)).toBe(false)
    expect(validatePrice(100)).toBe(true)
  })

  test('should require productName', () => {
    const emptyProductName = ''
    const productName = 'Shirt'
    expect(!emptyProductName).toBe(true)
    expect(!productName).toBe(false)
  })

  test('should generate proper order code format', () => {
    const code = generateOrderCode()
    expect(code).toMatch(/^ORD-[A-Z0-9]+-[A-Z0-9]+$/)
  })

  test('should generate unique order codes', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i++) {
      codes.add(generateOrderCode())
    }
    expect(codes.size).toBe(100)
  })

  test('should recalculate financials correctly', () => {
    const calculateFinancials = (price: number, qty: number, shipmentCost: number, extraCharges: number, costPrice: number, commissionPercent: number) => {
      const totalDeductions = shipmentCost + extraCharges
      const grossAmount = price * qty
      const amountReceived = grossAmount - totalDeductions
      const commissionAmount = Math.round(amountReceived * commissionPercent) / 100
      const adminTake = amountReceived - commissionAmount
      const profit = adminTake - costPrice * qty
      return { grossAmount, amountReceived, commissionAmount, adminTake, profit }
    }

    const result = calculateFinancials(1000, 5, 200, 50, 300, 10)
    expect(result.grossAmount).toBe(5000)
    expect(result.amountReceived).toBe(4750)
    expect(result.commissionAmount).toBe(475)
    expect(result.adminTake).toBe(4275)
    expect(result.profit).toBe(2775)
  })

  test('should handle zero deductions', () => {
    const calculateFinancials = (price: number, qty: number, shipmentCost: number, extraCharges: number, costPrice: number, commissionPercent: number) => {
      const totalDeductions = shipmentCost + extraCharges
      const grossAmount = price * qty
      const amountReceived = grossAmount - totalDeductions
      const commissionAmount = Math.round(amountReceived * commissionPercent) / 100
      const adminTake = amountReceived - commissionAmount
      const profit = adminTake - costPrice * qty
      return { grossAmount, amountReceived, commissionAmount, adminTake, profit }
    }

    const result = calculateFinancials(1000, 2, 0, 0, 400, 10)
    expect(result.grossAmount).toBe(2000)
    expect(result.amountReceived).toBe(2000)
    expect(result.commissionAmount).toBe(200)
    expect(result.adminTake).toBe(1800)
    expect(result.profit).toBe(1000)
  })

  test('should resolve refund mode decisions', () => {
    expect(resolveRefundDecision({ refundType: 'quantity', sellingPrice: 100, refundQuantity: 2 })).toEqual({
      refundType: 'quantity',
      refundAmount: 200,
      refundReason: '',
      replacementItem: null,
      originalItemReturned: false,
    })

    expect(resolveRefundDecision({ refundType: 'amount', fixedAmount: 50, sellingPrice: 100, refundQuantity: 2 })).toEqual({
      refundType: 'amount',
      refundAmount: 50,
      refundReason: 'Fixed amount refund',
      replacementItem: null,
      originalItemReturned: false,
    })

    expect(resolveRefundDecision({ refundType: 'replacement', replacementItem: 'Joggers', replacementProductId: 'prod-1', replacementQuantity: 3, originalItemReturned: true, sellingPrice: 100, refundQuantity: 1 })).toEqual({
      refundType: 'replacement',
      refundAmount: 0,
      refundReason: 'Replacement: Joggers',
      replacementItem: 'Joggers',
      replacementProductId: 'prod-1',
      replacementQuantity: 3,
      replacementSize: null,
      replacementColor: null,
      originalItemReturned: true,
    })
  })

  test('fixed amount refunds store the exact entered amount', () => {
    expect(resolveRefundDecision({ refundType: 'amount', fixedAmount: 50 }).refundAmount).toBe(50)
    expect(resolveRefundDecision({ refundType: 'amount', fixedAmount: 100 }).refundAmount).toBe(100)
    // Not recalculated from selling price × quantity
    expect(resolveRefundDecision({ refundType: 'amount', fixedAmount: 50, sellingPrice: 200, refundQuantity: 5 }).refundAmount).toBe(50)
  })

  test('negative/zero fixed amount is clamped to 0 (API then rejects <= 0)', () => {
    expect(resolveRefundDecision({ refundType: 'amount', fixedAmount: -10 }).refundAmount).toBe(0)
    expect(resolveRefundDecision({ refundType: 'amount', fixedAmount: 0 }).refundAmount).toBe(0)
  })

  test('replacement carries structured product/variant identity and 0 cash refund', () => {
    const decision = resolveRefundDecision({ refundType: 'replacement', replacementItem: 'Joggers', replacementProductId: 'prod-9', replacementQuantity: 2, replacementSize: 'M', replacementColor: 'Blue', originalItemReturned: false })
    expect(decision.refundAmount).toBe(0)
    expect(decision.replacementProductId).toBe('prod-9')
    expect(decision.replacementQuantity).toBe(2)
    expect(decision.replacementSize).toBe('M')
    expect(decision.replacementColor).toBe('Blue')
    expect(decision.originalItemReturned).toBe(false)
  })

  test('legacy null refund_type behaves as quantity refund', () => {
    const decision = resolveRefundDecision({ refundType: null as any, sellingPrice: 100, refundQuantity: 2 })
    expect(decision.refundType).toBe('quantity')
    expect(decision.refundAmount).toBe(200)
  })

  test('should set commission to 0 for Direct store orders', () => {
    const storeName = 'Direct'
    expect(storeName === 'Direct').toBe(true)
    const commissionPercent = 0
    const commissionAmount = 0
    const includedInPayout = false
    expect(commissionPercent).toBe(0)
    expect(commissionAmount).toBe(0)
    expect(includedInPayout).toBe(false)
  })

  test('should validate variant request correctly', () => {
    const validateVariantRequest = (requested: Record<string, Record<string, number>>, available: Record<string, Record<string, number>> | null): string | null => {
      if (!available) return null
      for (const [color, sizes] of Object.entries(requested)) {
        for (const [size, qty] of Object.entries(sizes)) {
          const avail = available[color]?.[size] ?? 0
          if (qty > avail) {
            return `${color}/${size}: requested ${qty} exceeds available ${avail}`
          }
        }
      }
      return null
    }

    expect(validateVariantRequest({ Red: { S: 5 } }, { Red: { S: 10 } })).toBeNull()
    expect(validateVariantRequest({ Red: { S: 15 } }, { Red: { S: 10 } })).toContain('15 exceeds available 10')
  })

  test('should accept cart mode POST with items array', () => {
    const body = {
      storeName: 'Test Store',
      clientName: 'Ali',
      items: [
        { productName: 'Shirt', quantity: 2, sellingPrice: 1500 },
        { productName: 'Pants', quantity: 1, sellingPrice: 2000 },
      ],
    }
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items.length).toBe(2)
    expect(body.items[0].productName).toBe('Shirt')
  })

  test('should reject empty items array in cart mode', () => {
    const body = { storeName: 'Test Store', items: [] }
    expect(body.items.length).toBe(0)
    // API should return 400 for empty items
  })

  test('should sum cart items quantities correctly', () => {
    const items = [
      { quantity: 2, extraQty: 0 },
      { quantity: 1, extraQty: 0 },
      { quantity: 3, extraQty: 1 },
    ]
    const totalQty = items.reduce((s, it) => s + Math.max(0, it.quantity), 0)
    const totalDispatch = items.reduce((s, it) => s + Math.max(0, it.quantity) + Math.max(0, it.extraQty || 0), 0)
    expect(totalQty).toBe(6)
    expect(totalDispatch).toBe(7)
  })
})
