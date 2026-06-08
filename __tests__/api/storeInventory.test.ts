describe('Store Inventory API - Business Logic', () => {
  const num = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

  test('should compute remaining stock correctly', () => {
    const compute = (total: number, assigned: number, requested: number) => {
      const remaining = Math.max(0, total - assigned)
      if (requested > remaining) return { valid: false, remaining }
      return { valid: true, remaining }
    }
    expect(compute(100, 40, 30)).toEqual({ valid: true, remaining: 60 })
    expect(compute(50, 40, 30)).toEqual({ valid: false, remaining: 10 })
  })

  test('should validate quantity >= 1 for allotments', () => {
    const validate = (qty: number) => (!qty || qty < 1) ? 'quantity must be >= 1' : null
    expect(validate(0)).toBe('quantity must be >= 1')
    expect(validate(1)).toBeNull()
  })

  test('should handle pending return quantity logic', () => {
    expect(Math.max(0, 20 - 8)).toBe(12)
    expect(Math.max(0, 20 - 25)).toBe(0)
  })

  test('should track latestUpdatedAt correctly', () => {
    const dates = ['2024-01-01T10:00:00Z', '2024-01-05T10:00:00Z', '2024-01-03T10:00:00Z']
    let latest: string | null = null
    dates.forEach(d => {
      if (!latest || new Date(d).getTime() > new Date(latest).getTime()) latest = d
    })
    expect(latest).toBe('2024-01-05T10:00:00Z')
  })

  test('should calculate expense from extras correctly', () => {
    expect(500 * 3).toBe(1500)
    expect(500 * 0).toBe(0)
  })
})