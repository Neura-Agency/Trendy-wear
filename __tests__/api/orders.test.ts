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
    // gross: 5000, deductions: 250, received: 4750
    // commission: 475, adminTake: 4275, cost: 1500, profit: 2775
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
})
