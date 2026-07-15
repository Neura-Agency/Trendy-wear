import {
  toNumber,
  normalizeFlatQuantities,
  normalizeVariantQuantities,
  rollupVariantQuantities,
  scaleVariantQuantitiesToTotal,
  mergeVariantQuantities,
  adjustVariantQuantities,
  validateVariantRequest,
  variantTotal,
} from '../../lib/variantQuantities';

describe('toNumber', () => {
  test('should convert valid numbers', () => {
    expect(toNumber(5)).toBe(5);
    expect(toNumber('10')).toBe(10);
  });

  test('should return 0 for invalid values', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('abc')).toBe(0);
    expect(toNumber(NaN)).toBe(0);
  });

  test('should handle Infinity', () => {
    expect(toNumber(Infinity)).toBe(0);
    expect(toNumber(-Infinity)).toBe(0);
  });
});

describe('normalizeFlatQuantities', () => {
  test('should normalize a valid flat quantities object', () => {
    const result = normalizeFlatQuantities({ S: 5, M: '10', L: 15 });
    expect(result).toEqual({ S: 5, M: 10, L: 15 });
  });

  test('should return null for null/undefined', () => {
    expect(normalizeFlatQuantities(null)).toBeNull();
    expect(normalizeFlatQuantities(undefined)).toBeNull();
  });

  test('should return null for empty object', () => {
    expect(normalizeFlatQuantities({})).toBeNull();
  });

  test('should return null for non-object values', () => {
    expect(normalizeFlatQuantities('string')).toBeNull();
    expect(normalizeFlatQuantities(123)).toBeNull();
  });

  test('should filter out empty keys', () => {
    const result = normalizeFlatQuantities({ '': 5, M: 10 });
    expect(result).toEqual({ M: 10 });
  });

  test('should not allow negative quantities', () => {
    const result = normalizeFlatQuantities({ S: -5, M: 10 });
    expect(result).toEqual({ S: 0, M: 10 });
  });
});

describe('normalizeVariantQuantities', () => {
  test('should normalize a valid variant grid', () => {
    const input = { Red: { S: 5, M: 10 }, Blue: { S: 3, L: 7 } };
    const result = normalizeVariantQuantities(input);
    expect(result).toEqual(input);
  });

  test('should return null for null/undefined', () => {
    expect(normalizeVariantQuantities(null)).toBeNull();
    expect(normalizeVariantQuantities(undefined)).toBeNull();
  });

  test('should handle numeric quantities in string form', () => {
    const input = { Red: { S: '5', M: '10' } };
    const result = normalizeVariantQuantities(input);
    expect(result).toEqual({ Red: { S: 5, M: 10 } });
  });

  test('should not allow negative quantities', () => {
    const input = { Red: { S: -5 } };
    const result = normalizeVariantQuantities(input);
    expect(result).toEqual({ Red: { S: 0 } });
  });
});

describe('rollupVariantQuantities', () => {
  test('should roll up variant grid into color/size totals', () => {
    const input = { Red: { S: 5, M: 10 }, Blue: { S: 3, L: 7 } };
    const result = rollupVariantQuantities(input);
    expect(result.total).toBe(25);
    expect(result.colorQuantities).toEqual({ Red: 15, Blue: 10 });
    expect(result.sizeQuantities).toEqual({ S: 8, M: 10, L: 7 });
  });

  test('should return zeros for null input', () => {
    const result = rollupVariantQuantities(null);
    expect(result.total).toBe(0);
    expect(result.colorQuantities).toBeNull();
    expect(result.sizeQuantities).toBeNull();
  });

  test('should handle empty variant grid', () => {
    const result = rollupVariantQuantities({});
    expect(result.total).toBe(0);
  });
});

describe('scaleVariantQuantitiesToTotal', () => {
  test('should scale down a stale variant grid to match the live total', () => {
    const input = { Red: { L: 4, M: 4 } };
    const result = scaleVariantQuantitiesToTotal(input, 4);
    expect(result).toEqual({ Red: { L: 2, M: 2 } });
  });

  test('should preserve the original grid when the target total is already higher', () => {
    const input = { Red: { L: 2, M: 2 } };
    const result = scaleVariantQuantitiesToTotal(input, 6);
    expect(result).toEqual({ Red: { L: 2, M: 2 } });
  });
});

describe('mergeVariantQuantities', () => {
  test('should merge two variant grids', () => {
    const existing = { Red: { S: 5, M: 3 } };
    const incoming = { Red: { M: 2, L: 4 }, Blue: { S: 1 } };
    const result = mergeVariantQuantities(existing, incoming);
    expect(result).toEqual({ Red: { S: 5, M: 5, L: 4 }, Blue: { S: 1 } });
  });

  test('should return existing if incoming is null', () => {
    const existing = { Red: { S: 5 } };
    const result = mergeVariantQuantities(existing, null);
    expect(result).toEqual({ Red: { S: 5 } });
  });

  test('should return null if both are null', () => {
    expect(mergeVariantQuantities(null, null)).toBeNull();
  });
});

describe('adjustVariantQuantities', () => {
  test('should add quantities with direction 1', () => {
    const base = { Red: { S: 5, M: 3 } };
    const delta = { Red: { S: 2, M: 1 } };
    const result = adjustVariantQuantities(base, delta, 1);
    expect(result).toEqual({ Red: { S: 7, M: 4 } });
  });

  test('should subtract quantities with direction -1', () => {
    const base = { Red: { S: 10, M: 5 } };
    const delta = { Red: { S: 3, M: 1 } };
    const result = adjustVariantQuantities(base, delta, -1);
    expect(result).toEqual({ Red: { S: 7, M: 4 } });
  });

  test('should not allow negative results when subtracting', () => {
    const base = { Red: { S: 2 } };
    const delta = { Red: { S: 5 } };
    const result = adjustVariantQuantities(base, delta, -1);
    expect(result).toBeNull();
  });

  test('should handle empty delta', () => {
    const base = { Red: { S: 5 } };
    const result = adjustVariantQuantities(base, {}, -1);
    expect(result).toEqual({ Red: { S: 5 } });
  });
});

describe('validateVariantRequest', () => {
  test('should return null if request is valid', () => {
    const requested = { Red: { S: 5, M: 3 } };
    const available = { Red: { S: 10, M: 5 } };
    expect(validateVariantRequest(requested, available)).toBeNull();
  });

  test('should return error message if request exceeds available', () => {
    const requested = { Red: { S: 15 } };
    const available = { Red: { S: 10 } };
    const error = validateVariantRequest(requested, available);
    expect(error).toContain('15 exceeds available 10');
  });

  test('should return null for null request', () => {
    expect(validateVariantRequest(null, {})).toBeNull();
  });

  test('should treat missing available as zero', () => {
    const requested = { Red: { S: 5 } };
    expect(validateVariantRequest(requested, {})).toContain('5 exceeds available 0');
  });
});

describe('variantTotal', () => {
  test('should calculate total items from variant grid', () => {
    const input = { Red: { S: 5, M: 10 }, Blue: { S: 3 } };
    expect(variantTotal(input)).toBe(18);
  });

  test('should return 0 for null input', () => {
    expect(variantTotal(null)).toBe(0);
  });
});