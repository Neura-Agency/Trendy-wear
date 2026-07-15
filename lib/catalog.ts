export type CatalogProductLike = Record<string, any>;

export const normalizeCatalogValue = (value: string) => String(value || '').trim().toLowerCase();

export const isAllCapsValue = (value: string) => {
  const trimmed = String(value || '').trim();
  return !!trimmed && trimmed === trimmed.toUpperCase();
};

const getProductField = (product: CatalogProductLike, camelKey: string, snakeKey: string) =>
  String(product?.[camelKey] ?? product?.[snakeKey] ?? '');

export const resolveCanonicalBrand = (products: CatalogProductLike[], brandName: string) => {
  const normalizedBrand = normalizeCatalogValue(brandName);
  const matches = products.filter(product => normalizeCatalogValue(getProductField(product, 'brandName', 'brand_name')) === normalizedBrand);
  if (matches.length === 0) return String(brandName || '').trim();

  const preferred = matches.find(product => isAllCapsValue(getProductField(product, 'brandName', 'brand_name')));
  return String(preferred ? getProductField(preferred, 'brandName', 'brand_name') : getProductField(matches[0], 'brandName', 'brand_name') || brandName).trim();
};

export const findMatchingProduct = (
  products: CatalogProductLike[],
  productName: string,
  brandName: string,
  productType: string
) =>
  products.find(product =>
    normalizeCatalogValue(getProductField(product, 'productName', 'product_name')) === normalizeCatalogValue(productName) &&
    normalizeCatalogValue(getProductField(product, 'brandName', 'brand_name')) === normalizeCatalogValue(brandName) &&
    normalizeCatalogValue(getProductField(product, 'productType', 'product_type')) === normalizeCatalogValue(productType)
  );

const hashStringToWords = (input: string) => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < input.length; i += 1) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
};

export const buildDeterministicUuid = (input: string) => {
  const words = hashStringToWords(input);
  const bytes = new Uint8Array(16);

  words.forEach((word, index) => {
    const offset = index * 4;
    bytes[offset] = (word >>> 24) & 0xff;
    bytes[offset + 1] = (word >>> 16) & 0xff;
    bytes[offset + 2] = (word >>> 8) & 0xff;
    bytes[offset + 3] = word & 0xff;
  });

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const buildDeterministicProductId = (productName: string, brandName: string, productType: string) =>
  buildDeterministicUuid([
    normalizeCatalogValue(productName),
    normalizeCatalogValue(brandName),
    normalizeCatalogValue(productType),
  ].join('|'));

export const formatItemCodeFromUuid = (id?: string | null) => {
  if (!id) return '';
  return `ITEM-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
};

export const formatItemCode = (value?: string | null) => {
  if (!value) return '';
  const trimmed = String(value).trim();
  const alreadyFormatted = trimmed.match(/^ITEM-([0-9A-F]{8})$/i);
  if (alreadyFormatted) {
    return `ITEM-${alreadyFormatted[1].toUpperCase()}`;
  }
  return formatItemCodeFromUuid(trimmed);
};