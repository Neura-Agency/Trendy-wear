import {
  normalizeCatalogValue,
  isAllCapsValue,
  resolveCanonicalBrand,
  findMatchingProduct,
  buildDeterministicProductId,
  formatItemCodeFromUuid,
} from '../../lib/catalog';

describe('normalizeCatalogValue', () => {
  test('should trim and lowercase a string', () => {
    expect(normalizeCatalogValue('  HELLO  ')).toBe('hello');
  });

  test('should handle empty string', () => {
    expect(normalizeCatalogValue('')).toBe('');
  });

  test('should handle null/undefined by returning empty string', () => {
    expect(normalizeCatalogValue(null as any)).toBe('');
    expect(normalizeCatalogValue(undefined as any)).toBe('');
  });

  test('should handle strings with special characters', () => {
    expect(normalizeCatalogValue('  T-SHIRT  ')).toBe('t-shirt');
  });
});

describe('isAllCapsValue', () => {
  test('should return true for all caps string', () => {
    expect(isAllCapsValue('NIKE')).toBe(true);
  });

  test('should return false for mixed case', () => {
    expect(isAllCapsValue('Nike')).toBe(false);
  });

  test('should return false for empty string', () => {
    expect(isAllCapsValue('')).toBe(false);
  });

  test('should handle whitespace', () => {
    expect(isAllCapsValue('  NIKE  ')).toBe(true);
  });
});

describe('resolveCanonicalBrand', () => {
  const products = [
    { brandName: 'NIKE', productName: 'Shoe', productType: 'Sneaker' },
    { brandName: 'Nike', productName: 'Shoe', productType: 'Running' },
    { brandName: 'Adidas', productName: 'Shirt', productType: 'Polo' },
  ];

  test('should prefer ALL CAPS brand name', () => {
    expect(resolveCanonicalBrand(products, 'nike')).toBe('NIKE');
  });

  test('should return trimmed brand if no match found', () => {
    expect(resolveCanonicalBrand(products, 'Puma')).toBe('Puma');
  });

  test('should handle empty products array', () => {
    expect(resolveCanonicalBrand([], 'Nike')).toBe('Nike');
  });

  test('should match case-insensitively', () => {
    expect(resolveCanonicalBrand(products, 'ADIDAS')).toBe('Adidas');
  });
});

describe('findMatchingProduct', () => {
  const products = [
    { productName: 'Classic Shoe', brandName: 'NIKE', productType: 'Sneaker' },
    { productName: 'Running Shoe', brandName: 'Nike', productType: 'Running' },
  ];

  test('should find product by name, brand, type (case-insensitive)', () => {
    const result = findMatchingProduct(products, 'classic shoe', 'nike', 'sneaker');
    expect(result).toBeDefined();
    expect(result!.productName).toBe('Classic Shoe');
  });

  test('should return undefined if no match', () => {
    expect(findMatchingProduct(products, 'Nonexistent', 'nike', 'sneaker')).toBeUndefined();
  });

  test('should handle empty products list', () => {
    expect(findMatchingProduct([], 'Classic Shoe', 'nike', 'sneaker')).toBeUndefined();
  });
});

describe('buildDeterministicProductId', () => {
  test('should generate consistent UUID for same inputs', () => {
    const id1 = buildDeterministicProductId('Shoe', 'NIKE', 'Sneaker');
    const id2 = buildDeterministicProductId('Shoe', 'NIKE', 'Sneaker');
    expect(id1).toBe(id2);
  });

  test('should generate different UUIDs for different inputs', () => {
    const id1 = buildDeterministicProductId('Shoe', 'NIKE', 'Sneaker');
    const id2 = buildDeterministicProductId('Shoe', 'ADIDAS', 'Sneaker');
    expect(id1).not.toBe(id2);
  });

  test('should generate valid UUID format', () => {
    const id = buildDeterministicProductId('Shoe', 'NIKE', 'Sneaker');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('should normalize case before hashing', () => {
    const id1 = buildDeterministicProductId('Shoe', 'NIKE', 'Sneaker');
    const id2 = buildDeterministicProductId('shoe', 'nike', 'sneaker');
    expect(id1).toBe(id2);
  });
});

describe('formatItemCodeFromUuid', () => {
  test('should format UUID to ITEM-XXXXXXXX format', () => {
    const result = formatItemCodeFromUuid('550e8400-e29b-41d4-a716-446655440000');
    expect(result).toMatch(/^ITEM-[0-9A-F]{8}$/);
  });

  test('should return empty string for null/undefined', () => {
    expect(formatItemCodeFromUuid(null)).toBe('');
    expect(formatItemCodeFromUuid(undefined)).toBe('');
  });

  test('should return empty string for empty string', () => {
    expect(formatItemCodeFromUuid('')).toBe('');
  });
});