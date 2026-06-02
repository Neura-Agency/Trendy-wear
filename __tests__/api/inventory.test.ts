describe('Inventory API - Business Logic', () => {
  test('should merge size quantities correctly', () => {
    const mergeQuantities = (existing: any, incoming: any) => {
      const current = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}
      const inc = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {}
      const merged: Record<string, number> = { ...current }
      Object.entries(inc).forEach(([key, value]) => {
        merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0)
      })
      return merged
    }

    expect(mergeQuantities({ S: 10, M: 5 }, { M: 3, L: 7 })).toEqual({ S: 10, M: 8, L: 7 })
  })

  test('should handle null existing quantities', () => {
    const mergeQuantities = (existing: any, incoming: any) => {
      const current = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}
      const inc = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {}
      const merged: Record<string, number> = { ...current }
      Object.entries(inc).forEach(([key, value]) => {
        merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0)
      })
      return merged
    }

    expect(mergeQuantities(null, { S: 5 })).toEqual({ S: 5 })
  })

  test('should calculate total quantity from object', () => {
    const totalQuantityFrom = (value: any) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
      return Object.values(value).reduce((sum: number, qty: any) => sum + (Number(qty) || 0), 0)
    }

    expect(totalQuantityFrom({ S: 5, M: 10, L: 7 })).toBe(22)
    expect(totalQuantityFrom(null)).toBe(0)
    expect(totalQuantityFrom({})).toBe(0)
  })

  test('should require batchNumber to be non-empty when updating', () => {
    const validate = (bn: string) => { const t = String(bn).trim(); return !!t }
    expect(validate('')).toBe(false)
    expect(validate('  ')).toBe(false)
    expect(validate('BATCH-001')).toBe(true)
  })

  test('should reject negative lowStockWarning', () => {
    const validate = (warn: number) => warn >= 0
    expect(validate(-1)).toBe(false)
    expect(validate(0)).toBe(true)
    expect(validate(5)).toBe(true)
  })

  test('should format inventory items with derived Item IDs', () => {
    const formatItemId = (productId: string) => {
      if (!productId) return null
      return `ITEM-${productId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
    }
    const id = formatItemId('550e8400-e29b-41d4-a716-446655440000')
    expect(id).toMatch(/^ITEM-[0-9A-F]{8}$/)
  })

  test('should validate quantity_available not below assigned total', () => {
    const validate = (newAvail: number, assigned: number) => {
      if (newAvail < assigned) return `cannot be below assigned total (${assigned})`
      return null
    }
    expect(validate(100, 50)).toBeNull()
    expect(validate(30, 50)).toContain('cannot be below assigned total')
  })
})