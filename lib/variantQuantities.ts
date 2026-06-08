export type FlatQuantities = Record<string, number>
export type VariantQuantities = Record<string, FlatQuantities>

export function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function normalizeFlatQuantities(value: unknown): FlatQuantities | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const normalized: FlatQuantities = {}
  Object.entries(value as Record<string, unknown>).forEach(([key, qty]) => {
    const cleanKey = String(key).trim()
    if (!cleanKey) return
    normalized[cleanKey] = Math.max(0, toNumber(qty))
  })
  return Object.keys(normalized).length ? normalized : null
}

export function normalizeVariantQuantities(value: unknown): VariantQuantities | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const normalized: VariantQuantities = {}

  Object.entries(value as Record<string, unknown>).forEach(([color, sizes]) => {
    const cleanColor = String(color).trim()
    if (!cleanColor || !sizes || typeof sizes !== 'object' || Array.isArray(sizes)) return

    const normalizedSizes: FlatQuantities = {}
    Object.entries(sizes as Record<string, unknown>).forEach(([size, qty]) => {
      const cleanSize = String(size).trim()
      if (!cleanSize) return
      normalizedSizes[cleanSize] = Math.max(0, toNumber(qty))
    })

    if (Object.keys(normalizedSizes).length) normalized[cleanColor] = normalizedSizes
  })

  return Object.keys(normalized).length ? normalized : null
}

export function rollupVariantQuantities(value: unknown): {
  sizeQuantities: FlatQuantities | null
  colorQuantities: FlatQuantities | null
  total: number
} {
  const variants = normalizeVariantQuantities(value)
  if (!variants) return { sizeQuantities: null, colorQuantities: null, total: 0 }

  const sizeQuantities: FlatQuantities = {}
  const colorQuantities: FlatQuantities = {}
  let total = 0

  Object.entries(variants).forEach(([color, sizes]) => {
    Object.entries(sizes).forEach(([size, qty]) => {
      const n = Math.max(0, toNumber(qty))
      colorQuantities[color] = (colorQuantities[color] || 0) + n
      sizeQuantities[size] = (sizeQuantities[size] || 0) + n
      total += n
    })
  })

  return {
    sizeQuantities: Object.keys(sizeQuantities).length ? sizeQuantities : null,
    colorQuantities: Object.keys(colorQuantities).length ? colorQuantities : null,
    total,
  }
}

export function mergeVariantQuantities(existingValue: unknown, incomingValue: unknown): VariantQuantities | null {
  const existing = normalizeVariantQuantities(existingValue) || {}
  const incoming = normalizeVariantQuantities(incomingValue) || {}
  const merged: VariantQuantities = {}

  Object.entries(existing).forEach(([color, sizes]) => {
    merged[color] = { ...sizes }
  })

  Object.entries(incoming).forEach(([color, sizes]) => {
    if (!merged[color]) merged[color] = {}
    Object.entries(sizes).forEach(([size, qty]) => {
      merged[color][size] = (merged[color][size] || 0) + Math.max(0, toNumber(qty))
    })
  })

  return Object.keys(merged).length ? merged : null
}

export function adjustVariantQuantities(
  baseValue: unknown,
  deltaValue: unknown,
  direction: 1 | -1,
): VariantQuantities | null {
  const base = normalizeVariantQuantities(baseValue) || {}
  const delta = normalizeVariantQuantities(deltaValue) || {}
  const next: VariantQuantities = {}

  Object.entries(base).forEach(([color, sizes]) => {
    next[color] = { ...sizes }
  })

  Object.entries(delta).forEach(([color, sizes]) => {
    if (!next[color]) next[color] = {}
    Object.entries(sizes).forEach(([size, qty]) => {
      next[color][size] = Math.max(0, (next[color][size] || 0) + direction * Math.max(0, toNumber(qty)))
    })
  })

  Object.keys(next).forEach((color) => {
    Object.keys(next[color]).forEach((size) => {
      if (next[color][size] <= 0) delete next[color][size]
    })
    if (!Object.keys(next[color]).length) delete next[color]
  })

  return Object.keys(next).length ? next : null
}

export function validateVariantRequest(requestedValue: unknown, availableValue: unknown): string | null {
  const requested = normalizeVariantQuantities(requestedValue)
  if (!requested) return null
  const available = normalizeVariantQuantities(availableValue) || {}

  for (const [color, sizes] of Object.entries(requested)) {
    for (const [size, qty] of Object.entries(sizes)) {
      const availableQty = Math.max(0, toNumber(available[color]?.[size]))
      if (qty > availableQty) {
        return `${color} / ${size}: requested ${qty} exceeds available ${availableQty}`
      }
    }
  }

  return null
}

export function variantTotal(value: unknown): number {
  return rollupVariantQuantities(value).total
}
