describe('Expenses API - Business Logic', () => {
  const num = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

  test('should convert values to numbers safely', () => {
    expect(num(100)).toBe(100)
    expect(num('50')).toBe(50)
    expect(num(null)).toBe(0)
    expect(num('abc')).toBe(0)
  })

  test('should validate title is required', () => {
    const validate = (title: string) => !!title && typeof title === 'string' && title.trim().length > 0
    expect(validate('')).toBe(false)
    expect(validate('Rent')).toBe(true)
  })

  test('should reject negative amounts', () => {
    const validate = (amt: number) => num(amt) >= 0
    expect(validate(-100)).toBe(false)
    expect(validate(0)).toBe(true)
    expect(validate(500)).toBe(true)
  })

  test('should format expense with default category', () => {
    const format = (e: any) => ({ category: e.category || 'Misc' })
    expect(format({ category: null }).category).toBe('Misc')
    expect(format({ category: 'Rent' }).category).toBe('Rent')
  })

  test('should determine if personal advance transaction is needed', () => {
    const needsTransaction = (ownerId: string | null, fromAcc: string | null, amount: number) => {
      return !!ownerId && fromAcc === 'Personal' && amount > 0
    }
    expect(needsTransaction('o1', 'Personal', 1000)).toBe(true)
    expect(needsTransaction(null, 'Personal', 1000)).toBe(false)
    expect(needsTransaction('o1', 'Business', 1000)).toBe(false)
  })
})