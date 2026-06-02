/**
 * Shared helpers module — re-exported for use across test files
 */

export function generateOrderCode(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `ORD-${ts}-${rand}`
}

describe('Helpers module', () => {
  test('should generate valid order code', () => {
    const code = generateOrderCode()
    expect(code).toMatch(/^ORD-[A-Z0-9]+-[A-Z0-9]+$/)
  })

  test('should generate unique codes', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 50; i++) {
      codes.add(generateOrderCode())
    }
    expect(codes.size).toBe(50)
  })
})