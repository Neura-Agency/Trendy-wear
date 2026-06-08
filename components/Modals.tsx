import React, { useState } from 'react';
import { usePopup } from './Popup';
import Badge from './Badge';
import { SaleModalProps, CreateStoreModalProps, ReportModalProps, AddInventoryModalProps, AllotToStoreModalProps, InventoryItem, Order, Product, Store, Expense } from '../types';
import { buildDeterministicProductId, findMatchingProduct, formatItemCodeFromUuid, resolveCanonicalBrand } from '../lib/catalog';
import { adjustVariantQuantities, rollupVariantQuantities, VariantQuantities } from '../lib/variantQuantities';

type SaleInventoryItem = Pick<InventoryItem, 'productName' | 'quantityAvailable' | 'sellingPrice'> & {
    productId?: string;
    brandName?: string;
    productType?: string;
    sizes?: string[];
    colors?: string[];
    ownerSupplyPrice?: number;
    sizeQuantities?: Record<string, number>;
    sizeQuantitiesRemaining?: Record<string, number>;
    colorQuantities?: Record<string, number>;
    colorQuantitiesRemaining?: Record<string, number>;
    variantQuantities?: VariantQuantities;
    variantQuantitiesRemaining?: VariantQuantities;
};

interface SaleModalPropsLocal {
    inventory: SaleInventoryItem[];
  storeName?: string;
  isAdmin?: boolean;
  storeNames?: string[];
  onAdd: (sale: any) => void;
  onClose: () => void;
}

const normalizeCatalogValue = (value: string) => String(value ?? '').trim().toLowerCase();

const isAllCapsValue = (value: string) => {
    const trimmed = value.trim();
    return !!trimmed && trimmed === trimmed.toUpperCase();
};

const uniqueCatalogValues = (values: string[], preferAllCaps = false) => {
    const canonicalByKey = new Map<string, string>();
    values.forEach(value => {
        const trimmed = String(value || '').trim();
        if (!trimmed) return;
        const key = normalizeCatalogValue(trimmed);
        const current = canonicalByKey.get(key);
        if (!current) {
            canonicalByKey.set(key, trimmed);
            return;
        }
        if (preferAllCaps && isAllCapsValue(trimmed) && !isAllCapsValue(current)) {
            canonicalByKey.set(key, trimmed);
        }
    });
    return Array.from(canonicalByKey.values());
};

const normalizeQty = (qty: unknown) => Math.max(0, Number(qty) || 0);

export const buildVariantGrid = (colors: string[], sizes: string[], existing?: VariantQuantities | null) => {
    const grid: VariantQuantities = {};
    colors.forEach(color => {
        grid[color] = {};
        sizes.forEach(size => {
            grid[color][size] = normalizeQty(existing?.[color]?.[size]);
        });
    });
    return grid;
};

export const variantGrandTotal = (variants?: VariantQuantities | null) => rollupVariantQuantities(variants).total;
const variantRowTotal = (variants: VariantQuantities, color: string) => Object.values(variants[color] || {}).reduce((sum, qty) => sum + normalizeQty(qty), 0);
const variantColumnTotal = (variants: VariantQuantities, size: string) => Object.values(variants || {}).reduce((sum, sizes) => sum + normalizeQty(sizes?.[size]), 0);

const buildLegacyMaxVariantGrid = (colorQuantities?: Record<string, number> | null, sizeQuantities?: Record<string, number> | null) => {
    const colors = colorQuantities && typeof colorQuantities === 'object' ? Object.keys(colorQuantities) : [];
    const sizes = sizeQuantities && typeof sizeQuantities === 'object' ? Object.keys(sizeQuantities) : [];
    const grid: VariantQuantities = {};
    colors.forEach(color => {
        grid[color] = {};
        sizes.forEach(size => {
            grid[color][size] = Math.min(normalizeQty(colorQuantities?.[color]), normalizeQty(sizeQuantities?.[size]));
        });
    });
    return grid;
};

export function VariantQuantityGrid({
    colors,
    sizes,
    values,
    onChange,
    maxValues,
    remainingValues,
    title = 'Quantity by Color & Size',
    showRemainingLabel = false,
}: {
    colors: string[];
    sizes: string[];
    values: VariantQuantities;
    onChange: (next: VariantQuantities) => void;
    maxValues?: VariantQuantities | null;
    /** When provided, these values are shown in the "X left" label instead of computing max − current. */
    remainingValues?: VariantQuantities | null;
    title?: string;
    showRemainingLabel?: boolean;
}) {
    if (!colors.length || !sizes.length) return null;
    const total = variantGrandTotal(values);
    const setCell = (color: string, size: string, qty: number) => {
        const max = maxValues?.[color]?.[size];
        const nextQty = max === undefined ? normalizeQty(qty) : Math.min(normalizeQty(qty), normalizeQty(max));
        onChange({
            ...values,
            [color]: {
                ...(values[color] || {}),
                [size]: nextQty,
            },
        });
    };

    return (
        <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>{title}</div>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left', padding: 8, fontSize: 11, color: 'var(--text-muted)' }}>Color</th>
                        {sizes.map(size => (
                            <th key={size} style={{ textAlign: 'center', padding: 8, fontSize: 11, color: 'var(--text-muted)' }}>{size}</th>
                        ))}
                        <th style={{ textAlign: 'right', padding: 8, fontSize: 11, color: 'var(--text-muted)' }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {colors.map(color => (
                        <tr key={color}>
                            <td style={{ padding: 8, fontWeight: 800, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                                <span style={{ display: 'inline-flex', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 8, verticalAlign: 'middle' }} />
                                {color}
                            </td>
                            {sizes.map(size => {
                                const max = maxValues?.[color]?.[size];
                                const currentVal = normalizeQty(values[color]?.[size]);
                                const remaining = max !== undefined ? normalizeQty(max) - currentVal : undefined;
                                // Use remainingValues override if provided (e.g. Edit modal where max includes existing assignment)
                                const displayRemaining = remainingValues
                                    ? normalizeQty((remainingValues[color] as any)?.[size] ?? 0)
                                    : remaining;
                                const isAtLimit = showRemainingLabel && displayRemaining !== undefined && displayRemaining === 0 && currentVal > 0;
                                const isNearLimit = showRemainingLabel && displayRemaining !== undefined && displayRemaining > 0 && displayRemaining <= 2;
                                return (
                                    <td key={`${color}-${size}`} style={{ padding: 6 }}>
                                        <input
                                            type="number"
                                            min="0"
                                            max={max}
                                            value={currentVal || 0}
                                            onChange={e => setCell(color, size, parseInt(e.target.value) || 0)}
                                            title={max !== undefined ? `Max ${max}` : undefined}
                                            style={{
                                                width: '100%', minWidth: 72, padding: '8px 10px', textAlign: 'center',
                                                borderColor: isAtLimit ? 'var(--danger)' : isNearLimit ? '#f59e0b' : undefined,
                                                background: isAtLimit ? 'rgba(239,68,68,0.06)' : undefined,
                                            }}
                                        />
                                        {max !== undefined && (
                                            showRemainingLabel ? (
                                                <div style={{
                                                    fontSize: 9, textAlign: 'center', marginTop: 2, fontWeight: 700,
                                                    color: isAtLimit ? 'var(--danger)' : isNearLimit ? '#f59e0b' : 'var(--text-muted)',
                                                }}>
                                                    {displayRemaining === 0 ? 'sold out' : `${displayRemaining} left`}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>max {max}</div>
                                            )
                                        )}
                                    </td>
                                );
                            })}
                            <td style={{ padding: 8, textAlign: 'right', fontWeight: 900 }}>{variantRowTotal(values, color)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td style={{ padding: 8, fontWeight: 900 }}>Total</td>
                        {sizes.map(size => (
                            <td key={size} style={{ padding: 8, textAlign: 'center', fontWeight: 900 }}>{variantColumnTotal(values, size)}</td>
                        ))}
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 900 }}>{total}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

const DEFAULT_PRODUCT_TYPES = [
    'T-shirt', 'Shirt', 'Polo', 'Hoodie', 'Sweatshirt', 'Sweater', 'Cardigan', 'Jacket', 'Coat', 'Blazer',
    'Jeans', 'Trousers', 'Trouser', 'Shorts', 'Leggings', 'Joggers', 'Dress', 'Skirt', 'Jumpsuit', 'Top',
    'Kurta', 'Saree', 'Ethnic', 'Co-ord', 'Co-ords', 'Blouse', 'Other'
];

function CatalogInput({
    label,
    value,
    onChange,
    placeholder,
    options,
    onPick,
    onCommit,
    required,
    helperText,
    inventoryItems,
    getOptionLabel,
    onDelete,
    readOnly,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    options: string[];
    onPick: (value: string) => void;
    onCommit: () => void | Promise<void>;
    required?: boolean;
    helperText?: string;
    /** Pass warehouse inventory to look up existing item IDs per product name */
    inventoryItems?: InventoryItem[];
    getOptionLabel?: (option: string) => string;
    onDelete?: (option: string) => void;
    readOnly?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const filtered = options.filter(option => normalizeCatalogValue(option).includes(normalizeCatalogValue(value)));

    return (
        <div className="input-group" style={{ position: 'relative', zIndex: open ? 1100 : 'auto' }}>
            <label>
                {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>*</span>}
            </label>
            <input
                required={required}
                value={value}
                placeholder={placeholder}
                autoComplete="off"
                spellCheck={false}
                readOnly={readOnly}
                onFocus={() => {
                    if (!readOnly) setOpen(true);
                }}
                onChange={e => {
                    if (readOnly) return;
                    onChange(e.target.value);
                    setOpen(true);
                }}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={e => {
                    if (readOnly) return;
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        onCommit();
                        setOpen(false);
                    }
                }}
                style={readOnly ? { background: 'var(--surface-2)', cursor: 'default' } : undefined}
            />
            {helperText && <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>{helperText}</div>}
            {open && filtered.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 40px rgba(15, 23, 42, 0.12)', zIndex: 1200, maxHeight: 144, overflowY: 'auto' }}>
                    {filtered.map(option => {
                        const optionLabel = getOptionLabel ? getOptionLabel(option) : option;
                        return (
                            <div
                                key={option}
                                role="button"
                                tabIndex={0}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                    onPick(option);
                                    setOpen(false);
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onPick(option);
                                        setOpen(false);
                                    }
                                }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', border: 'none', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--surface-2)' }}
                            >
                                <span style={{ fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{optionLabel}</span>
                                {onDelete && (
                                    <button
                                        type="button"
                                        title="Delete option"
                                        aria-label={`Delete ${optionLabel}`}
                                        onMouseDown={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setOpen(false);
                                            onDelete(option);
                                        }}
                                        style={{
                                            width: 30,
                                            height: 30,
                                            borderRadius: 10,
                                            border: '1px solid rgba(239, 68, 68, 0.18)',
                                            background: 'rgba(239, 68, 68, 0.06)',
                                            color: 'var(--danger)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            
        </div>
    );
}


export function AddInventoryModal({ onSave, onClose, stores, products, hiddenProductTypes: hiddenProductTypesProp, onHideProductType }: AddInventoryModalProps) {
    const { toast } = usePopup();

    const [item, setItem] = useState({
        quantity: 1,
        pricePerPiece: 0,
        picture: '',
        sizeQuantities: {} as Record<string, number>,
        colorQuantities: {} as Record<string, number>,
        variantQuantities: {} as VariantQuantities
    });

    const [newProduct, setNewProduct] = useState({ productName: '', brandName: '', productType: '', customType: '' });
    const [catalogProducts, setCatalogProducts] = useState<Product[]>(products || []);
    const [colors, setColors] = useState<string[]>([]);
    const [colorInput, setColorInput] = useState('');
    const [sizes, setSizes] = useState<string[]>([]);
    const [customSize, setCustomSize] = useState('');
    const [allotedStores, setAllotedStores] = useState<string[]>([]);
    const [savingCatalog, setSavingCatalog] = useState(false);
    const [resolvedItemId, setResolvedItemId] = useState('');
    const clearForm = () => {
        setItem({
            quantity: 1,
            pricePerPiece: 0,
            picture: '',
            sizeQuantities: {} as Record<string, number>,
            colorQuantities: {} as Record<string, number>,
            variantQuantities: {} as VariantQuantities
        });
        setNewProduct({ productName: '', brandName: '', productType: '', customType: '' });
        setColors([]);
        setColorInput('');
        setSizes([]);
        setCustomSize('');
        setAllotedStores([]);
        setSavingCatalog(false);
        setResolvedItemId('');
    };
    const [showDeleteProductModal, setShowDeleteProductModal] = useState(false);
    const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
    const [hiddenProductTypes, setHiddenProductTypes] = useState<string[]>(hiddenProductTypesProp || []);
    const [hiddenBrandNames, setHiddenBrandNames] = useState<string[]>([]);

    // Sync externally-hidden product types (from parent, persisted across modal open/close)
    React.useEffect(() => {
        if (hiddenProductTypesProp && hiddenProductTypesProp.length > 0) {
            setHiddenProductTypes(prev => {
                const merged = [...prev];
                hiddenProductTypesProp.forEach(t => {
                    if (!merged.some(h => normalizeCatalogValue(h) === normalizeCatalogValue(t))) {
                        merged.push(t);
                    }
                });
                return merged;
            });
        }
    }, [hiddenProductTypesProp]);
    const [replaceModalOpen, setReplaceModalOpen] = useState(false);
    const [replaceField, setReplaceField] = useState<'productName' | 'brandName' | 'productType' | 'color' | null>(null);
    const [replaceOriginalValue, setReplaceOriginalValue] = useState<string>('');
    const [replaceInput, setReplaceInput] = useState<string>('');
    const [replaceProcessing, setReplaceProcessing] = useState(false);

    React.useEffect(() => {
        setCatalogProducts(products || []);
    }, [products]);

    const resolvedProductType = newProduct.productType.trim();
    const matchedExistingProduct = resolvedProductType
        ? findMatchingProduct(catalogProducts, newProduct.productName, resolveCanonicalBrand(catalogProducts, newProduct.brandName), resolvedProductType)
        : undefined;

    React.useEffect(() => {
        const productName = newProduct.productName.trim();
        const brandName = newProduct.brandName.trim();

        if (!productName || !brandName || !resolvedProductType) {
            setResolvedItemId('');
            return;
        }

        const canonicalBrand = resolveCanonicalBrand(catalogProducts, brandName);
        const existingProduct = findMatchingProduct(catalogProducts, productName, canonicalBrand, resolvedProductType);
        const stableUuid = existingProduct?.id || buildDeterministicProductId(productName, canonicalBrand, resolvedProductType);

        setResolvedItemId(formatItemCodeFromUuid(stableUuid));
    }, [catalogProducts, newProduct.productName, newProduct.brandName, newProduct.productType, newProduct.customType, resolvedProductType]);

    const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

    const distinctProductNames = uniqueCatalogValues(catalogProducts.map(product => product.productName).filter(Boolean));
    const distinctBrandNames = uniqueCatalogValues(catalogProducts.map(product => product.brandName).filter(Boolean), true);
    const distinctProductTypes = uniqueCatalogValues([
        ...DEFAULT_PRODUCT_TYPES,
        ...catalogProducts.map(product => product.productType).filter(Boolean)
    ]);

    const filteredProductNames = distinctProductNames.filter(name => normalizeCatalogValue(name).includes(normalizeCatalogValue(newProduct.productName)));
    const filteredBrandNames = distinctBrandNames.filter(name => normalizeCatalogValue(name).includes(normalizeCatalogValue(newProduct.brandName)) && !hiddenBrandNames.some(hidden => normalizeCatalogValue(hidden) === normalizeCatalogValue(name)));
    const filteredProductTypes = distinctProductTypes.filter(name => normalizeCatalogValue(name).includes(normalizeCatalogValue(newProduct.productType)) && !hiddenProductTypes.some(hidden => normalizeCatalogValue(hidden) === normalizeCatalogValue(name)));
    const distinctColors = uniqueCatalogValues(catalogProducts.flatMap(product => Array.isArray(product.colors) ? product.colors : []).filter(Boolean));
    const getProductOptionLabel = (productName: string) => productName;

    const handleAddColor = () => {
        const c = colorInput.trim();
        if (!c) return;
        const normalized = c.toLowerCase();
        if (!colors.includes(normalized)) setColors(prev => [...prev, normalized]);
        setColorInput('');
    };

    const replaceCatalogValueInList = (list: any, originalValue: string, newValue: string) => {
        const values = Array.isArray(list) ? list : [];
        return uniqueCatalogValues(
            values.map((value: string) => (
                normalizeCatalogValue(value) === normalizeCatalogValue(originalValue) ? newValue : value
            ))
        );
    };

    const hideBrandSuggestion = (brandName: string) => {
        (async () => {
            try {
                const res = await fetch('/api/inventory');
                const data = await res.json();
                const assigned = (data.inventory || []).filter((row: any) => normalizeCatalogValue(row.brand) === normalizeCatalogValue(brandName));
                if (assigned.length > 0) {
                    setReplaceField('brandName');
                    setReplaceOriginalValue(brandName);
                    setReplaceInput('');
                    setReplaceModalOpen(true);
                    return;
                }
            } catch (err) {
                // fallback to hide
            }

            setHiddenBrandNames(prev => {
                if (prev.some(item => normalizeCatalogValue(item) === normalizeCatalogValue(brandName))) return prev;
                return [...prev, brandName];
            });
            if (normalizeCatalogValue(newProduct.brandName) === normalizeCatalogValue(brandName)) {
                setNewProduct(curr => ({ ...curr, brandName: '' }));
            }
            toast.success('Brand hidden');
        })();
    };

    const deleteCatalogColor = (colorName: string) => {
        (async () => {
            try {
                const res = await fetch('/api/inventory');
                const data = await res.json();
                const assigned = (data.inventory || []).filter((row: any) => {
                    const rowColors = Array.isArray(row.color) ? row.color : row.color ? [row.color] : [];
                    return rowColors.some((color: string) => normalizeCatalogValue(color) === normalizeCatalogValue(colorName));
                });

                if (assigned.length > 0) {
                    setReplaceField('color');
                    setReplaceOriginalValue(colorName);
                    setReplaceInput('');
                    setReplaceModalOpen(true);
                    return;
                }

                setCatalogProducts(prev => prev.map(product => {
                    const productColors = Array.isArray(product.colors) ? product.colors : [];
                    if (!productColors.some(color => normalizeCatalogValue(color) === normalizeCatalogValue(colorName))) return product;
                    return {
                        ...product,
                        colors: productColors.filter(color => normalizeCatalogValue(color) !== normalizeCatalogValue(colorName))
                    } as Product;
                }));

                if (colors.some(color => normalizeCatalogValue(color) === normalizeCatalogValue(colorName))) {
                    setColors(prev => prev.filter(color => normalizeCatalogValue(color) !== normalizeCatalogValue(colorName)));
                }

                toast.success('Color removed from suggestions');
            } catch (err) {
                toast.error('Failed to inspect color usage');
            }
        })();
    };

    const toggleSize = (size: string) => {
        setSizes(prev => {
            const next = prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size];
            setItem(curr => {
                const q = { ...curr.sizeQuantities };
                if (!prev.includes(size)) q[size] = q[size] ?? 0;
                else delete q[size];
                return { ...curr, sizeQuantities: q };
            });
            return next;
        });
    };

    const handleAddCustomSize = () => {
        const custom = customSize.trim();
        if (!custom) return;
        const upper = custom.toUpperCase();
        if (!sizes.includes(upper)) {
            setSizes(prev => [...prev, upper]);
            setItem(curr => ({ ...curr, sizeQuantities: { ...curr.sizeQuantities, [upper]: 0 } }));
        }
        setCustomSize('');
    };

    const updateSizeQuantity = (size: string, qty: number) => setItem(curr => ({ ...curr, sizeQuantities: { ...curr.sizeQuantities, [size]: Math.max(0, qty) } }));
    const updateColorQuantity = (color: string, qty: number) => setItem(curr => ({ ...curr, colorQuantities: { ...curr.colorQuantities, [color]: Math.max(0, qty) } }));

    const sizeQuantityTotal = Object.values(item.sizeQuantities).reduce((s, q) => s + (Number(q) || 0), 0);
    const colorQuantityTotal = Object.values(item.colorQuantities).reduce((s, q) => s + (Number(q) || 0), 0);
    const hasVariantGrid = colors.length > 0 && sizes.length > 0;
    const variantQuantityTotal = variantGrandTotal(item.variantQuantities);
    const totalQuantity = hasVariantGrid ? variantQuantityTotal : Math.max(0, Number(item.quantity) || 0);

    React.useEffect(() => {
        setItem(curr => {
            const nextVariants = buildVariantGrid(colors, sizes, curr.variantQuantities);
            const rollups = rollupVariantQuantities(nextVariants);
            return {
                ...curr,
                variantQuantities: nextVariants,
                sizeQuantities: rollups.sizeQuantities || {},
                colorQuantities: rollups.colorQuantities || {},
            };
        });
    }, [colors, sizes]);

    const toggleStore = (store: string) => setAllotedStores(prev => prev.includes(store) ? prev.filter(s => s !== store) : [...prev, store]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => setItem(curr => ({ ...curr, picture: reader.result as string }));
        reader.readAsDataURL(file);
    };

    const uploadCatalogProduct = async () => {
        const productName = newProduct.productName.trim();
        if (!productName) throw new Error('Enter product name');
        const rawBrandName = newProduct.brandName.trim();
        const brandName = resolveCanonicalBrand(catalogProducts, rawBrandName);
        const productType = resolvedProductType;
        if (!productType) throw new Error('Enter product type');
        if (!brandName) throw new Error('Enter brand name');

        const existing = findMatchingProduct(catalogProducts, productName, brandName, productType);
        if (existing) return existing;

        const response = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productName,
                brandName,
                productType,
                pricePerPiece: Number(item.pricePerPiece) || 0,
                colors,
                sizes,
                picture: item.picture || '',
                id: buildDeterministicProductId(productName, brandName, productType)
            })
        });

        let result: any = null;
        try {
            result = await response.json();
        } catch {
            result = null;
        }
        if (!response.ok) {
            throw new Error(result?.error || `Failed to save product (HTTP ${response.status})`);
        }

        if (!result?.product) {
            throw new Error('Failed to save product: invalid server response');
        }

        const savedProduct = result.product as Product;
        setCatalogProducts(prev => {
            const next = prev.filter(product => product.id !== savedProduct.id);
            return [savedProduct, ...next];
        });
        return savedProduct;
    };

    const deleteCatalogProduct = (productName: string) => {
        const target = catalogProducts.find(product => normalizeCatalogValue(product.productName) === normalizeCatalogValue(productName));
        if (!target) {
            toast.error('Product not found');
            return;
        }

        // If this product name is assigned to any inventory items, require replacement first
        (async () => {
            try {
                const res = await fetch('/api/inventory');
                if (!res.ok) {
                    throw new Error('Failed to check product assignments');
                }
                const data = await res.json();
                const assigned = (data.inventory || []).filter((row: any) => normalizeCatalogValue(row.productName) === normalizeCatalogValue(productName));
                if (assigned.length > 0) {
                    setReplaceField('productName');
                    setReplaceOriginalValue(productName);
                    setReplaceInput('');
                    setReplaceModalOpen(true);
                    return;
                }
            } catch (err) {
                toast.error('Could not verify product assignments. Please try again.');
                return;
            }

            setDeletingProduct(target);
            setShowDeleteProductModal(true);
        })();
    };

    const confirmReplace = async () => {
        if (!replaceField || !replaceOriginalValue) return;
        const newValue = String(replaceInput || '').trim();
        if (!newValue) return toast.error('Enter a replacement value');

        setReplaceProcessing(true);
        try {
            // Single dedicated endpoint — handles rename + merge atomically,
            // surfaces real DB errors instead of swallowing them.
            const res = await fetch('/api/catalog-replace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    field: replaceField,
                    originalValue: replaceOriginalValue,
                    newValue,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Replace failed');
            }

            // ── Update local catalogProducts so the dropdown reflects the
            // new value immediately without a full page re-fetch. ──────────
            setCatalogProducts(prev => prev.reduce((acc: Product[], p) => {
                if (replaceField === 'productName' && normalizeCatalogValue(p.productName) === normalizeCatalogValue(replaceOriginalValue)) {
                    // In a merge the old product row is deleted — drop it from
                    // local state; the surviving product already has the name.
                    const mergeTarget = acc.find(
                        q => normalizeCatalogValue(q.productName) === normalizeCatalogValue(newValue) &&
                             normalizeCatalogValue(q.brandName) === normalizeCatalogValue(p.brandName) &&
                             normalizeCatalogValue(q.productType) === normalizeCatalogValue(p.productType)
                    );
                    if (mergeTarget) return acc; // already represented
                    acc.push({ ...p, productName: newValue } as Product);
                    return acc;
                }
                if (replaceField === 'brandName' && normalizeCatalogValue(p.brandName) === normalizeCatalogValue(replaceOriginalValue)) {
                    const mergeTarget = acc.find(
                        q => normalizeCatalogValue(q.productName) === normalizeCatalogValue(p.productName) &&
                             normalizeCatalogValue(q.brandName) === normalizeCatalogValue(newValue) &&
                             normalizeCatalogValue(q.productType) === normalizeCatalogValue(p.productType)
                    );
                    if (mergeTarget) return acc;
                    acc.push({ ...p, brandName: newValue } as Product);
                    return acc;
                }
                if (replaceField === 'productType' && normalizeCatalogValue(p.productType) === normalizeCatalogValue(replaceOriginalValue)) {
                    const mergeTarget = acc.find(
                        q => normalizeCatalogValue(q.productName) === normalizeCatalogValue(p.productName) &&
                             normalizeCatalogValue(q.brandName) === normalizeCatalogValue(p.brandName) &&
                             normalizeCatalogValue(q.productType) === normalizeCatalogValue(newValue)
                    );
                    if (mergeTarget) return acc;
                    acc.push({ ...p, productType: newValue } as Product);
                    return acc;
                }
                if (replaceField === 'color') {
                    const productColors = Array.isArray(p.colors) ? p.colors : [];
                    if (!productColors.some(color => normalizeCatalogValue(color) === normalizeCatalogValue(replaceOriginalValue))) {
                        acc.push(p);
                        return acc;
                    }
                    acc.push({ ...p, colors: replaceCatalogValueInList(productColors, replaceOriginalValue, newValue) } as Product);
                    return acc;
                }
                acc.push(p);
                return acc;
            }, []));

            // For productType: hide the old value from the dropdown so it
            // doesn't reappear from DEFAULT_PRODUCT_TYPES after a re-render.
            if (replaceField === 'productType') {
                setHiddenProductTypes(prev => {
                    if (prev.some(item => normalizeCatalogValue(item) === normalizeCatalogValue(replaceOriginalValue))) return prev;
                    return [...prev, replaceOriginalValue];
                });
                onHideProductType?.(replaceOriginalValue);
                if (normalizeCatalogValue(newProduct.productType) === normalizeCatalogValue(replaceOriginalValue)) {
                    setNewProduct(curr => ({ ...curr, productType: newValue }));
                }
            }
            if (replaceField === 'brandName') {
                setHiddenBrandNames(prev => {
                    if (prev.some(item => normalizeCatalogValue(item) === normalizeCatalogValue(replaceOriginalValue))) return prev;
                    return [...prev, replaceOriginalValue];
                });
            }

            toast.success('Replaced and migrated assignments');
            setReplaceModalOpen(false);
            setReplaceField(null);
            setReplaceOriginalValue('');
            setReplaceInput('');
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || 'Failed to replace assignments');
        } finally {
            setReplaceProcessing(false);
        }
    };

    const confirmDeleteCatalogProduct = async () => {
        if (!deletingProduct?.id) {
            toast.error('Product not found');
            return;
        }

        try {
            const response = await fetch('/api/products', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deletingProduct.id })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to delete product');

            setCatalogProducts(prev => prev.filter(product => product.id !== deletingProduct.id));
            if (normalizeCatalogValue(newProduct.productName) === normalizeCatalogValue(deletingProduct.productName)) {
                setNewProduct(curr => ({ ...curr, productName: '' }));
            }
            setShowDeleteProductModal(false);
            setDeletingProduct(null);
            toast.success('✅ Product deleted');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to delete product');
        }
    };

    const hideProductTypeSuggestion = (typeName: string) => {
        (async () => {
            try {
                const res = await fetch('/api/inventory');
                const data = await res.json();
                const assigned = (data.inventory || []).filter((row: any) => normalizeCatalogValue(row.category) === normalizeCatalogValue(typeName));
                if (assigned.length > 0) {
                    setReplaceField('productType');
                    setReplaceOriginalValue(typeName);
                    setReplaceInput('');
                    setReplaceModalOpen(true);
                    return;
                }
            } catch (err) {
                // fallback to hide
            }

            setHiddenProductTypes(prev => {
                if (prev.some(item => normalizeCatalogValue(item) === normalizeCatalogValue(typeName))) return prev;
                return [...prev, typeName];
            });
            onHideProductType?.(typeName);
            if (normalizeCatalogValue(newProduct.productType) === normalizeCatalogValue(typeName)) {
                setNewProduct(curr => ({ ...curr, productType: '' }));
            }
            toast.success('✅ Type removed from suggestions');
        })();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newProduct.productName.trim()) return toast.error('Enter product name');
        if (!newProduct.brandName.trim()) return toast.error('Enter brand name');
        if (hasVariantGrid && variantQuantityTotal === 0) return toast.error('Enter quantities for at least one color-size pair');
        if (!hasVariantGrid && sizes.length > 0 && sizeQuantityTotal === 0) return toast.error('Enter quantities for at least one size');
        if (!hasVariantGrid && colors.length > 0 && colorQuantityTotal === 0) return toast.error('Enter quantities for at least one color');
        if (totalQuantity <= 0) return toast.error('Enter a valid total quantity');

        const variantRollups = rollupVariantQuantities(item.variantQuantities);
        const normalizedVariantQuantities = hasVariantGrid && variantRollups.total > 0 ? item.variantQuantities : null;
        const normalizedSizeQuantities = normalizedVariantQuantities ? variantRollups.sizeQuantities : (Object.keys(item.sizeQuantities).length ? item.sizeQuantities : null);
        const normalizedColorQuantities = normalizedVariantQuantities ? variantRollups.colorQuantities : (Object.keys(item.colorQuantities).length ? item.colorQuantities : null);
        try {
            const savedProduct = await uploadCatalogProduct();
            // Derive Item ID from the product's real UUID (same format as the dropdown)
            // so warehouse table and dropdown always show the same ID.
            const derivedItemId = `ITEM-${savedProduct.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

            onSave({
                itemId: derivedItemId,
                quantity: totalQuantity,
                pricePerPiece: Number(item.pricePerPiece) || 0,
                picture: item.picture,
                variantQuantities: normalizedVariantQuantities,
                sizeQuantities: normalizedSizeQuantities,
                colorQuantities: normalizedColorQuantities,
                productId: savedProduct.id,
                allotedStores,
            });

            onClose();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save product');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '860px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-head" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: 18, fontWeight: 800 }}>Add Warehouse Inventory</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" title="Undo / clear form" onClick={clearForm} style={{ border: 'none', fontSize: 16 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a6 6 0 1 1 0 12H8"/></svg>
                        </button>
                        <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18 }}>✕</button>
                    </div>
                </div>
                <div className="modal-body" style={{ padding: '18px 20px' }}>
                    <form onSubmit={handleSubmit}>
                        <div className="input-group" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <label style={{ marginBottom: 12 }}>Item Picture</label>
                            <div
                                style={{
                                    width: '100px', height: '100px', border: '2px dashed var(--border)', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', cursor: 'pointer', overflow: 'hidden', position: 'relative', transition: 'all 0.2s ease'
                                }}
                                onClick={() => document.getElementById('item-pic-input')?.click()}
                            >
                                {item.picture ? (
                                    <img src={item.picture} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ fontSize: 24, color: 'var(--text-faint)' }}>+</span>
                                )}
                                <input id="item-pic-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                            </div>
                            {!item.picture && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Click to upload</span>}
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 20 }}>
                            <CatalogInput
                                label="Product Name"
                                value={newProduct.productName}
                                onChange={value => setNewProduct({ ...newProduct, productName: value })}
                                placeholder="Type a product name and press Enter"
                                options={filteredProductNames}
                                onPick={value => setNewProduct({ ...newProduct, productName: value })}
                                onCommit={() => {}}
                                getOptionLabel={getProductOptionLabel}
                                onDelete={deleteCatalogProduct}
                                required
                            />
                            <CatalogInput
                                label="Brand Name"
                                value={newProduct.brandName}
                                onChange={value => setNewProduct({ ...newProduct, brandName: value })}
                                placeholder="Type a brand name and press Enter"
                                options={filteredBrandNames}
                                onPick={value => setNewProduct({ ...newProduct, brandName: value })}
                                onCommit={async () => {
                                    return;
                                }}
                                onDelete={hideBrandSuggestion}
                                required
                            />
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 20 }}>
                            <div className="input-group">
                                <CatalogInput
                                    label="Product Type"
                                    value={newProduct.productType}
                                    onChange={value => setNewProduct({ ...newProduct, productType: value })}
                                    placeholder="Type a product type and press Enter"
                                    options={filteredProductTypes}
                                    onPick={value => setNewProduct({ ...newProduct, productType: value })}
                                    onCommit={() => {}}
                                    getOptionLabel={(value) => value}
                                    onDelete={hideProductTypeSuggestion}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <label>Item ID</label>
                                <input
                                    readOnly
                                    value={resolvedItemId}
                                    placeholder="Select product, brand, and type"
                                    style={{ background: 'var(--surface-2)', cursor: 'default' }}
                                />
                                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                                    {matchedExistingProduct ? 'Existing product row will be reused.' : 'A stable ID is generated for this product combo.'}
                                </div>
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 20 }}>
                            <div className="input-group">
                                <label>Inventory Quantity</label>
                                <input type="text" inputMode="numeric" value={item.quantity} onChange={e => setItem({ ...item, quantity: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div className="input-group">
                                <label>Price Per Piece (Cost)</label>
                                <input type="text" inputMode="decimal" required placeholder="0.00" value={item.pricePerPiece as any} onChange={e => setItem({ ...item, pricePerPiece: parseFloat(e.target.value) || 0 })} />
                            </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: 20 }}>
                            <CatalogInput
                                label="Colors"
                                value={colorInput}
                                onChange={setColorInput}
                                placeholder="Type a color and press Enter"
                                options={distinctColors}
                                onPick={value => setColorInput(value)}
                                onCommit={handleAddColor}
                                getOptionLabel={(value) => value}
                                onDelete={deleteCatalogColor}
                            />
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {colors.map(c => (
                                    <div key={c} style={{ padding: '6px 12px', borderRadius: '20px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: c, fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'capitalize' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                                        {c}
                                        <span style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => setColors(colors.filter(x => x !== c))}>×</span>
                                    </div>
                                ))}
                                {colors.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No colors set.</div>}
                            </div>
                        </div>

                        {colors.length > 0 && !hasVariantGrid && (
                            <div style={{ marginBottom: 20, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>Quantity per Color</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                                    {colors.map(c => (
                                        <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{c}</label>
                                            <input type="text" inputMode="numeric" value={item.colorQuantities[c] || 0} onChange={e => updateColorQuantity(c, parseInt(e.target.value) || 0)} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="input-group" style={{ marginBottom: 20 }}>
                            <label>Sizes</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                {availableSizes.map(s => (
                                    <button key={s} type="button" className={`btn btn-sm ${sizes.includes(s) ? 'btn-primary' : 'btn-glass'}`} style={{ minWidth: 44 }} onClick={() => toggleSize(s)}>{s}</button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <input placeholder="Add custom size (e.g. 3XL)..." value={customSize} onChange={e => setCustomSize(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomSize())} />
                                <button type="button" className="btn btn-sm" onClick={handleAddCustomSize}>+ Custom Size</button>
                            </div>

                            {sizes.length > 0 && !hasVariantGrid && (
                                <div style={{ marginTop: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>Quantity per Size</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                                        {sizes.map(s => (
                                            <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{s}</label>
                                                <input type="text" inputMode="numeric" value={item.sizeQuantities[s] || 0} onChange={e => updateSizeQuantity(s, parseInt(e.target.value) || 0)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {hasVariantGrid && (
                            <>
                                <VariantQuantityGrid
                                    colors={colors}
                                    sizes={sizes}
                                    values={item.variantQuantities}
                                    onChange={next => {
                                        const rollups = rollupVariantQuantities(next);
                                        setItem(curr => ({
                                            ...curr,
                                            variantQuantities: next,
                                            sizeQuantities: rollups.sizeQuantities || {},
                                            colorQuantities: rollups.colorQuantities || {},
                                        }));
                                    }}
                                />
                                <div style={{ marginBottom: 16, padding: '8px 12px', background: variantQuantityTotal > 0 ? 'var(--primary)' : 'var(--surface-1)', color: 'var(--text)', borderRadius: 6, fontSize: 13, fontWeight: 800, textAlign: 'center' }}>
                                    Total inventory quantity: {variantQuantityTotal} units
                                </div>
                            </>
                        )}

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="btn btn-primary btn-full" disabled={savingCatalog} style={{ height: 52, fontSize: 16, fontWeight: 800 }}>{savingCatalog ? 'Saving...' : 'Add to Warehouse Inventory'}</button>
                        </div>
                    </form>
                </div>
            </div>

            {replaceModalOpen && replaceField && (
                <div className="modal-overlay" onClick={() => { setReplaceModalOpen(false); setReplaceField(null); setReplaceOriginalValue(''); setReplaceInput(''); }}>
                    <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', width: '95%' }}>
                        <div className="modal-head" style={{ padding: '16px 20px' }}>
                            <h3 style={{ fontSize: 18, fontWeight: 800 }}>
                                Replace {replaceField === 'color' ? 'Color' : replaceField === 'productType' ? 'Type' : replaceField === 'brandName' ? 'Brand' : 'Product'}
                            </h3>
                            <button className="btn btn-sm" onClick={() => { setReplaceModalOpen(false); setReplaceField(null); setReplaceOriginalValue(''); setReplaceInput(''); }} style={{ border: 'none', fontSize: 18 }}>✕</button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px 20px 22px' }}>
                            <div style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
                                {replaceField === 'color'
                                    ? <>Color <strong>{replaceOriginalValue}</strong> is already used. Enter the replacement color before deleting it.</>
                                    : <>Value <strong>{replaceOriginalValue}</strong> is already used. Enter the replacement value before deleting it.</>}
                            </div>
                            <div className="input-group" style={{ marginBottom: 18 }}>
                                <label>Replacement value</label>
                                <input
                                    value={replaceInput}
                                    onChange={e => setReplaceInput(e.target.value)}
                                    placeholder={replaceField === 'color' ? 'Enter replacement color' : 'Enter replacement value'}
                                    autoFocus
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            confirmReplace();
                                        }
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button type="button" className="btn btn-glass" onClick={() => { setReplaceModalOpen(false); setReplaceField(null); setReplaceOriginalValue(''); setReplaceInput(''); }}>
                                    Cancel
                                </button>
                                <button type="button" className="btn btn-primary" onClick={confirmReplace} disabled={replaceProcessing}>
                                    {replaceProcessing ? 'Replacing...' : 'Replace & Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteProductModal && deletingProduct && (
                <div className="modal-overlay" onClick={() => { setShowDeleteProductModal(false); setDeletingProduct(null); }}>
                    <div className="modal-box delete-modal" onClick={e => e.stopPropagation()}>
                        <div className="delete-modal__hero">
                            <div className="delete-modal__head">
                                <div className="delete-modal__icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                                </div>
                                <div className="delete-modal__copy">
                                    <div className="delete-modal__eyebrow">Destructive action</div>
                                    <h3 className="delete-modal__title">Delete product?</h3>
                                    <div className="delete-modal__subtitle">
                                        You are about to remove <strong>{deletingProduct.productName}</strong> from the product catalog.
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="delete-modal__body">
                            <div className="delete-modal__summary">
                                <div className="delete-modal__summary-top">
                                    <div>
                                        <div className="delete-modal__label">Product details</div>
                                        <div className="delete-modal__item-name">{deletingProduct.productName}</div>
                                        <div className="delete-modal__batch">{deletingProduct.brandName || 'No brand'} • {deletingProduct.productType || 'No type'}</div>
                                    </div>
                                </div>
                                <div className="delete-modal__chips">
                                    <span className="badge badge-red">Catalog item</span>
                                    <span className="text-muted">This will remove the suggestion from the dropdown.</span>
                                </div>
                            </div>
                            <div className="delete-modal__warning">
                                This permanently deletes the product from the catalog. The action cannot be undone.
                            </div>
                        </div>
                        <div className="delete-modal__footer">
                            <button
                                type="button"
                                className="btn btn-sm btn-glass delete-modal__cancel"
                                onClick={() => { setShowDeleteProductModal(false); setDeletingProduct(null); }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm delete-modal__confirm"
                                onClick={confirmDeleteCatalogProduct}
                            >
                                Delete Product
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style jsx>{`
                .delete-modal {
                    width: min(95vw, 620px);
                    padding: 0;
                    overflow: hidden;
                    border-radius: 22px;
                    box-shadow: 0 24px 80px rgba(15, 23, 42, 0.24);
                    border: 1px solid rgba(239, 68, 68, 0.12);
                    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 248, 248, 0.98) 100%);
                }
                .delete-modal__hero {
                    background: linear-gradient(180deg, rgba(239, 68, 68, 0.12) 0%, rgba(239, 68, 68, 0.04) 100%);
                    border-bottom: 1px solid rgba(239, 68, 68, 0.12);
                }
                .delete-modal__head {
                    display: flex;
                    align-items: flex-start;
                    gap: 16px;
                    padding: 28px 30px 22px;
                }
                .delete-modal__icon {
                    width: 52px;
                    height: 52px;
                    border-radius: 16px;
                    display: grid;
                    place-items: center;
                    background: #fff;
                    color: var(--danger);
                    box-shadow: 0 10px 24px rgba(239, 68, 68, 0.14);
                    flex: 0 0 auto;
                }
                .delete-modal__copy {
                    flex: 1;
                    min-width: 0;
                }
                .delete-modal__eyebrow {
                    font-size: 11px;
                    font-weight: 800;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                    color: var(--danger);
                    margin-bottom: 8px;
                }
                .delete-modal__title {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 900;
                    line-height: 1.2;
                    color: var(--text-main);
                }
                .delete-modal__subtitle {
                    margin-top: 10px;
                    color: var(--text-muted);
                    font-size: 13.5px;
                    line-height: 1.55;
                }
                .delete-modal__subtitle strong {
                    color: var(--text-main);
                }
                .delete-modal__body {
                    padding: 22px 30px 18px;
                }
                .delete-modal__summary {
                    padding: 16px 18px;
                    border-radius: 16px;
                    background: var(--surface-2);
                    border: 1px solid var(--border);
                    margin-bottom: 14px;
                }
                .delete-modal__summary-top {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 12px;
                }
                .delete-modal__label {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: var(--text-muted);
                    font-weight: 800;
                    margin-bottom: 6px;
                }
                .delete-modal__item-name {
                    font-size: 15px;
                    font-weight: 900;
                    color: var(--text-main);
                    line-height: 1.3;
                }
                .delete-modal__batch {
                    margin-top: 6px;
                    font-size: 12px;
                    color: var(--text-muted);
                }
                .delete-modal__chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    align-items: center;
                }
                .delete-modal__warning {
                    padding: 14px 16px;
                    border-radius: 14px;
                    background: rgba(239, 68, 68, 0.06);
                    border: 1px solid rgba(239, 68, 68, 0.18);
                    color: var(--danger);
                    font-weight: 700;
                    font-size: 13px;
                    line-height: 1.5;
                }
                .delete-modal__footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    padding: 0 30px 28px;
                }
                .delete-modal__cancel,
                .delete-modal__confirm {
                    min-width: 104px;
                    height: 44px;
                    border-radius: 12px;
                }
                .delete-modal__confirm {
                    min-width: 132px;
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    border-color: #dc2626;
                    color: #fff;
                    font-weight: 900;
                    box-shadow: 0 10px 20px rgba(239, 68, 68, 0.18);
                }
            `}</style>
        </div>
    );
}

export function EditStoreInventoryModal({ item, storeNames, onSave, onClose }: { item: any; storeNames?: string[]; onSave: (fields: any) => void; onClose: () => void }) {
    const { toast } = usePopup();

    // Helper to safely get keys from a field that might be null/non-object
    const safeKeys = (obj: any) => (obj && typeof obj === 'object' && !Array.isArray(obj)) ? Object.keys(obj) : [];
    const safeObj = (obj: any): Record<string, number> => (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};

    // Build initial assigned quantities — prefer sizeQuantitiesAssigned, fall back to sizeQuantitiesRemaining
    const initialSizeQuantitiesAssigned: Record<string, number> = Object.keys(safeObj(item?.sizeQuantitiesAssigned)).length > 0
        ? safeObj(item?.sizeQuantitiesAssigned)
        : safeObj(item?.sizeQuantitiesRemaining);
    const initialColorQuantitiesAssigned: Record<string, number> = Object.keys(safeObj(item?.colorQuantitiesAssigned)).length > 0
        ? safeObj(item?.colorQuantitiesAssigned)
        : safeObj(item?.colorQuantitiesRemaining);

    // sizeKeys: union of assigned keys + warehouse size keys (passed from inventory page)
    const sizeKeys = Array.from(new Set([
        ...safeKeys(item?.sizeQuantities),
        ...safeKeys(item?.sizeQuantitiesAssigned),
        ...safeKeys(item?.sizeQuantitiesRemaining),
    ]));
    const colorKeys = Array.from(new Set([
        ...safeKeys(item?.colorQuantities),
        ...safeKeys(item?.colorQuantitiesAssigned),
        ...safeKeys(item?.colorQuantitiesRemaining),
    ]));
    const initialVariantQuantitiesAssigned = Object.keys(safeObj(item?.variantQuantitiesAssigned)).length > 0
        ? item?.variantQuantitiesAssigned
        : (item?.variantQuantitiesRemaining || {});
    const variantKeys = Object.keys(item?.variantQuantities || item?.variantQuantitiesAssigned || item?.variantQuantitiesRemaining || {});
    const variantSizeKeys = Array.from(new Set(Object.values((item?.variantQuantities || item?.variantQuantitiesAssigned || item?.variantQuantitiesRemaining || {}) as VariantQuantities).flatMap(sizes => Object.keys(sizes || {}))));
    const [form, setForm] = useState({
        storeName: item?.storeName || (storeNames && storeNames[0]) || '',
        ownerSupplyPrice: item?.ownerSupplyPrice || 0,
        commissionPercent: item?.commissionPercent || 0,
        storeSellingPrice: item?.storeSellingPrice || item?.ownerSupplyPrice || 0,
        quantityAssigned: item?.quantityAssigned || 0,
        quantityRemaining: item?.quantityRemaining || 0,
        sizeQuantitiesAssigned: initialSizeQuantitiesAssigned as Record<string, number>,
        colorQuantitiesAssigned: initialColorQuantitiesAssigned as Record<string, number>,
        variantQuantitiesAssigned: buildVariantGrid(variantKeys, variantSizeKeys, initialVariantQuantitiesAssigned) as VariantQuantities,
        extraQty: item?.extraQty || item?.extra_Qty || 0,
    });

    React.useEffect(() => {
        if (!form.storeName && storeNames?.length) {
            setForm(prev => ({ ...prev, storeName: storeNames[0] }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeNames]);

    const hasVariantTracking = variantKeys.length > 0 && variantSizeKeys.length > 0;
    const hasSizeTracking = !hasVariantTracking && sizeKeys.length > 0;
    const hasColorTracking = !hasVariantTracking && colorKeys.length > 0;
    const totalSizeQuantity = Object.values(form.sizeQuantitiesAssigned).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    const totalColorQuantity = Object.values(form.colorQuantitiesAssigned).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    const totalVariantQuantity = variantGrandTotal(form.variantQuantitiesAssigned);
    const effectiveQuantityAssigned = hasVariantTracking ? totalVariantQuantity : hasSizeTracking ? totalSizeQuantity : hasColorTracking ? totalColorQuantity : Number(form.quantityAssigned) || 0;
    const currentAssigned = Number(item?.quantityAssigned) || 0;
    const warehouseTotalQty = Number(item?.totalQty || item?.quantityAssigned || 0);
    const warehouseAllottedQty = Number(item?.allotedQty || item?.quantityAssigned || 0);
    const warehouseRemainingQty = Math.max(0, warehouseTotalQty - warehouseAllottedQty);
    const maxEditableAssigned = currentAssigned + warehouseRemainingQty;
    const remainingForIncrease = Math.max(0, warehouseRemainingQty - Math.max(0, effectiveQuantityAssigned - currentAssigned));

    const editableCapForSize = (size: string) => {
        const warehouseRemaining = Number((item?.sizeQuantitiesRemaining as any)?.[size] ?? (item?.sizeQuantities as any)?.[size] ?? 0) || 0;
        const current = Number((item?.sizeQuantitiesAssigned as any)?.[size] ?? 0) || 0;
        return Math.max(0, warehouseRemaining + current);
    };

    const editableCapForColor = (color: string) => {
        const warehouseRemaining = Number((item?.colorQuantitiesRemaining as any)?.[color] ?? (item?.colorQuantities as any)?.[color] ?? 0) || 0;
        const current = Number((item?.colorQuantitiesAssigned as any)?.[color] ?? 0) || 0;
        return Math.max(0, warehouseRemaining + current);
    };

    const buildEditableVariantCaps = () => {
        const caps: VariantQuantities = {};
        // Prefer the pre-computed warehouse-level remaining (total - OTHER stores' allotments).
        // Fall back to variantQuantitiesRemaining or full variantQuantities if not provided.
        const warehouseRemaining = (item?.warehouseVariantQuantitiesRemaining || item?.variantQuantitiesRemaining || item?.variantQuantities || {}) as VariantQuantities;
        const current = (item?.variantQuantitiesAssigned || {}) as VariantQuantities;
        const colors = Array.from(new Set([...Object.keys(warehouseRemaining || {}), ...Object.keys(current || {})]));

        colors.forEach((color) => {
            const sizeKeysForColor = Array.from(new Set([
                ...Object.keys((warehouseRemaining?.[color] || {}) as Record<string, number>),
                ...Object.keys((current?.[color] || {}) as Record<string, number>),
            ]));
            caps[color] = {};
            sizeKeysForColor.forEach((size) => {
                // cap = warehouseRemaining + thisStore's current assignment.
                // This lets the user keep existing values while "remaining" label = cap - currentVal = warehouseRemaining.
                const remaining = Number((warehouseRemaining?.[color] as any)?.[size] ?? 0) || 0;
                const assigned = Number((current?.[color] as any)?.[size] ?? 0) || 0;
                caps[color][size] = Math.max(0, remaining + assigned);
            });
        });

        return caps;
    };

    /** Computes per-cell "addable remaining" for the display label:
     *  warehouseRemaining[color][size] - thisStore's currentAssigned[color][size]
     *  This is what the user can still add, used for the "X left" label in the grid.
     */
    const buildVariantRemainingForDisplay = (): VariantQuantities => {
        const warehouseRemaining = (item?.warehouseVariantQuantitiesRemaining || item?.variantQuantitiesRemaining || item?.variantQuantities || {}) as VariantQuantities;
        const current = (item?.variantQuantitiesAssigned || {}) as VariantQuantities;
        const result: VariantQuantities = {};
        const colors = Array.from(new Set([...Object.keys(warehouseRemaining), ...Object.keys(current)]));
        colors.forEach(color => {
            const sizeKeys = Array.from(new Set([
                ...Object.keys((warehouseRemaining[color] || {}) as Record<string, number>),
                ...Object.keys((current[color] || {}) as Record<string, number>),
            ]));
            result[color] = {};
            sizeKeys.forEach(size => {
                const wareRemaining = Number((warehouseRemaining[color] as any)?.[size] ?? 0) || 0;
                const assigned = Number((current[color] as any)?.[size] ?? 0) || 0;
                result[color][size] = Math.max(0, wareRemaining - assigned);
            });
        });
        return result;
    };

    const updateSizeQuantity = (size: string, qty: number) => {
        const maxForSize = editableCapForSize(size);
        setForm(curr => ({
            ...curr,
            sizeQuantitiesAssigned: {
                ...curr.sizeQuantitiesAssigned,
                [size]: Math.max(0, Math.min(qty, maxForSize)),
            },
        }));
    };

    const updateColorQuantity = (color: string, qty: number) => {
        const maxForColor = editableCapForColor(color);
        setForm(curr => ({
            ...curr,
            colorQuantitiesAssigned: {
                ...curr.colorQuantitiesAssigned,
                [color]: Math.max(0, Math.min(qty, maxForColor)),
            },
        }));
    };

    const distributeSizeEqually = () => {
        if (!hasSizeTracking) return;
        if (!sizeKeys.length) return;
        const total = Number(form.quantityAssigned) || 0;
        const qtyPerSize = Math.floor(total / sizeKeys.length);
        const next: Record<string, number> = {};
        sizeKeys.forEach((size) => {
            const maxForSize = editableCapForSize(size);
            next[size] = Math.min(qtyPerSize, maxForSize);
        });
        setForm(curr => ({ ...curr, sizeQuantitiesAssigned: next, quantityAssigned: Object.values(next).reduce((s, v) => s + v, 0) }));
        toast.success('Distributed equally across sizes');
    };

    const distributeColorEqually = () => {
        if (!hasColorTracking) return;
        if (!colorKeys.length) return;
        const total = Number(form.quantityAssigned) || 0;
        const qtyPerColor = Math.floor(total / colorKeys.length);
        const next: Record<string, number> = {};
        colorKeys.forEach((color) => {
            const maxForColor = editableCapForColor(color);
            next[color] = Math.min(qtyPerColor, maxForColor);
        });
        setForm(curr => ({ ...curr, colorQuantitiesAssigned: next, quantityAssigned: Object.values(next).reduce((s, v) => s + v, 0) }));
        toast.success('Distributed equally across colors');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const assigned = effectiveQuantityAssigned;
        const increaseDelta = Math.max(0, assigned - currentAssigned);
        const soldCount = Math.max(0, currentAssigned - (Number(item?.quantityRemaining) || 0));
        const remaining = Math.max(0, assigned - soldCount);

        if (assigned < 1) return toast.error('Total items sent must be at least 1');
        if (assigned < soldCount) return toast.error(`Total assigned cannot be less than sold items (${soldCount})`);
        if (increaseDelta > warehouseRemainingQty) return toast.error(`Quantity increase exceeds warehouse remaining (${warehouseRemainingQty})`);
        if (remaining < 0) return toast.error('Remaining quantity cannot be less than 0');
        if (remaining > assigned) return toast.error('Remaining cannot exceed total sent');

        if (hasVariantTracking && totalVariantQuantity < 1) return toast.error('Enter quantities for at least one color-size pair');
        if (hasSizeTracking && totalSizeQuantity < 1) return toast.error('Enter quantities for at least one size');
        if (hasColorTracking && totalColorQuantity < 1) return toast.error('Enter quantities for at least one color');

        if (hasVariantTracking && assigned !== totalVariantQuantity) {
            return toast.error('Total assigned must match the variant grid total');
        }
        if (hasSizeTracking && assigned !== totalSizeQuantity) {
            return toast.error('Total assigned must match the size breakdown total');
        }
        if (!hasSizeTracking && hasColorTracking && assigned !== totalColorQuantity) {
            return toast.error('Total assigned must match the color breakdown total');
        }

        const fields: any = {};
        if (form.ownerSupplyPrice !== undefined) fields.owner_supply_price = Number(form.ownerSupplyPrice) || 0;
        if (form.commissionPercent !== undefined) fields.commission_percent = Number(form.commissionPercent) || 0;
        if (form.storeSellingPrice !== undefined) fields.store_selling_price = Number(form.storeSellingPrice) || 0;
        if (form.quantityAssigned !== undefined || hasSizeTracking || hasColorTracking) fields.quantity_assigned = effectiveQuantityAssigned;
        if (form.quantityRemaining !== undefined) fields.quantity_remaining = remaining;
        if (form.storeName) fields.storeName = form.storeName;
        if (hasVariantTracking) fields.variant_quantities_assigned = form.variantQuantitiesAssigned;
        if (hasSizeTracking) fields.size_quantities_assigned = form.sizeQuantitiesAssigned;
        if (hasColorTracking) fields.color_quantities_assigned = form.colorQuantitiesAssigned;
        if (form.extraQty !== undefined) fields.extra_Qty = Number(form.extraQty) || 0;

        onSave(fields);
        onClose();
    };

    const sold = (item?.quantityAssigned || 0) - (item?.quantityRemaining || 0);

    const handleAssignedChange = (val: string) => {
        const parsed = parseInt(val) || 0;
        const newAssigned = Math.max(sold, Math.min(parsed, maxEditableAssigned));
        // Keep sold count constant: newRemaining = newAssigned - currentSold
        const newRemaining = Math.max(0, newAssigned - sold);
        setForm({ ...form, quantityAssigned: newAssigned, quantityRemaining: newRemaining });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '780px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-head" style={{ padding: '16px 20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Edit Allotment</h3>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: '18px' }}>✕</button>
                </div>
                <div className="modal-body" style={{ padding: '22px 20px' }}>
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Current Status:</span>
                            <Badge type={sold > 0 ? 'blue' : 'gray'}>Items Sold: {sold}</Badge>
                        </div>

                        {/* Row 1: Store Name + Item Name */}
                        <div className="form-grid-2" style={{ marginBottom: 16 }}>
                            <div className="input-group">
                                <label>Store Name</label>
                                <select value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} required>
                                    {(storeNames || []).map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label>Item Name</label>
                                <input readOnly value={item?.productName || item?.batchNumber || 'Unknown'} style={{ background: 'var(--surface-2)', fontWeight: 700 }} />
                            </div>
                        </div>

                        {/* Row 2: Quantity + Cost/PC (Warehouse) */}
                        <div className="form-grid-2" style={{ marginBottom: 16 }}>
                            <div className="input-group">
                                <label>Quantity (Remaining {warehouseRemainingQty})</label>
                                {hasSizeTracking || hasColorTracking ? (
                                    <input type="text" inputMode="numeric" value={form.quantityAssigned} onChange={(e) => handleAssignedChange(e.target.value)} placeholder="Enter total for equal distribution" />
                                ) : (
                                    <input type="text" inputMode="numeric" value={form.quantityAssigned} onChange={(e) => handleAssignedChange(e.target.value)} required />
                                )}
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                    Total Qty: <b>{warehouseTotalQty}</b> · Allotted Qty: <b>{warehouseAllottedQty}</b> · Remaining: <b>{warehouseRemainingQty}</b> · Increase left: <b>{remainingForIncrease}</b>
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Cost/PC (Warehouse)</label>
                                <input readOnly value={'Rs ' + (Number(item?.ownerSupplyPrice) || 0).toLocaleString()} style={{ background: 'var(--surface-2)', fontWeight: 800 }} />
                            </div>
                        </div>

                        {/* Variant tracking */}
                        {hasVariantTracking && (
                            <VariantQuantityGrid
                                colors={variantKeys}
                                sizes={variantSizeKeys}
                                values={form.variantQuantitiesAssigned}
                                maxValues={buildEditableVariantCaps()}
                                remainingValues={buildVariantRemainingForDisplay()}
                                title="Allotment by Color & Size"
                                showRemainingLabel={true}
                                onChange={next => {
                                    const rollups = rollupVariantQuantities(next);
                                    setForm(curr => ({
                                        ...curr,
                                        variantQuantitiesAssigned: next,
                                        sizeQuantitiesAssigned: rollups.sizeQuantities || {},
                                        colorQuantitiesAssigned: rollups.colorQuantities || {},
                                        quantityAssigned: rollups.total,
                                        quantityRemaining: Math.max(0, rollups.total - sold),
                                    }));
                                }}
                            />
                        )}

                        {/* Size tracking */}
                        {hasSizeTracking && (
                            <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Quantity per Size</div>
                                    <button type="button" className="btn btn-sm btn-primary" onClick={distributeSizeEqually} style={{ padding: '4px 12px', fontSize: 11 }}>Equal Distribution</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
                                    {sizeKeys.map((size) => (
                                        <div key={size} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                                                {size} <span style={{ fontSize: 10 }}>(remaining: {(item?.sizeQuantitiesRemaining as any)?.[size] ?? (item?.sizeQuantities as any)?.[size] ?? 0})</span>
                                            </label>
                                            <input type="number" min="0" value={form.sizeQuantitiesAssigned[size] || 0} onChange={e => updateSizeQuantity(size, parseInt(e.target.value) || 0)} />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 12, padding: '8px 12px', background: totalSizeQuantity > 0 ? 'var(--primary)' : 'var(--surface-1)', color: 'var(--text)', borderRadius: 6, fontSize: 13, fontWeight: 800, textAlign: 'center' }}>
                                    Total: {totalSizeQuantity} units
                                </div>
                            </div>
                        )}

                        {/* Color tracking */}
                        {hasColorTracking && (
                            <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Quantity per Color</div>
                                    <button type="button" className="btn btn-sm btn-primary" onClick={distributeColorEqually} style={{ padding: '4px 12px', fontSize: 11 }}>Equal Distribution</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
                                    {colorKeys.map((color) => (
                                        <div key={color} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                                {color} <span style={{ fontSize: 10 }}>(remaining: {(item?.colorQuantitiesRemaining as any)?.[color] ?? (item?.colorQuantities as any)?.[color] ?? 0})</span>
                                            </label>
                                            <input type="number" min="0" value={form.colorQuantitiesAssigned[color] || 0} onChange={e => updateColorQuantity(color, parseInt(e.target.value) || 0)} />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 12, padding: '8px 12px', background: totalColorQuantity > 0 ? 'var(--primary)' : 'var(--surface-1)', color: 'var(--text)', borderRadius: 6, fontSize: 13, fontWeight: 800, textAlign: 'center' }}>
                                    Total: {totalColorQuantity} units
                                </div>
                            </div>
                        )}

                        {/* Row 3: New Price (Supply to Store) + Partner Commission % */}
                        <div className="form-grid-2" style={{ marginBottom: 18 }}>
                            <div className="input-group">
                                <label>New Price (Supply to Store)</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={form.ownerSupplyPrice}
                                    onChange={(e) => setForm({ ...form, ownerSupplyPrice: parseFloat(e.target.value) || 0 })}
                                    required
                                    style={{ borderColor: (Number(item?.ownerSupplyPrice) > 0 && Number(form.ownerSupplyPrice) < Number(item?.ownerSupplyPrice)) ? 'var(--danger)' : undefined }}
                                />
                                {Number(item?.ownerSupplyPrice) > 0 && (
                                    <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color: Number(form.ownerSupplyPrice) < Number(item?.ownerSupplyPrice) ? 'var(--danger)' : 'var(--text-muted)' }}>
                                        Min: Rs {Number(item?.ownerSupplyPrice).toLocaleString()} (warehouse cost)
                                    </div>
                                )}
                            </div>
                            <div className="input-group">
                                <label>Partner Commission %</label>
                                <input type="text" inputMode="decimal" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: parseFloat(e.target.value) || 0 })} required />
                            </div>
                        </div>

                        {/* Row 4: Extra Qty — half width left only, matching Alot to Store */}
                        <div style={{ marginBottom: 18 }}>
                            <div className="input-group" style={{ maxWidth: '50%' }}>
                                <label>Extra Qty <span style={{ fontSize: '10px', fontWeight: 400, color: '#8c8c8c' }}>(gift / display — expensed at cost)</span></label>
                                <input type="text" inputMode="numeric" value={form.extraQty} onChange={(e) => setForm({ ...form, extraQty: parseInt(e.target.value) || 0 })} placeholder="0" />
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-full" style={{ height: 48, fontSize: '14px', fontWeight: 800 }}>Save Allotment</button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export function EditInventoryModal({ item, minQuantity, onSave, onClose, products }: { item: InventoryItem; minQuantity?: number; onSave: (fields: any) => void; onClose: () => void; products?: Product[] }) {
    const { toast } = usePopup();
    const catalogTypes = uniqueCatalogValues([
        ...DEFAULT_PRODUCT_TYPES,
        ...(products || []).map(p => p.productType).filter(Boolean),
    ]);
    const itemTypes = catalogTypes;
    const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

    // Safely parse quantity fields that may arrive as JSON strings from the API
    const safeParseQty = (v: any) => {
        if (!v) return null;
        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
        return typeof v === 'object' && !Array.isArray(v) ? v : null;
    };
    const parsedSizeQuantities = safeParseQty(item.sizeQuantities);
    const parsedColorQuantities = safeParseQty(item.colorQuantities);
    const parsedVariantQuantities = safeParseQty(item.variantQuantities);

    // Derive colors/sizes — when variant data exists, its keys are authoritative over product arrays
    const colorsFromProduct = Array.isArray(item.color) ? item.color : item.color ? [item.color] : [];
    const sizesFromProduct = Array.isArray(item.size) ? item.size : item.size ? [item.size] : [];
    const colorsFromVariants = parsedVariantQuantities ? Object.keys(parsedVariantQuantities) : [];
    const colorsFromColorQty = parsedColorQuantities ? Object.keys(parsedColorQuantities) : [];
    const sizesFromSizeQty = parsedSizeQuantities ? Object.keys(parsedSizeQuantities) : [];
    const sizesFromVariants = parsedVariantQuantities
        ? Array.from(new Set(Object.values(parsedVariantQuantities).flatMap((s: any) => Object.keys(s || {}))))
        : [];
    // Variant/quantity keys are authoritative when present (they hold the actual stored data)
    const initialColors = colorsFromVariants.length > 0 ? colorsFromVariants
        : colorsFromColorQty.length > 0 ? colorsFromColorQty
        : colorsFromProduct;
    const initialSizes = sizesFromVariants.length > 0 ? sizesFromVariants
        : sizesFromSizeQty.length > 0 ? sizesFromSizeQty
        : sizesFromProduct;
    const initialSizeQuantities = parsedSizeQuantities || {};
    const initialColorQuantities = parsedColorQuantities || {};
    const initialVariantQuantities = parsedVariantQuantities || {};
    const hasCustomType = item.category && !catalogTypes.some(t => normalizeCatalogValue(t) === normalizeCatalogValue(item.category));

    const [form, setForm] = useState({
        productName: item.productName || '',
        brandName: item.brand || '',
        productType: hasCustomType ? 'Other' : (item.category || 'T-shirt'),
        customType: hasCustomType ? item.category : '',
        batchNumber: item.batchNumber || '',
        costPrice: item.costPrice || 0,
        sellingPrice: item.sellingPrice || 0,
        lowStockWarning: item.lowStockWarning || 5,
        quantityAvailable: item.quantityAvailable || 0,
    });

    const [colors, setColors] = useState<string[]>(initialColors);
    const [colorInput, setColorInput] = useState('');
    const [colorQuantities, setColorQuantities] = useState<Record<string, number>>(initialColorQuantities);
    const [sizes, setSizes] = useState<string[]>(initialSizes);
    const [customSize, setCustomSize] = useState('');
    const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>(initialSizeQuantities);
    const [variantQuantities, setVariantQuantities] = useState<VariantQuantities>(buildVariantGrid(initialColors, initialSizes, initialVariantQuantities));
    const [newPicture, setNewPicture] = useState<string | null>(null);
    // Track whether we've completed the initial mount so effects don't wipe loaded data
    const isMounted = React.useRef(false);

    const previewImage = newPicture || item.productImage || (item.otherVariants?.picture as string | undefined) || '';

    React.useEffect(() => {
        // Skip on initial mount — quantities are already set from initialVariantQuantities
        if (!isMounted.current) {
            isMounted.current = true;
            return;
        }
        if (colors.length && sizes.length) {
            setVariantQuantities(curr => {
                const next = buildVariantGrid(colors, sizes, curr);
                const rollups = rollupVariantQuantities(next);
                setSizeQuantities(rollups.sizeQuantities || {});
                setColorQuantities(rollups.colorQuantities || {});
                return next;
            });
            return;
        }
        setSizeQuantities((curr) => {
            const next = { ...curr };
            sizes.forEach((s) => {
                if (next[s] === undefined) next[s] = 0;
            });
            Object.keys(next).forEach((s) => {
                if (!sizes.includes(s)) delete next[s];
            });
            return next;
        });
    }, [sizes, colors]);

    React.useEffect(() => {
        // Skip on initial mount
        if (!isMounted.current) return;
        setColorQuantities((curr) => {
            const next = { ...curr };
            colors.forEach((c) => {
                if (next[c] === undefined) next[c] = 0;
            });
            Object.keys(next).forEach((c) => {
                if (!colors.includes(c)) delete next[c];
            });
            return next;
        });
    }, [colors]);

    const hasVariantGrid = colors.length > 0 && sizes.length > 0;
    const variantQuantityTotal = variantGrandTotal(variantQuantities);
    const totalQuantity = hasVariantGrid ? variantQuantityTotal : Math.max(0, Number(form.quantityAvailable) || 0);

    const handleAddColor = () => {
        const color = colorInput.trim();
        if (!color) return;
        const normalized = color.toLowerCase();
        if (!colors.includes(normalized)) {
            setColors([...colors, normalized]);
            setColorQuantities((curr) => ({ ...curr, [normalized]: curr[normalized] ?? 0 }));
        }
        setColorInput('');
    };

    const distinctColors = uniqueCatalogValues((products || []).flatMap(product => Array.isArray(product.colors) ? product.colors : []).filter(Boolean));
    const handleDeleteCatalogColor = (colorName: string) => {
        // Simple local delete hint: remove from current selection and inform user.
        setColors(prev => prev.filter(c => normalizeCatalogValue(c) !== normalizeCatalogValue(colorName)));
        setColorQuantities(curr => {
            const next = { ...curr };
            Object.keys(next).forEach(key => {
                if (normalizeCatalogValue(key) === normalizeCatalogValue(colorName)) {
                    delete next[key];
                }
            });
            return next;
        });
        toast.success('Color removed locally');
    };

    const toggleSize = (size: string) => {
        setSizes(prev => {
            const next = prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size];
            setSizeQuantities((curr) => {
                const updated = { ...curr };
                if (!prev.includes(size)) {
                    updated[size] = updated[size] ?? 0;
                } else {
                    delete updated[size];
                }
                return updated;
            });
            return next;
        });
    };

    const handleAddCustomSize = () => {
        const custom = customSize.trim();
        if (!custom) return;
        const upperSize = custom.toUpperCase();
        if (!sizes.includes(upperSize)) {
            setSizes([...sizes, upperSize]);
            setSizeQuantities((curr) => ({ ...curr, [upperSize]: curr[upperSize] ?? 0 }));
        }
        setCustomSize('');
    };

    const updateSizeQuantity = (size: string, qty: number) => {
        setSizeQuantities(curr => ({
            ...curr,
            [size]: Math.max(0, qty)
        }));
    };

    const updateColorQuantity = (color: string, qty: number) => {
        setColorQuantities(curr => ({
            ...curr,
            [color]: Math.max(0, qty)
        }));
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setNewPicture(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const productName = form.productName.trim();
        if (!productName) return toast.error('Enter product name');

        const brandNameValue = form.brandName.trim();
        if (!brandNameValue) return toast.error('Enter brand name');

        const productType = form.productType === 'Other'
            ? form.customType.trim()
            : form.productType.trim();
        if (!productType) return toast.error('Select product type');

        const batchNumber = form.batchNumber.trim();
        if (!batchNumber) return toast.error('Enter batch number');

        const minQty = Number(minQuantity) || 0;
        if (totalQuantity < minQty) {
            return toast.error(`Quantity cannot be below assigned (${minQty})`);
        }

        if (sizes.length === 0 && colors.length === 0 && Number(form.quantityAvailable) < 0) {
            return toast.error('Enter a valid total quantity');
        }

        const variantRollups = rollupVariantQuantities(variantQuantities);
        const normalizedVariantQuantities = hasVariantGrid && variantRollups.total > 0 ? variantQuantities : null;
        const normalizedSizeQuantities = normalizedVariantQuantities ? variantRollups.sizeQuantities : (Object.keys(sizeQuantities).length ? sizeQuantities : null);
        const normalizedColorQuantities = normalizedVariantQuantities ? variantRollups.colorQuantities : (Object.keys(colorQuantities).length ? colorQuantities : null);
        const payload: any = {
            inventory: {
                batchNumber,
                costPrice: Number(form.costPrice) || 0,
                sellingPrice: Number(form.sellingPrice) || 0,
                lowStockWarning: Number(form.lowStockWarning) || 0,
                quantityAvailable: totalQuantity,
                variantQuantities: normalizedVariantQuantities ?? undefined,
                sizeQuantities: normalizedSizeQuantities ?? undefined,
                colorQuantities: normalizedColorQuantities ?? undefined,
            },
            product: {
                productName,
                brandName: form.brandName.trim(),
                productType,
                colors: colors.filter(Boolean),
                sizes: sizes.filter(Boolean),
            }
        };

        if (newPicture && newPicture.startsWith('data:image')) {
            payload.picture = newPicture;
        }

        onSave(payload);
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '860px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-head" style={{ padding: '16px 20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Edit Inventory</h3>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: '18px' }}>✕</button>
                </div>
                <div className="modal-body" style={{ padding: '22px 20px' }}>
                    <form onSubmit={handleSubmit}>
                        <div className="input-group" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <label style={{ marginBottom: 12 }}>Item Picture</label>
                            <div
                                style={{
                                    width: '100px',
                                    height: '100px',
                                    border: '2px dashed var(--border)',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'var(--surface-2)',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    position: 'relative'
                                }}
                                onClick={() => document.getElementById('edit-item-pic-input')?.click()}
                            >
                                {previewImage ? (
                                    <img src={previewImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ fontSize: '24px', color: 'var(--text-faint)' }}>+</span>
                                )}
                                <input
                                    id="edit-item-pic-input"
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={handleImageChange}
                                />
                            </div>
                            {!previewImage && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 8 }}>Click to upload</span>}
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 12 }}>
                            <div className="input-group">
                                <label>Product Name <span style={{ color: 'var(--danger)', marginLeft: 6 }}>*</span></label>
                                <input value={form.productName} readOnly style={{ background: 'var(--surface-2)', cursor: 'default' }} required />
                            </div>
                            <div className="input-group">
                                <label>Brand Name <span style={{ color: 'var(--danger)', marginLeft: 6 }}>*</span></label>
                                <input value={form.brandName} readOnly style={{ background: 'var(--surface-2)', cursor: 'default' }} required />
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 12 }}>
                            <div className="input-group">
                                <CatalogInput
                                    label="Product Type"
                                    value={form.productType}
                                    onChange={value => setForm({ ...form, productType: value })}
                                    placeholder="Type a product type and press Enter"
                                    options={itemTypes}
                                    onPick={value => setForm({ ...form, productType: value })}
                                    onCommit={() => {}}
                                    getOptionLabel={(v) => v}
                                    required
                                    readOnly
                                    onDelete={(opt) => {
                                        // hide locally by marking as custom 'Other' if it matches
                                        if (normalizeCatalogValue(opt) === normalizeCatalogValue(form.productType)) {
                                            setForm({ ...form, productType: 'Other', customType: '' });
                                        }
                                    }}
                                />
                                {form.productType === 'Other' && (
                                    <input
                                        style={{ marginTop: 8 }}
                                        placeholder="Enter custom type..."
                                        value={form.customType}
                                        onChange={e => setForm({ ...form, customType: e.target.value })}
                                        required
                                    />
                                )}
                            </div>
                            <div className="input-group">
                                <label>Item ID (Batch)</label>
                                <input value={form.batchNumber} readOnly style={{ background: 'var(--surface-2)', cursor: 'default' }} />
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 12 }}>
                            <div className="input-group">
                                <label>Cost Per Piece</label>
                                <input type="text" inputMode="decimal" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="input-group">
                                <label>Selling Price</label>
                                <input type="text" inputMode="decimal" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 12 }}>
                            <div className="input-group">
                                <label>Low Stock Warning</label>
                                <input type="text" inputMode="numeric" value={form.lowStockWarning} onChange={e => setForm({ ...form, lowStockWarning: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div className="input-group">
                                <label>Total Quantity</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={hasVariantGrid ? totalQuantity : form.quantityAvailable}
                                    readOnly={hasVariantGrid}
                                    onChange={e => setForm({ ...form, quantityAvailable: parseInt(e.target.value) || 0 })}
                                    style={hasVariantGrid ? { background: 'var(--surface-2)', cursor: 'default' } : undefined}
                                />
                                {minQuantity ? (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Assigned to stores: {minQuantity}</div>
                                ) : null}
                                {hasVariantGrid && (
                                    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                                        Auto-calculated from variant grid totals.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: 12 }}>
                            <CatalogInput
                                label="Colors"
                                value={colorInput}
                                onChange={setColorInput}
                                placeholder="Add color (e.g. red, navy, #ffaa00)..."
                                options={distinctColors}
                                onPick={value => setColorInput(value)}
                                onCommit={handleAddColor}
                                getOptionLabel={(value) => value}
                                onDelete={handleDeleteCatalogColor}
                            />
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {colors.map(c => (
                                    <div key={c} style={{ padding: '6px 12px', borderRadius: '20px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: c, fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'capitalize' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                                        {c}
                                        <span style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => {
                                            setColors(colors.filter(x => x !== c));
                                            setColorQuantities(curr => {
                                                const next = { ...curr };
                                                delete next[c];
                                                return next;
                                            });
                                        }}>×</span>
                                    </div>
                                ))}
                                {colors.length === 0 && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No colors set.</div>
                                )}
                            </div>
                        </div>

                        {colors.length > 0 && !hasVariantGrid && (
                            <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>Quantity per Color</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                                    {colors.map(c => (
                                        <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{c}</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={colorQuantities[c] || 0}
                                                onChange={e => updateColorQuantity(c, parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="input-group" style={{ marginBottom: 12 }}>
                            <label>Sizes</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                {availableSizes.map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        className={`btn btn-sm ${sizes.includes(s) ? 'btn-primary' : 'btn-glass'}`}
                                        style={{ minWidth: 44 }}
                                        onClick={() => toggleSize(s)}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <input
                                    placeholder="Add custom size (e.g. 3XL)..."
                                    value={customSize}
                                    onChange={e => setCustomSize(e.target.value)}
                                    onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomSize())}
                                />
                                <button type="button" className="btn btn-sm" onClick={handleAddCustomSize} style={{ whiteSpace: 'nowrap' }}>+ Custom Size</button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {sizes.map(s => (
                                    <div key={s} style={{ padding: '6px 12px', borderRadius: '20px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'capitalize' }}>
                                        <span>{s}</span>
                                        <span style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => {
                                            setSizes(prev => prev.filter(x => x !== s));
                                            setSizeQuantities(curr => {
                                                const next = { ...curr };
                                                delete next[s];
                                                return next;
                                            });
                                        }}>×</span>
                                    </div>
                                ))}
                                {sizes.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No sizes set.</div>}
                            </div>
                        </div>

                        {sizes.length > 0 && !hasVariantGrid && (
                            <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>
                                    Quantity per Size
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                                    {sizes.map(s => (
                                        <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{s}</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={sizeQuantities[s] || 0}
                                                onChange={e => updateSizeQuantity(s, parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--primary)', color: 'var(--text)', borderRadius: 6, fontSize: 13, fontWeight: 800, textAlign: 'center' }}>
                                    Total from variants: {totalQuantity} units
                                </div>
                            </div>
                        )}

                        {hasVariantGrid && (
                            <>
                                <VariantQuantityGrid
                                    colors={colors}
                                    sizes={sizes}
                                    values={variantQuantities}
                                    onChange={next => {
                                        const rollups = rollupVariantQuantities(next);
                                        setVariantQuantities(next);
                                        setSizeQuantities(rollups.sizeQuantities || {});
                                        setColorQuantities(rollups.colorQuantities || {});
                                    }}
                                />
                                <div style={{ marginBottom: 16, padding: '8px 12px', background: variantQuantityTotal > 0 ? 'var(--primary)' : 'var(--surface-1)', color: 'var(--text)', borderRadius: 6, fontSize: 13, fontWeight: 800, textAlign: 'center' }}>
                                    Total from variants: {variantQuantityTotal} units
                                </div>
                            </>
                        )}

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="btn btn-primary">Save Changes</button>
                            <button type="button" className="btn btn-glass" onClick={onClose}>Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export function SaleModal({ inventory, storeName, isAdmin, storeNames, onAdd, onClose }: SaleModalPropsLocal) {
    const { toast } = usePopup();
    const todayIso = new Date().toISOString().slice(0, 10);
    const buildEmptyQuantities = (keys: string[]) => keys.reduce((acc, key) => {
        acc[key] = 0;
        return acc;
    }, {} as Record<string, number>);
    const [sale, setSale] = useState<any>({
        productId: '',
        productName: '',
        quantity: 0,
        extraQty: 0,
        sellingPrice: 0,
        shipmentCost: 0,
        extraCharges: 0,
        storeName: storeName || (storeNames && storeNames[0]) || 'Direct',
        clientName: '',
        occurredAt: todayIso,
    });

    const [currency, setCurrency] = useState<string>('PKR');
    const gbpRate = 360; // 1 GBP = 360 PKR (Default)

    const selectedItem = inventory.find(i => (sale.productId && i.productId === sale.productId) || (!sale.productId && i.productName === sale.productName));

    const variantQuantitiesRemaining = selectedItem?.variantQuantitiesRemaining
        ?? selectedItem?.variantQuantities
        ?? buildLegacyMaxVariantGrid(selectedItem?.colorQuantitiesRemaining ?? selectedItem?.colorQuantities, selectedItem?.sizeQuantitiesRemaining ?? selectedItem?.sizeQuantities);
    const variantColors = Object.keys(variantQuantitiesRemaining || {});
    const variantSizes = Array.from(new Set(Object.values(variantQuantitiesRemaining || {}).flatMap(sizes => Object.keys(sizes || {}))));
    const hasVariantGrid = variantColors.length > 0 && variantSizes.length > 0;
    const sizeQuantitiesRemaining = selectedItem?.sizeQuantitiesRemaining ?? selectedItem?.sizeQuantities;
    const colorQuantitiesRemaining = selectedItem?.colorQuantitiesRemaining ?? selectedItem?.colorQuantities;
    const availableSizesFromQuantities = sizeQuantitiesRemaining ? Object.entries(sizeQuantitiesRemaining).filter(([_, qty]) => (qty as number) > 0) : [];
    const availableColorsFromQuantities = colorQuantitiesRemaining ? Object.entries(colorQuantitiesRemaining).filter(([_, qty]) => (qty as number) > 0) : [];
    const availableSizes = availableSizesFromQuantities.length > 0
        ? availableSizesFromQuantities
        : Array.isArray(selectedItem?.sizes)
            ? selectedItem.sizes.map(size => [size, selectedItem?.quantityAvailable ?? 0] as [string, number])
            : [];
    const availableColors = availableColorsFromQuantities.length > 0
        ? availableColorsFromQuantities
        : Array.isArray(selectedItem?.colors)
            ? selectedItem.colors.map(color => [color, selectedItem?.quantityAvailable ?? 0] as [string, number])
            : [];
    const hasSizeTracking = !hasVariantGrid && availableSizes.length > 0;
    const hasColorTracking = !hasVariantGrid && availableColors.length > 0;

    const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>({});
    const [colorQuantities, setColorQuantities] = useState<Record<string, number>>({});
    const [variantQuantities, setVariantQuantities] = useState<VariantQuantities>({});

    const sizeKeys = availableSizes.map(([size]) => size);
    const colorKeys = availableColors.map(([color]) => color);

    const sizeQuantityTotal = Object.values(sizeQuantities).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    const colorQuantityTotal = Object.values(colorQuantities).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    const variantQuantityTotal = variantGrandTotal(variantQuantities);
    const hasAnyVariantBreakdown = hasVariantGrid || hasSizeTracking || hasColorTracking;
    const totalQuantity = hasVariantGrid
        ? variantQuantityTotal
        : hasAnyVariantBreakdown
        ? Math.max(sizeQuantityTotal, colorQuantityTotal, Number(sale.quantity) || 0)
        : Math.max(0, Number(sale.quantity) || 0);

    const updateSizeQuantity = (size: string, qty: number) => {
        const maxForSize = Number(sizeQuantitiesRemaining?.[size] ?? selectedItem?.quantityAvailable ?? 0);
        setSizeQuantities(curr => ({ ...curr, [size]: Math.max(0, Math.min(qty, maxForSize)) }));
    };

    const updateColorQuantity = (color: string, qty: number) => {
        const maxForColor = Number(colorQuantitiesRemaining?.[color] ?? selectedItem?.quantityAvailable ?? 0);
        setColorQuantities(curr => ({ ...curr, [color]: Math.max(0, Math.min(qty, maxForColor)) }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (hasVariantGrid && variantQuantityTotal < 1) {
            toast.error('Enter quantities for at least one color-size pair');
            return;
        }

        if (hasSizeTracking && sizeQuantityTotal < 1) {
            toast.error('Enter quantities for at least one size');
            return;
        }

        if (hasColorTracking && colorQuantityTotal < 1) {
            toast.error('Enter quantities for at least one color');
            return;
        }

        if (hasSizeTracking && hasColorTracking && sizeQuantityTotal > 0 && colorQuantityTotal > 0 && sizeQuantityTotal !== colorQuantityTotal) {
            toast.error('Size and color totals must match');
            return;
        }

        if (hasSizeTracking) {
            for (const [size, qty] of Object.entries(sizeQuantities)) {
                const maxForSize = Number(sizeQuantitiesRemaining?.[size] ?? selectedItem?.quantityAvailable ?? 0);
                if (Number(qty) > maxForSize) {
                    toast.error(`Only ${maxForSize} units available for size ${size}`);
                    return;
                }
            }
        }

        if (hasColorTracking) {
            for (const [color, qty] of Object.entries(colorQuantities)) {
                const maxForColor = Number(colorQuantitiesRemaining?.[color] ?? selectedItem?.quantityAvailable ?? 0);
                if (Number(qty) > maxForColor) {
                    toast.error(`Only ${maxForColor} units available for color ${color}`);
                    return;
                }
            }
        }

        if (totalQuantity <= 0) {
            toast.error('Enter a valid total quantity');
            return;
        }
        
        const finalPrice = currency === 'GBP' ? sale.sellingPrice * gbpRate : sale.sellingPrice;
        onAdd({
            ...sale,
            type: 'Sale',
            quantity: totalQuantity,
            sellingPrice: finalPrice,
            occurredAt: sale.occurredAt || todayIso,
            extraCharges: sale.extraCharges || 0,
            extraQty: sale.extraQty || 0,
            sizeQuantities: hasSizeTracking ? sizeQuantities : null,
            colorQuantities: hasColorTracking ? colorQuantities : null,
            variantQuantities: hasVariantGrid ? variantQuantities : null,
            productId: selectedItem?.productId || sale.productId || null,
        });
        onClose();
    };

    const currentPriceInPKR = currency === 'GBP' ? sale.sellingPrice * gbpRate : sale.sellingPrice;
    const totalBill = (currentPriceInPKR * totalQuantity);
    const totalDeductions = (isAdmin ? (sale.shipmentCost || 0) : 0) + (sale.extraCharges || 0);
    const netPayable = totalBill - totalDeductions;
    const totalDispatch = totalQuantity + (sale.extraQty || 0);

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '780px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-head" style={{ padding: '12px 20px' }}>
                    <h3 style={{ fontSize: '16px' }}>New Sale</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {['PKR', 'GBP'].map(curr => (
                            <button key={curr} type="button"
                                style={{
                                    padding: '2px 8px', fontSize: '10px', fontWeight: 800, borderRadius: 4,
                                    background: currency === curr ? 'var(--pri-600)' : '#f0f0f0',
                                    color: currency === curr ? '#fff' : '#8c8c8c', border: 'none', cursor: 'pointer'
                                }}
                                onClick={() => setCurrency(curr)}
                            >
                                {curr}
                            </button>
                        ))}
                        <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: '16px', marginLeft: 8 }}>✕</button>
                    </div>
                </div>
                <div className="modal-body" style={{ padding: '16px 20px' }}>
                    <form onSubmit={handleSubmit}>
                        <div className="form-grid-2">
                            <div className="input-group full-width">
                                <label>Select Product</label>
                                <select
                                    value={sale.productId || ''}
                                    onChange={e => {
                                        const item = inventory.find(i => (i.productId && i.productId === e.target.value) || i.productName === e.target.value);
                                        const nextVariants = item?.variantQuantitiesRemaining ?? item?.variantQuantities ?? {};
                                        const nextVariantColors = Object.keys(nextVariants);
                                        const nextVariantSizes = Array.from(new Set(Object.values(nextVariants).flatMap((sizes: any) => Object.keys(sizes || {}))));
                                        const nextSizeKeys = Array.isArray(item?.sizes) && item.sizes.length > 0 ? item.sizes : [];
                                        const nextColorKeys = Array.isArray(item?.colors) && item.colors.length > 0 ? item.colors : [];
                                        setSale({
                                            ...sale,
                                            productId: item?.productId || e.target.value,
                                            productName: item?.productName || '',
                                            sellingPrice: item?.sellingPrice || 0,
                                            quantity: 0,
                                        });
                                        setVariantQuantities(nextVariantColors.length && nextVariantSizes.length ? buildVariantGrid(nextVariantColors, nextVariantSizes) : {});
                                        setSizeQuantities(buildEmptyQuantities(nextSizeKeys));
                                        setColorQuantities(buildEmptyQuantities(nextColorKeys));
                                        setCurrency('PKR'); // Reset to PKR on item select
                                    }}
                                    required
                                >
                                    <option value="">Choose...</option>
                                    {inventory.map(i => (
                                        <option key={i.productId || i.productName} value={i.productId || i.productName}>
                                            {i.productName}{i.brandName ? ` • ${i.brandName}` : ''}{i.productType ? ` • ${i.productType}` : ''} ({i.quantityAvailable})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {hasVariantGrid && (
                                <div className="input-group full-width">
                                    <VariantQuantityGrid
                                        colors={variantColors}
                                        sizes={variantSizes}
                                        values={variantQuantities}
                                        maxValues={variantQuantitiesRemaining}
                                        title="Sale by Color & Size"
                                        showRemainingLabel={true}
                                        onChange={setVariantQuantities}
                                    />
                                </div>
                            )}

                            {hasSizeTracking && (
                                <div className="input-group full-width">
                                    <label>Quantity by Size</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                                        {availableSizes.map(([size, qty]) => (
                                            <div key={size} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                                                    {size} <span style={{ fontSize: 10 }}>(max: {qty})</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={sizeQuantities[size] || 0}
                                                    onChange={e => updateSizeQuantity(size, parseInt(e.target.value) || 0)}
                                                    style={{ padding: '8px 12px', fontSize: 14 }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {hasColorTracking && (
                                <div className="input-group full-width">
                                    <label>Quantity by Color</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                                        {availableColors.map(([color, qty]) => (
                                            <div key={color} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                                                    {color} <span style={{ fontSize: 10 }}>(max: {qty})</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={colorQuantities[color] || 0}
                                                    onChange={e => updateColorQuantity(color, parseInt(e.target.value) || 0)}
                                                    style={{ padding: '8px 12px', fontSize: 14 }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="input-group">
                                <label>Qty Sold</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={hasAnyVariantBreakdown ? totalQuantity : sale.quantity}
                                    readOnly={hasAnyVariantBreakdown}
                                    onChange={e => setSale({ ...sale, quantity: parseInt(e.target.value) || 0 })}
                                    style={hasAnyVariantBreakdown ? { background: 'var(--surface-2)', cursor: 'default' } : undefined}
                                />
                                {hasAnyVariantBreakdown && (
                                    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                                        Auto-calculated from size/color quantities.
                                    </div>
                                )}
                            </div>

                            {isAdmin && (
                            <div className="input-group">
                                <label>Extra Qty <span style={{ fontSize: '10px', fontWeight: 400, color: '#8c8c8c' }}>(free / bonus)</span></label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={sale.extraQty}
                                    onChange={e => setSale({ ...sale, extraQty: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            )}

                            <div className="input-group">
                                <label>Selling Price ({currency})</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={sale.sellingPrice}
                                    onChange={e => setSale({ ...sale, sellingPrice: parseFloat(e.target.value) || 0 })}
                                    style={{ fontWeight: 700 }}
                                />
                                {currency === 'GBP' && (
                                    <div style={{ fontSize: '10px', color: 'var(--success)', marginTop: 4, fontWeight: 600 }}>
                                        ≈ Rs {currentPriceInPKR.toLocaleString()} (Rate: {gbpRate})
                                    </div>
                                )}
                            </div>

                            {isAdmin && (
                            <div className="input-group">
                                <label style={{ color: 'var(--danger)', fontWeight: 700 }}>Shipment Cost (PKR)</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={sale.shipmentCost}
                                    onChange={e => setSale({ ...sale, shipmentCost: parseFloat(e.target.value) || 0 })}
                                    style={{ border: '1px solid var(--danger)' }}
                                />
                            </div>
                            )}

                            <div className="input-group">
                                <label style={{ color: 'var(--danger)', fontWeight: 700 }}>Extra Charges (PKR)</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={sale.extraCharges}
                                    onChange={e => setSale({ ...sale, extraCharges: parseFloat(e.target.value) || 0 })}
                                    style={{ border: '1px solid var(--danger)' }}
                                />
                            </div>

                            <div className="input-group full-width">
                                <label>Date of Sale</label>
                                <input
                                    type="date"
                                    value={sale.occurredAt}
                                    max={todayIso}
                                    onChange={e => setSale({ ...sale, occurredAt: e.target.value })}
                                />
                            </div>

                            {isAdmin && (
                                <div className="input-group full-width">
                                    <label>Location</label>
                                    <select value={sale.storeName} onChange={e => setSale({ ...sale, storeName: e.target.value })}>
                                        {Array.isArray(storeNames) && storeNames.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="input-group full-width">
                                <label>Customer Name</label>
                                <input placeholder="Client name..." value={sale.clientName} onChange={e => setSale({ ...sale, clientName: e.target.value })} />
                            </div>
                        </div>

                        <div style={{ marginTop: 20, padding: '12px 16px', background: '#f9fafb', borderRadius: 6, border: '1px solid #1890ff30' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ color: '#8c8c8c', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Gross Order Value:</span>
                                <span style={{ fontSize: '14px', fontWeight: 800 }}>Rs {totalBill.toLocaleString()}</span>
                            </div>
                            {sale.extraQty > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <span style={{ color: '#8c8c8c', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Total Dispatched:</span>
                                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{totalDispatch} units ({sale.quantity} sold + {sale.extraQty} free)</span>
                                </div>
                            )}
                            {totalDeductions > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Total Deductions:</span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--danger)' }}>- Rs {totalDeductions.toLocaleString()}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #eee', paddingTop: 8 }}>
                                <span style={{ color: '#000', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>Final Net Payable (Rs):</span>
                                <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--success)' }}>Rs {netPayable.toLocaleString()}</span>
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 16, height: 42, fontSize: '14px', fontWeight: 700 }}>
                            Save Transaction in PKR
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export function CreateStoreModal({ onSave, onClose }) {
    const [store, setStore] = useState({ 
        name: '', 
        partnerName: '', 
        partnerContact: '',
        commission: 10,
        storeId: 'STR-' + Math.random().toString(36).substr(2, 6).toUpperCase()
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(store);
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '440px' }}>
                <div className="modal-head" style={{ padding: '16px 20px' }}>
                    <h3 style={{ fontSize: '16px' }}>Add New Store Partner</h3>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: '16px' }}>✕</button>
                </div>
                <div className="modal-body" style={{ padding: '20px' }}>
                    <form onSubmit={handleSubmit}>
                        <div className="input-group" style={{ marginBottom: 16 }}>
                            <label>Store Name</label>
                            <input
                                required
                                placeholder="e.g. Trendy Wear Main"
                                value={store.name}
                                onChange={e => setStore({ ...store, name: e.target.value })}
                            />
                        </div>

                        <div className="input-group" style={{ marginBottom: 16 }}>
                            <label>Partner Name</label>
                            <input
                                required
                                placeholder="e.g. Hamza Khan"
                                value={store.partnerName}
                                onChange={e => setStore({ ...store, partnerName: e.target.value })}
                            />
                        </div>

                        <div className="input-group" style={{ marginBottom: 16 }}>
                            <label>Partner Contact / Phone</label>
                            <input
                                placeholder="e.g. +92 300 1234567"
                                value={store.partnerContact}
                                onChange={e => setStore({ ...store, partnerContact: e.target.value })}
                            />
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 16 }}>
                            <div className="input-group">
                                <label>Partner's Cut (%)</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={store.commission}
                                        onChange={e => setStore({ ...store, commission: parseFloat(e.target.value) })}
                                        style={{ paddingRight: 40 }}
                                    />
                                    <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-muted)' }}>%</span>
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Store ID</label>
                                <input
                                    readOnly
                                    value={store.storeId}
                                    style={{ background: '#f8fafc', cursor: 'not-allowed', fontWeight: 700, color: 'var(--acc)' }}
                                />
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-full" style={{ height: 48, fontSize: '14px', fontWeight: 700, marginTop: 12 }}>
                            Add Store Partner
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export function ReportModal({ data, onClose }: ReportModalProps) {
    const Rs = (n: number) => 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-PK');
    const pct = (n: number) => n.toFixed(1) + '%';

    // ── ISO week helper ──────────────────────────────────────────────────
    function getISOWeek(d: Date): number {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    }

    // ── State ────────────────────────────────────────────────────────────
    const now = new Date();
    const [view, setView]             = useState<'products' | 'stores' | 'expenses'>('products');
    const [periodType, setPeriodType] = useState<'all' | 'week' | 'month' | 'year'>('all');
    const [selYear, setSelYear]       = useState(now.getFullYear());
    const [selMonth, setSelMonth]     = useState(now.getMonth() + 1);
    const [selWeek, setSelWeek]       = useState(getISOWeek(now));
    const [sortKey, setSortKey]       = useState('revenue');
    const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');

    // ── Period filter ────────────────────────────────────────────────────
    function inPeriod(dateStr: string): boolean {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (periodType === 'all')   return true;
        if (periodType === 'year')  return d.getFullYear() === selYear;
        if (periodType === 'month') return d.getFullYear() === selYear && (d.getMonth() + 1) === selMonth;
        if (periodType === 'week')  return d.getFullYear() === selYear && getISOWeek(d) === selWeek;
        return true;
    }

    const orders   = (data.orders   || []).filter(o => inPeriod(o.date));
    const expenses = (data.expenses || []).filter(e => inPeriod(e.expense_date));

    // ── Aggregate KPIs ───────────────────────────────────────────────────
    const effectiveQty = (o: any) => {
      const soldQty = Math.max(0, Number(o.quantity) || 0);
      const returnedQty = Math.min(Math.max(0, Number(o.returnQuantity) || 0), soldQty);
      const refundedQty = Math.min(Math.max(0, Number(o.refundQuantity) || 0), soldQty - returnedQty);
      return soldQty - returnedQty - refundedQty;
    };
    const totRevenue    = orders.reduce((s, o) => s + (o.sellingPrice || 0) * effectiveQty(o), 0);
    const totCOGS       = orders.reduce((s, o) => s + (o.costPrice    || 0) * effectiveQty(o), 0);
    const totCommission = orders.reduce((s, o) => s + (o.commissionAmount || 0), 0);
    const grossProfit   = totRevenue - totCOGS;
    const totExpenses   = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit     = grossProfit - totExpenses;

    // ── Build product rows ───────────────────────────────────────────────
    const prodMap: Record<string, { product: string; orders: number; qty: number; revenue: number; cogs: number; commission: number; gp: number }> = {};
    orders.forEach(o => {
        const k = o.productName || 'Unknown';
        const eQty = effectiveQty(o);
        if (!prodMap[k]) prodMap[k] = { product: k, orders: 0, qty: 0, revenue: 0, cogs: 0, commission: 0, gp: 0 };
        prodMap[k].orders++;
        prodMap[k].qty        += o.quantity || 0;
        prodMap[k].revenue    += (o.sellingPrice || 0) * eQty;
        prodMap[k].cogs       += (o.costPrice    || 0) * eQty;
        prodMap[k].commission += o.commissionAmount || 0;
        prodMap[k].gp          = prodMap[k].revenue - prodMap[k].cogs;
    });
    const prodRows = Object.values(prodMap);

    // ── Build store rows ─────────────────────────────────────────────────
    const storeMap: Record<string, { store: string; orders: number; qty: number; revenue: number; cogs: number; commission: number; netProfit: number }> = {};
    orders.forEach(o => {
        const k = o.storeName || 'Unknown';
        const eQty = effectiveQty(o);
        if (!storeMap[k]) storeMap[k] = { store: k, orders: 0, qty: 0, revenue: 0, cogs: 0, commission: 0, netProfit: 0 };
        storeMap[k].orders++;
        storeMap[k].qty        += o.quantity || 0;
        storeMap[k].revenue    += (o.sellingPrice    || 0) * eQty;
        storeMap[k].cogs       += (o.costPrice       || 0) * eQty;
        storeMap[k].commission += o.commissionAmount || 0;
        storeMap[k].netProfit  += o.profit           || 0;
    });
    const storeRows = Object.values(storeMap);

    // ── Expense category summary ─────────────────────────────────────────
    const expCatMap: Record<string, number> = {};
    expenses.forEach(e => { expCatMap[e.category || 'Misc'] = (expCatMap[e.category || 'Misc'] || 0) + (e.amount || 0); });
    const expCatRows = Object.entries(expCatMap).map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt);

    // ── Sort helper ──────────────────────────────────────────────────────
    function sorted<T extends Record<string, any>>(rows: T[]): T[] {
        return [...rows].sort((a, b) => {
            const va = a[sortKey] ?? 0;
            const vb = b[sortKey] ?? 0;
            if (typeof va === 'number') return sortDir === 'desc' ? vb - va : va - vb;
            return sortDir === 'desc' ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
        });
    }
    function toggleSort(key: string) {
        if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(key); setSortDir('desc'); }
    }
    const sortIcon = (key: string) => sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ' ⇅';

    // ── Common labels ────────────────────────────────────────────────────
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const periodLabel =
        periodType === 'all'   ? 'All Time' :
        periodType === 'year'  ? String(selYear) :
        periodType === 'month' ? `${MONTHS[selMonth - 1]} ${selYear}` :
        `Week ${selWeek}, ${selYear}`;

    const yearOpts = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
    const weekOpts = Array.from({ length: 52 }, (_, i) => i + 1);

    // ── PDF export ───────────────────────────────────────────────────────
    function handlePDF() {
        const baseStyle = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;padding:24px;color:#111}
            h1{font-size:20px;font-weight:800;margin-bottom:4px}.sub{font-size:13px;color:#6b7280;margin-bottom:20px}
            h2{font-size:15px;font-weight:700;margin:24px 0 10px;color:#374151}
            table{border-collapse:collapse;width:100%}
            th{background:#f1f5f9;padding:7px 10px;border:1px solid #d1d5db;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:left}
            td{padding:6px 10px;border:1px solid #e2e8f0;font-size:12px}
            tr:nth-child(even) td{background:#f8fafc}
            tfoot td{background:#e0e7ef;font-weight:700}
            @page{size:A4 landscape;margin:12mm}`;

        const kpiHtml = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
            ${[
                ['Revenue', Rs(totRevenue), '#7c3aed'],
                ['Gross Profit', Rs(grossProfit), grossProfit >= 0 ? '#16a34a' : '#dc2626'],
                ['Partner Commissions', Rs(totCommission), '#ea580c'],
                ['Total Expenses', Rs(totExpenses), '#dc2626'],
                ['Net Profit', Rs(netProfit), netProfit >= 0 ? '#0891b2' : '#dc2626'],
            ].map(([l, v, c]) => `<div style="flex:1;min-width:120px;border:1px solid #e2e8f0;border-top:3px solid ${c};border-radius:8px;padding:10px 12px">
                <div style="font-size:16px;font-weight:800;color:${c}">${v}</div>
                <div style="font-size:10px;font-weight:600;color:#6b7280;margin-top:2px">${l}</div>
            </div>`).join('')}
        </div>`;

        let bodyHtml = '';

        if (view === 'products') {
            const rows = sorted(prodRows) as typeof prodRows;
            bodyHtml = `<h2>Product Performance</h2>
            <table><thead><tr>
                <th>#</th><th>Product</th><th>Orders</th><th>Units Sold</th>
                <th>Revenue</th><th>COGS</th><th>Partner's Share</th><th>Gross Profit</th><th>Margin %</th>
            </tr></thead><tbody>
            ${rows.map((r, i) => `<tr>
                <td>${i+1}</td><td>${r.product}</td><td>${r.orders}</td><td>${r.qty}</td>
                <td>${Rs(r.revenue)}</td><td>${Rs(r.cogs)}</td>
                <td style="color:#ea580c">${Rs(r.commission)}</td>
                <td style="color:${r.gp>=0?'#16a34a':'#dc2626'}">${Rs(r.gp)}</td>
                <td>${r.revenue>0?pct(r.gp/r.revenue*100):'—'}</td>
            </tr>`).join('')}
            </tbody><tfoot><tr>
                <td></td><td>${prodRows.length} products</td><td>${orders.length}</td><td>${orders.reduce((s,o)=>s+o.quantity,0)}</td>
                <td>${Rs(totRevenue)}</td><td>${Rs(totCOGS)}</td>
                <td style="color:#ea580c">${Rs(totCommission)}</td>
                <td style="color:${grossProfit>=0?'#16a34a':'#dc2626'}">${Rs(grossProfit)}</td>
                <td>${totRevenue>0?pct(grossProfit/totRevenue*100):'—'}</td>
            </tr></tfoot></table>`;

        } else if (view === 'stores') {
            const rows = sorted(storeRows) as typeof storeRows;
            bodyHtml = `<h2>Store Performance</h2>
            <table><thead><tr>
                <th>#</th><th>Store</th><th>Orders</th><th>Units Sold</th>
                <th>Revenue</th><th>COGS</th><th>Partner's Share</th><th>Net Profit</th>
            </tr></thead><tbody>
            ${rows.map((r, i) => `<tr>
                <td>${i+1}</td><td>${r.store}</td><td>${r.orders}</td><td>${r.qty}</td>
                <td>${Rs(r.revenue)}</td><td>${Rs(r.cogs)}</td>
                <td style="color:#ea580c">${Rs(r.commission)}</td>
                <td style="color:${r.netProfit>=0?'#16a34a':'#dc2626'}">${Rs(r.netProfit)}</td>
            </tr>`).join('')}
            </tbody><tfoot><tr>
                <td></td><td>${storeRows.length} stores</td><td>${orders.length}</td><td>${orders.reduce((s,o)=>s+o.quantity,0)}</td>
                <td>${Rs(totRevenue)}</td><td>${Rs(totCOGS)}</td>
                <td style="color:#ea580c">${Rs(totCommission)}</td>
                <td style="color:${netProfit>=0?'#16a34a':'#dc2626'}">${Rs(netProfit)}</td>
            </tr></tfoot></table>`;

        } else {
            // expenses
            const sortedExp = [...expenses].sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
            bodyHtml = `<h2>Expense Log</h2>
            <table><thead><tr><th>#</th><th>Date</th><th>Title</th><th>Category</th><th>Amount</th><th>Notes</th></tr></thead>
            <tbody>${sortedExp.map((e, i) => `<tr>
                <td>${i+1}</td>
                <td>${new Date(e.expense_date).toLocaleDateString('en-PK')}</td>
                <td>${e.title}</td><td>${e.category||'Misc'}</td>
                <td style="color:#dc2626;font-weight:600">${Rs(e.amount)}</td>
                <td style="color:#6b7280">${e.notes||'—'}</td>
            </tr>`).join('')}
            </tbody><tfoot><tr>
                <td></td><td></td><td>${expenses.length} entries</td><td></td>
                <td style="color:#dc2626">${Rs(totExpenses)}</td><td></td>
            </tr></tfoot></table>
            <h2>By Category</h2>
            <table><thead><tr><th>Category</th><th>Entries</th><th>Total</th><th>% of Expenses</th></tr></thead>
            <tbody>${expCatRows.map((r, i) => `<tr>
                <td>${r.cat}</td>
                <td>${expenses.filter(e=>(e.category||'Misc')===r.cat).length}</td>
                <td style="color:#dc2626;font-weight:600">${Rs(r.amt)}</td>
                <td>${totExpenses>0?pct(r.amt/totExpenses*100):'—'}</td>
            </tr>`).join('')}
            </tbody><tfoot><tr><td>TOTAL</td><td>${expenses.length}</td><td style="color:#dc2626">${Rs(totExpenses)}</td><td>100%</td></tr></tfoot></table>`;
        }

        const viewTitle = view === 'products' ? 'Product Performance' : view === 'stores' ? 'Store Performance' : 'Expenses';
        const html = `<!DOCTYPE html><html><head><title>Trendy Wear – ${viewTitle} · ${periodLabel}</title>
        <style>${baseStyle}</style></head><body>
        <h1>Trendy Wear — ${viewTitle} Report</h1>
        <p class="sub">Period: ${periodLabel} &nbsp;·&nbsp; Generated: ${new Date().toLocaleDateString('en-PK',{day:'numeric',month:'long',year:'numeric'})}</p>
        ${kpiHtml}${bodyHtml}
        </body></html>`;

        const win = window.open('', '_blank', 'width=1000,height=700');
        if (!win) { alert('Please allow pop-ups to download the PDF'); return; }
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 400);
    }

    // ── Shared table styles ──────────────────────────────────────────────
    const TH = (key: string, _label: string, align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties => ({
        padding: '7px 10px', border: '1px solid #d1d5db', background: '#f1f5f9',
        fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px',
        cursor: 'pointer', userSelect: 'none', textAlign: align, whiteSpace: 'nowrap',
        color: sortKey === key ? '#7c3aed' : '#374151',
    });
    const TD = (align: 'left' | 'right' | 'center' = 'left', alt = false): React.CSSProperties => ({
        padding: '6px 10px', border: '1px solid #e2e8f0',
        background: alt ? '#f8fafc' : '#fff', fontSize: 13, textAlign: align, whiteSpace: 'nowrap',
    });
    const TFoot: React.CSSProperties = {
        padding: '6px 10px', border: '1px solid #d1d5db',
        background: '#e0e7ef', fontWeight: 700, fontSize: 13,
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 960, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div className="modal-head">
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Generate Report</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={handlePDF} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Download PDF
                        </button>
                        <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18, lineHeight: 1 }}>✕</button>
                    </div>
                </div>

                <div className="modal-body">

                    {/* ── Filter bar ── */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 18, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>

                        {/* View toggle */}
                        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                            {([
                                { id: 'products', label: '📦 Products' },
                                { id: 'stores',   label: '🏪 Stores' },
                                { id: 'expenses', label: '💸 Expenses' },
                            ] as const).map(v => (
                                <button key={v.id} onClick={() => { setView(v.id); setSortKey(v.id === 'expenses' ? 'amount' : 'revenue'); setSortDir('desc'); }}
                                    style={{ padding: '6px 14px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                                        background: view === v.id ? '#7c3aed' : 'transparent',
                                        color: view === v.id ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                                    {v.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

                        {/* Period buttons */}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(['all', 'week', 'month', 'year'] as const).map(t => (
                                <button key={t} onClick={() => setPeriodType(t)}
                                    className={`btn btn-sm ${periodType === t ? 'btn-primary' : 'btn-glass'}`}
                                    style={{ fontSize: 12, textTransform: 'capitalize' }}>
                                    {t === 'all' ? 'All Time' : t === 'week' ? 'Weekly' : t === 'month' ? 'Monthly' : 'Yearly'}
                                </button>
                            ))}
                        </div>

                        {periodType !== 'all' && (
                            <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
                                style={{ height: 32, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', background: 'var(--surface-1)' }}>
                                {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        )}
                        {periodType === 'month' && (
                            <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}
                                style={{ height: 32, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', background: 'var(--surface-1)' }}>
                                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                            </select>
                        )}
                        {periodType === 'week' && (
                            <select value={selWeek} onChange={e => setSelWeek(Number(e.target.value))}
                                style={{ height: 32, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', background: 'var(--surface-1)' }}>
                                {weekOpts.map(w => <option key={w} value={w}>Week {w}</option>)}
                            </select>
                        )}

                        <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' }}>
                            {view === 'expenses' ? `${expenses.length} entries` : `${orders.length} orders`} · {periodLabel}
                        </span>
                    </div>

                    {/* ── KPI strip ── */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                        {[
                            { label: 'Revenue',           val: Rs(totRevenue),    color: '#7c3aed' },
                            { label: 'Gross Profit',      val: Rs(grossProfit),   color: grossProfit >= 0 ? '#16a34a' : '#dc2626' },
                            { label: 'Partner Commissions', val: Rs(totCommission), color: '#ea580c' },
                            { label: 'Total Expenses',    val: Rs(totExpenses),   color: '#dc2626' },
                            { label: 'Net Profit',        val: Rs(netProfit),     color: netProfit >= 0 ? '#0891b2' : '#dc2626' },
                            { label: 'Orders',            val: String(orders.length), color: '#2563eb' },
                        ].map(k => (
                            <div key={k.label} style={{ flex: 1, minWidth: 110, padding: '10px 12px', border: '1px solid var(--border)', borderTop: `3px solid ${k.color}`, borderRadius: 9, background: 'var(--surface-1)' }}>
                                <div style={{ fontSize: 16, fontWeight: 800, color: k.color }}>{k.val}</div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* ══ PRODUCTS TABLE ══ */}
                    {view === 'products' && (
                        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #d1d5db' }}>
                            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...TH('#','#'), width: 36, cursor: 'default' }}>#</th>
                                        <th style={TH('product','Product Name')} onClick={() => toggleSort('product')}>Product Name{sortIcon('product')}</th>
                                        <th style={TH('orders','Orders','right')} onClick={() => toggleSort('orders')}>Orders{sortIcon('orders')}</th>
                                        <th style={TH('qty','Units','right')} onClick={() => toggleSort('qty')}>Units Sold{sortIcon('qty')}</th>
                                        <th style={TH('revenue','Revenue','right')} onClick={() => toggleSort('revenue')}>Revenue{sortIcon('revenue')}</th>
                                        <th style={TH('cogs','COGS','right')} onClick={() => toggleSort('cogs')}>COGS{sortIcon('cogs')}</th>
                                        <th style={{ ...TH('commission','Partner\'s Share','right'), color: sortKey === 'commission' ? '#ea580c' : '#374151' }} onClick={() => toggleSort('commission')}>Partner's Share{sortIcon('commission')}</th>
                                        <th style={TH('gp','Gross Profit','right')} onClick={() => toggleSort('gp')}>Gross Profit{sortIcon('gp')}</th>
                                        <th style={{ ...TH('margin','Margin','right'), cursor: 'default' }}>Margin %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted(prodRows).length === 0 && (
                                        <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>No orders for selected period</td></tr>
                                    )}
                                    {sorted(prodRows).map((r, i) => (
                                        <tr key={r.product}>
                                            <td style={{ ...TD('center', i%2===1), color: '#9ca3af', fontSize: 12 }}>{i + 1}</td>
                                            <td style={{ ...TD('left', i%2===1), fontWeight: 600 }}>{r.product}</td>
                                            <td style={TD('right', i%2===1)}>{r.orders}</td>
                                            <td style={TD('right', i%2===1)}>{r.qty}</td>
                                            <td style={{ ...TD('right', i%2===1), fontWeight: 600 }}>{Rs(r.revenue)}</td>
                                            <td style={TD('right', i%2===1)}>{Rs(r.cogs)}</td>
                                            <td style={{ ...TD('right', i%2===1), color: '#ea580c', fontWeight: 600 }}>{Rs(r.commission)}</td>
                                            <td style={{ ...TD('right', i%2===1), fontWeight: 700, color: r.gp >= 0 ? '#16a34a' : '#dc2626' }}>{Rs(r.gp)}</td>
                                            <td style={{ ...TD('right', i%2===1), color: r.revenue > 0 && r.gp / r.revenue > 0.25 ? '#16a34a' : '#ea580c' }}>
                                                {r.revenue > 0 ? pct(r.gp / r.revenue * 100) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td style={TFoot}></td>
                                        <td style={TFoot}>{prodRows.length} products</td>
                                        <td style={{ ...TFoot, textAlign: 'right' }}>{orders.length}</td>
                                        <td style={{ ...TFoot, textAlign: 'right' }}>{orders.reduce((s, o) => s + (o.quantity || 0), 0)}</td>
                                        <td style={{ ...TFoot, textAlign: 'right' }}>{Rs(totRevenue)}</td>
                                        <td style={{ ...TFoot, textAlign: 'right' }}>{Rs(totCOGS)}</td>
                                        <td style={{ ...TFoot, textAlign: 'right', color: '#ea580c' }}>{Rs(totCommission)}</td>
                                        <td style={{ ...TFoot, textAlign: 'right', color: grossProfit >= 0 ? '#16a34a' : '#dc2626' }}>{Rs(grossProfit)}</td>
                                        <td style={{ ...TFoot, textAlign: 'right' }}>{totRevenue > 0 ? pct(grossProfit / totRevenue * 100) : '—'}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* ══ STORES TABLE ══ */}
                    {view === 'stores' && (
                        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #d1d5db' }}>
                            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...TH('#','#'), width: 36, cursor: 'default' }}>#</th>
                                        <th style={TH('store','Store')} onClick={() => toggleSort('store')}>Store{sortIcon('store')}</th>
                                        <th style={TH('orders','Orders','right')} onClick={() => toggleSort('orders')}>Orders{sortIcon('orders')}</th>
                                        <th style={TH('qty','Units','right')} onClick={() => toggleSort('qty')}>Units Sold{sortIcon('qty')}</th>
                                        <th style={TH('revenue','Revenue','right')} onClick={() => toggleSort('revenue')}>Revenue{sortIcon('revenue')}</th>
                                        <th style={TH('cogs','COGS','right')} onClick={() => toggleSort('cogs')}>COGS{sortIcon('cogs')}</th>
                                        <th style={{ ...TH('commission','Partner\'s Share','right'), color: sortKey === 'commission' ? '#ea580c' : '#374151' }} onClick={() => toggleSort('commission')}>Partner's Share{sortIcon('commission')}</th>
                                        <th style={TH('netProfit','Net Profit','right')} onClick={() => toggleSort('netProfit')}>Net Profit{sortIcon('netProfit')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted(storeRows).length === 0 && (
                                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>No orders for selected period</td></tr>
                                    )}
                                    {sorted(storeRows).map((r, i) => (
                                        <tr key={r.store}>
                                            <td style={{ ...TD('center', i%2===1), color: '#9ca3af', fontSize: 12 }}>{i + 1}</td>
                                            <td style={{ ...TD('left', i%2===1), fontWeight: 600 }}>{r.store}</td>
                                            <td style={TD('right', i%2===1)}>{r.orders}</td>
                                            <td style={TD('right', i%2===1)}>{r.qty}</td>
                                            <td style={{ ...TD('right', i%2===1), fontWeight: 600 }}>{Rs(r.revenue)}</td>
                                            <td style={TD('right', i%2===1)}>{Rs(r.cogs)}</td>
                                            <td style={{ ...TD('right', i%2===1), color: '#ea580c', fontWeight: 600 }}>{Rs(r.commission)}</td>
                                            <td style={{ ...TD('right', i%2===1), fontWeight: 700, color: r.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{Rs(r.netProfit)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td style={TFoot}></td>
                                        <td style={TFoot}>{storeRows.length} stores</td>
                                        <td style={{ ...TFoot, textAlign: 'right' }}>{orders.length}</td>
                                        <td style={{ ...TFoot, textAlign: 'right' }}>{orders.reduce((s, o) => s + (o.quantity || 0), 0)}</td>
                                        <td style={{ ...TFoot, textAlign: 'right' }}>{Rs(totRevenue)}</td>
                                        <td style={{ ...TFoot, textAlign: 'right' }}>{Rs(totCOGS)}</td>
                                        <td style={{ ...TFoot, textAlign: 'right', color: '#ea580c' }}>{Rs(totCommission)}</td>
                                        <td style={{ ...TFoot, textAlign: 'right', color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{Rs(netProfit)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* ══ EXPENSES VIEW ══ */}
                    {view === 'expenses' && (() => {
                        const sortedExp = [...expenses].sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
                        return (
                            <>
                                {/* Expense log */}
                                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 20 }}>
                                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ ...TH('#','#'), width: 36, cursor: 'default' }}>#</th>
                                                <th style={{ ...TH('expense_date','Date'), cursor: 'default' }}>Date</th>
                                                <th style={{ ...TH('title','Title'), cursor: 'default' }}>Title</th>
                                                <th style={{ ...TH('category','Category'), cursor: 'default' }}>Category</th>
                                                <th style={{ ...TH('amount','Amount','right'), cursor: 'default' }}>Amount</th>
                                                <th style={{ ...TH('notes','Notes'), cursor: 'default' }}>Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedExp.length === 0 && (
                                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>No expenses for selected period</td></tr>
                                            )}
                                            {sortedExp.map((e, i) => (
                                                <tr key={e.id}>
                                                    <td style={{ ...TD('center', i%2===1), color: '#9ca3af', fontSize: 12 }}>{i + 1}</td>
                                                    <td style={TD('left', i%2===1)}>{new Date(e.expense_date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                    <td style={{ ...TD('left', i%2===1), fontWeight: 600 }}>{e.title}</td>
                                                    <td style={TD('left', i%2===1)}>
                                                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>
                                                            {e.category || 'Misc'}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...TD('right', i%2===1), color: '#dc2626', fontWeight: 700 }}>{Rs(e.amount)}</td>
                                                    <td style={{ ...TD('left', i%2===1), color: '#9ca3af', fontSize: 12 }}>{e.notes || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td style={TFoot}></td>
                                                <td style={TFoot}></td>
                                                <td style={TFoot}>{expenses.length} entries</td>
                                                <td style={TFoot}></td>
                                                <td style={{ ...TFoot, textAlign: 'right', color: '#dc2626' }}>{Rs(totExpenses)}</td>
                                                <td style={TFoot}></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* Category summary */}
                                {expCatRows.length > 0 && (
                                    <>
                                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#374151' }}>By Category</div>
                                        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #d1d5db' }}>
                                            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ ...TH('cat','Category'), cursor: 'default' }}>Category</th>
                                                        <th style={{ ...TH('count','Entries','right'), cursor: 'default' }}>Entries</th>
                                                        <th style={{ ...TH('amt','Total','right'), cursor: 'default' }}>Total</th>
                                                        <th style={{ ...TH('share','% Share','right'), cursor: 'default' }}>% Share</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {expCatRows.map((r, i) => (
                                                        <tr key={r.cat}>
                                                            <td style={{ ...TD('left', i%2===1), fontWeight: 600 }}>{r.cat}</td>
                                                            <td style={TD('right', i%2===1)}>{expenses.filter(e => (e.category || 'Misc') === r.cat).length}</td>
                                                            <td style={{ ...TD('right', i%2===1), color: '#dc2626', fontWeight: 700 }}>{Rs(r.amt)}</td>
                                                            <td style={TD('right', i%2===1)}>{totExpenses > 0 ? pct(r.amt / totExpenses * 100) : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr>
                                                        <td style={TFoot}>TOTAL</td>
                                                        <td style={{ ...TFoot, textAlign: 'right' }}>{expenses.length}</td>
                                                        <td style={{ ...TFoot, textAlign: 'right', color: '#dc2626' }}>{Rs(totExpenses)}</td>
                                                        <td style={{ ...TFoot, textAlign: 'right' }}>100%</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </>
                        );
                    })()}

                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
                        Click column headers to sort · "Download PDF" opens a print-ready page in a new tab
                    </p>
                </div>
            </div>
        </div>
    );
}






export function AllotToStoreModal({ onSave, onClose, stores, inventory, allotedQtyByProduct, storeCommissionByName }: AllotToStoreModalProps) {
    const { toast } = usePopup();
    const [form, setForm] = useState({
        storeName: stores?.[0] || '',
        batchNumber: inventory?.[0]?.batchNumber || '',
        quantity: 1,
        ownerSupplyPrice: 0,
        commissionPercent: 0,
        extraQty: 0,
        sizeQuantitiesAssigned: {} as Record<string, number>,
        colorQuantitiesAssigned: {} as Record<string, number>,
        variantQuantitiesAssigned: {} as VariantQuantities
    });

    const selectedInv = (inventory || []).find(i => i.batchNumber === form.batchNumber);
    const productName = selectedInv?.productName || '';
    // Use remaining quantities (warehouse total minus already allotted) as the cap for inputs.
    // Fall back to total quantities if remaining is not available.
    const sizeQuantities = selectedInv?.sizeQuantitiesRemaining ?? selectedInv?.sizeQuantities;
    const colorQuantities = selectedInv?.colorQuantitiesRemaining ?? selectedInv?.colorQuantities;
    const variantQuantities = selectedInv?.variantQuantitiesRemaining ?? selectedInv?.variantQuantities;
    const variantColors = Object.keys(variantQuantities || {});
    const variantSizes = Array.from(new Set(Object.values(variantQuantities || {}).flatMap(sizes => Object.keys(sizes || {}))));
    const hasVariantGrid = variantColors.length > 0 && variantSizes.length > 0;
    const hasSizeTracking = !hasVariantGrid && sizeQuantities && Object.keys(sizeQuantities).length > 0;
    const hasColorTracking = !hasVariantGrid && colorQuantities && Object.keys(colorQuantities).length > 0;
    
    // Key by inventory.id (batch-level) to avoid mixing up different batches of same product
    const allotedQty = allotedQtyByProduct?.[selectedInv?.id || ''] || 0;
    const totalQty = Number(selectedInv?.quantityAvailable) || 0;
    const maxQty = Math.max(0, totalQty - allotedQty);

    const updateSizeQuantity = (size: string, qty: number) => {
        const maxForSize = (sizeQuantities?.[size] as number) || 0;
        setForm(curr => ({
            ...curr,
            sizeQuantitiesAssigned: { 
                ...curr.sizeQuantitiesAssigned, 
                [size]: Math.max(0, Math.min(qty, maxForSize))
            }
        }));
    };

    const updateColorQuantity = (color: string, qty: number) => {
        const maxForColor = (colorQuantities?.[color] as number) || 0;
        setForm(curr => ({
            ...curr,
            colorQuantitiesAssigned: {
                ...curr.colorQuantitiesAssigned,
                [color]: Math.max(0, Math.min(qty, maxForColor))
            }
        }));
    };

    const distributeEqually = () => {
        if (!hasSizeTracking) return;
        const sizes = Object.keys(sizeQuantities);
        if (sizes.length === 0) return;
        
        const qtyPerSize = Math.floor(form.quantity / sizes.length);
        const newSizeQuantities: Record<string, number> = {};
        sizes.forEach(size => {
            const maxForSize = (sizeQuantities[size] as number) || 0;
            newSizeQuantities[size] = Math.min(qtyPerSize, maxForSize);
        });
        setForm(curr => ({ ...curr, sizeQuantitiesAssigned: newSizeQuantities }));
        toast.success('Distributed equally across sizes');
    };

    const distributeColorEqually = () => {
        if (!hasColorTracking) return;
        const colors = Object.keys(colorQuantities);
        if (colors.length === 0) return;

        const qtyPerColor = Math.floor(form.quantity / colors.length);
        const newColorQuantities: Record<string, number> = {};
        colors.forEach(color => {
            const maxForColor = (colorQuantities[color] as number) || 0;
            newColorQuantities[color] = Math.min(qtyPerColor, maxForColor);
        });
        setForm(curr => ({ ...curr, colorQuantitiesAssigned: newColorQuantities }));
        toast.success('Distributed equally across colors');
    };

    const totalSizeQuantity = Object.values(form.sizeQuantitiesAssigned).reduce((sum, qty) => sum + qty, 0);
    const totalColorQuantity = Object.values(form.colorQuantitiesAssigned).reduce((sum, qty) => sum + qty, 0);
    const totalVariantQuantity = variantGrandTotal(form.variantQuantitiesAssigned);

    React.useEffect(() => {
        if (!form.storeName && stores?.length) {
            setForm(prev => ({ ...prev, storeName: stores[0] }));
        }
    }, [stores, form.storeName]);

    React.useEffect(() => {
        const inv = (inventory || []).find(i => i.batchNumber === form.batchNumber);
        const cost = Number(inv?.costPrice) || 0;
        const commission = Number(storeCommissionByName?.[form.storeName]) || 0;
        const invVariants = inv?.variantQuantities || {};
        const invColors = Object.keys(invVariants);
        const invSizes = Array.from(new Set(Object.values(invVariants).flatMap(sizes => Object.keys(sizes || {}))));
        setForm(prev => ({
            ...prev,
            ownerSupplyPrice: prev.ownerSupplyPrice || cost,
            commissionPercent: prev.commissionPercent || commission,
            variantQuantitiesAssigned: invColors.length && invSizes.length ? buildVariantGrid(invColors, invSizes, prev.variantQuantitiesAssigned) : {},
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.batchNumber, form.storeName]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!form.storeName) return toast.error('Select store');
        if (!form.batchNumber) return toast.error('Select item');
        
        let finalQuantity = form.quantity;
        if (hasVariantGrid) {
            finalQuantity = totalVariantQuantity;
            if (finalQuantity === 0) return toast.error('Enter quantities for at least one color-size pair');
        } else if (hasSizeTracking) {
            finalQuantity = totalSizeQuantity;
            if (finalQuantity === 0) return toast.error('Enter quantities for at least one size');
        } else if (hasColorTracking) {
            finalQuantity = totalColorQuantity;
            if (finalQuantity === 0) return toast.error('Enter quantities for at least one color');
        } else {
            if (!form.quantity || form.quantity < 1) return toast.error('Enter quantity');
        }
        
        const extraQty = Number(form.extraQty) || 0;
        if (finalQuantity + extraQty > maxQty) return toast.error(`Total (qty + extra) cannot exceed available stock (${maxQty})`);
        const warehouseCost = Number(selectedInv?.costPrice) || 0;
        if (warehouseCost > 0 && Number(form.ownerSupplyPrice) < warehouseCost) {
            return toast.error(`New price cannot be less than warehouse cost (Rs ${warehouseCost.toLocaleString()})`);
        }

        onSave({
            storeName: form.storeName,
            batchNumber: form.batchNumber,
            quantity: finalQuantity,
            variantQuantitiesAssigned: hasVariantGrid ? form.variantQuantitiesAssigned : undefined,
            sizeQuantitiesAssigned: hasSizeTracking ? form.sizeQuantitiesAssigned : undefined,
            colorQuantitiesAssigned: hasColorTracking ? form.colorQuantitiesAssigned : undefined,
            ownerSupplyPrice: Number(form.ownerSupplyPrice) || 0,
            commissionPercent: Number(form.commissionPercent) || 0,
            extraQty,
        });
        onClose();
    };

    const Rs = (n: number) => 'Rs ' + (Number(n) || 0).toLocaleString();

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '780px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-head" style={{ padding: '16px 20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Alot to Store</h3>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: '18px' }}>✕</button>
                </div>
                <div className="modal-body" style={{ padding: '22px 20px' }}>
                    <form onSubmit={handleSubmit}>
                        <div className="form-grid-2" style={{ marginBottom: 16 }}>
                            <div className="input-group">
                                <label>Store Name</label>
                                <select value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} required>
                                    {(stores || []).map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label>Item Name</label>
                                <select value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} required>
                                    {(inventory || []).map((it) => (
                                        <option key={it.batchNumber} value={it.batchNumber}>
                                            {it.productName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 16 }}>
                            <div className="input-group">
                                <label>Quantity (Remaining {maxQty})</label>
                                {hasSizeTracking ? (
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={form.quantity}
                                        onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                                        placeholder="Enter total for equal distribution"
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={form.quantity}
                                        onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                                        required
                                    />
                                )}
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                    Total Qty: <b>{totalQty}</b> · Allotted Qty: <b>{allotedQty}</b> · Remaining: <b>{maxQty}</b>
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Cost/PC (Warehouse)</label>
                                <input readOnly value={Rs(Number(selectedInv?.costPrice) || 0)} style={{ background: 'var(--surface-2)', fontWeight: 800 }} />
                            </div>
                        </div>

                        {hasVariantGrid && (
                            <VariantQuantityGrid
                                colors={variantColors}
                                sizes={variantSizes}
                                values={form.variantQuantitiesAssigned}
                                maxValues={variantQuantities}
                                remainingValues={variantQuantities}
                                title="Allot by Color & Size"
                                showRemainingLabel={true}
                                onChange={next => {
                                    const rollups = rollupVariantQuantities(next);
                                    setForm(curr => ({
                                        ...curr,
                                        variantQuantitiesAssigned: next,
                                        sizeQuantitiesAssigned: rollups.sizeQuantities || {},
                                        colorQuantitiesAssigned: rollups.colorQuantities || {},
                                        quantity: rollups.total,
                                    }));
                                }}
                            />
                        )}

                        {hasSizeTracking && (
                            <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                                        Quantity per Size
                                    </div>
                                    <button 
                                        type="button" 
                                        className="btn btn-sm btn-primary"
                                        onClick={distributeEqually}
                                        style={{ padding: '4px 12px', fontSize: 11 }}
                                    >
                                        Equal Distribution
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
                                    {Object.entries(sizeQuantities).map(([size, availableQty]) => (
                                        <div key={size} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                                                {size} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(remaining: {availableQty})</span>
                                            </label>
                                            <input
                                                type="number" 
                                                min="0"
                                                max={availableQty as number}
                                                value={form.sizeQuantitiesAssigned[size] || 0}
                                                onChange={e => updateSizeQuantity(size, parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 12, padding: '8px 12px', background: totalSizeQuantity > 0 ? 'var(--primary)' : 'var(--surface-1)', color: 'var(--text)', borderRadius: 6, fontSize: 13, fontWeight: 800, textAlign: 'center' }}>
                                    Total: {totalSizeQuantity} units
                                </div>
                            </div>
                        )}

                        {hasColorTracking && (
                            <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                                        Quantity per Color
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-primary"
                                        onClick={distributeColorEqually}
                                        style={{ padding: '4px 12px', fontSize: 11 }}
                                    >
                                        Equal Distribution
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
                                    {Object.entries(colorQuantities).map(([color, availableQty]) => (
                                        <div key={color} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                                {color} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(remaining: {availableQty})</span>
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                max={availableQty as number}
                                                value={form.colorQuantitiesAssigned[color] || 0}
                                                onChange={e => updateColorQuantity(color, parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 12, padding: '8px 12px', background: totalColorQuantity > 0 ? 'var(--primary)' : 'var(--surface-1)', color: 'var(--text)', borderRadius: 6, fontSize: 13, fontWeight: 800, textAlign: 'center' }}>
                                    Total: {totalColorQuantity} units
                                </div>
                            </div>
                        )}

                        <div className="form-grid-2" style={{ marginBottom: 18 }}>
                            <div className="input-group">
                                <label>New Price (Supply to Store)</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={form.ownerSupplyPrice}
                                    onChange={(e) => setForm({ ...form, ownerSupplyPrice: parseFloat(e.target.value) || 0 })}
                                    required
                                    style={{ borderColor: (Number(selectedInv?.costPrice) > 0 && Number(form.ownerSupplyPrice) < Number(selectedInv?.costPrice)) ? 'var(--danger)' : undefined }}
                                />
                                {Number(selectedInv?.costPrice) > 0 && (
                                    <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color: Number(form.ownerSupplyPrice) < Number(selectedInv?.costPrice) ? 'var(--danger)' : 'var(--text-muted)' }}>
                                        Min: Rs {Number(selectedInv?.costPrice).toLocaleString()} (warehouse cost)
                                    </div>
                                )}
                            </div>
                            <div className="input-group">
                                <label>Partner Commission %</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={form.commissionPercent}
                                    onChange={(e) => setForm({ ...form, commissionPercent: parseFloat(e.target.value) || 0 })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 18 }}>
                            <div className="input-group">
                                <label>
                                    Extra Qty <span style={{ fontSize: '10px', fontWeight: 400, color: '#8c8c8c' }}>(gift / display — expensed at cost)</span>
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={form.extraQty}
                                    onChange={(e) => setForm({ ...form, extraQty: parseInt(e.target.value) || 0 })}
                                    placeholder="0"
                                />
                                {Number(form.extraQty) > 0 && Number(selectedInv?.costPrice) > 0 && (
                                    <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color: 'var(--danger)' }}>
                                        Will expense: Rs {(Number(form.extraQty) * Number(selectedInv?.costPrice)).toLocaleString()} (cost price)
                                    </div>
                                )}
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-full" style={{ height: 48, fontSize: '14px', fontWeight: 800 }}>
                            Save Allotment
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

/* ==========================================================================
   EXPENSE BREAKDOWN MODAL
   Shows all components of the Expense KPI with individual line items:
     1. Recorded business expenses (from Supabase expenses table)
     2. Cost of goods sold (per order)
     3. Delivery / shipment charges (per order)
     4. Store partner commissions (per order)
   ======================================================================= */

interface ExpenseBreakdownModalProps {
    expenses: Expense[];
    orders: Order[]; // already KPI-filtered orders
    onClose: () => void;
}

export function ExpenseBreakdownModal({ expenses, orders, onClose }: ExpenseBreakdownModalProps) {
    const Rs = (n: number) => 'Rs\u00a0' + (Number(n) || 0).toLocaleString();

    // --- Collapsible state for each section (default collapsed) ---
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        expenses: false,
        cogs: false,
        shipping: false,
        commission: false,
    });

    const toggleSection = (key: string) => {
        setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // --- Section totals ---
    const expensesTotal   = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const cogsTotal       = orders.reduce((s, o) => {
        const soldQty = Number(o.quantity) || 0;
        const returnedQty = Math.min(Number(o.returnQuantity) || 0, soldQty);
        const chargeableQty = soldQty - returnedQty;
        return s + ((Number(o.costPrice) || 0) * chargeableQty);
    }, 0);
    const shippingTotal   = orders.reduce((s, o) => s + (Number(o.shipmentCost) || 0), 0);
    const commissionTotal = orders.reduce((s, o) => s + (Number(o.commissionAmount) || 0), 0);
    const grandTotal      = expensesTotal + cogsTotal + shippingTotal + commissionTotal;

    const ordersWithShipping   = orders.filter(o => (Number(o.shipmentCost) || 0) > 0);
    const ordersWithCommission = orders.filter(o => (Number(o.commissionAmount) || 0) > 0);

    // SVG icons for expense sections
    const icons = {
        expenses: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
        cogs: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
        shipping: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>,
        commission: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    };

    const SectionHeader = ({ title, total, color, sectionKey, itemCount }: { title: string; total: number; color: string; sectionKey: string; itemCount: number }) => {
        const isExpanded = expandedSections[sectionKey];
        const icon = icons[sectionKey as keyof typeof icons];
        return (
            <div
                onClick={() => toggleSection(sectionKey)}
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: color, borderRadius: 8, padding: '10px 14px', marginBottom: isExpanded ? 8 : 0, marginTop: 20,
                    cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s ease',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, fontSize: 10, fontWeight: 700,
                        transition: 'transform 0.2s ease',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        color: '#64748b',
                    }}>▶</span>
                    <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
                    <span style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>{title}</span>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
                </div>
                <span style={{ fontWeight: 900, fontSize: 14, color: '#1e293b' }}>{Rs(total)}</span>
            </div>
        );
    };

    const LineItem = ({ label, sub, amount, muted }: { label: string; sub?: string; amount: number; muted?: boolean }) => (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '7px 4px', borderBottom: '1px solid var(--border)',
            opacity: muted ? 0.55 : 1,
        }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
            </div>
            <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', color: amount > 0 ? 'var(--danger)' : 'var(--text-muted)', marginLeft: 16 }}>-{Rs(amount)}</div>
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-box"
                style={{ maxWidth: 640, width: '95%', maxHeight: '88vh', overflowY: 'auto' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-head" style={{ padding: '16px 20px' }}>
                    <div>
                        <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Expense Breakdown</h3>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>All costs contributing to the Expenses KPI</div>
                    </div>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18 }}>✕</button>
                </div>

                {/* Scrollable body */}
                <div className="modal-body" style={{ padding: '4px 20px 24px' }}>

                    {/* ── 1. Business Expenses ── */}
                    <SectionHeader title="Business Expenses" total={expensesTotal} color="#fef9ec" sectionKey="expenses" itemCount={expenses.length} />
                    {expandedSections.expenses && (
                        expenses.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>No recorded expenses.</div>
                        ) : (
                            expenses.map((e) => (
                                <LineItem
                                    key={e.id}
                                    label={e.title}
                                    sub={`${e.category} · ${e.expense_date || ''}`}
                                    amount={Number(e.amount)}
                                />
                            ))
                        )
                    )}

                    {/* ── 2. Cost of Goods Sold ── */}
                    <SectionHeader title="Cost of Goods Sold (COGS)" total={cogsTotal} color="#eff6ff" sectionKey="cogs" itemCount={orders.filter(o => { const s = Number(o.quantity)||0; return s - Math.min(Number(o.returnQuantity)||0, s) > 0; }).length} />
                    {expandedSections.cogs && (
                        orders.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>No orders in this period.</div>
                        ) : (
                            orders.map((o, i) => {
                                const soldQty = Number(o.quantity) || 0;
                                const returnedQty = Math.min(Number(o.returnQuantity) || 0, soldQty);
                                const chargeableQty = soldQty - returnedQty;
                                if (chargeableQty <= 0) return null; // fully returned — no COGS
                                return (
                                    <LineItem
                                        key={o.id || i}
                                        label={o.productName}
                                        sub={`${chargeableQty} unit${chargeableQty !== 1 ? 's' : ''} × Rs ${(Number(o.costPrice) || 0).toLocaleString()} · ${o.storeName}`}
                                        amount={(Number(o.costPrice) || 0) * chargeableQty}
                                    />
                                );
                            })
                        )
                    )}

                    {/* ── 3. Delivery / Shipment Charges ── */}
                    <SectionHeader title="Delivery / Shipment Charges" total={shippingTotal} color="#f0fdf4" sectionKey="shipping" itemCount={ordersWithShipping.length} />
                    {expandedSections.shipping && (
                        ordersWithShipping.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>No delivery charges in this period.</div>
                        ) : (
                            ordersWithShipping.map((o, i) => (
                                <LineItem
                                    key={`ship-${o.id || i}`}
                                    label={`${o.productName} — Delivery`}
                                    sub={`${o.quantity} unit${o.quantity !== 1 ? 's' : ''} · ${o.clientName || 'N/A'} · ${o.storeName}`}
                                    amount={Number(o.shipmentCost)}
                                />
                            ))
                        )
                    )}

                    {/* ── 4. Store Partner Commissions ── */}
                    <SectionHeader title="Store Partner Commissions" total={commissionTotal} color="#fdf4ff" sectionKey="commission" itemCount={ordersWithCommission.length} />
                    {expandedSections.commission && (
                        ordersWithCommission.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>No partner commissions in this period.</div>
                        ) : (
                            ordersWithCommission.map((o, i) => (
                                <LineItem
                                    key={`comm-${o.id || i}`}
                                    label={`${o.productName} — ${o.storeName}`}
                                    sub={`${o.quantity} unit${o.quantity !== 1 ? 's' : ''} · ${o.commissionPercent || 0}% commission`}
                                    amount={Number(o.commissionAmount)}
                                />
                            ))
                        )
                    )}

                    {/* ── Grand Total ── */}
                    <div style={{
                        marginTop: 24, padding: '16px 18px', background: 'var(--surface-2)',
                        borderRadius: 10, border: '2px solid var(--border)', display: 'flex',
                        justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grand Total Expenses</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                {Rs(expensesTotal)} expenses + {Rs(cogsTotal)} COGS + {Rs(shippingTotal)} shipping + {Rs(commissionTotal)} commissions
                            </div>
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--danger)' }}>-{Rs(grandTotal)}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// SALE RETURN MODAL (Scenario A)
// ============================================================
export interface SaleReturnModalProps {
    order: {
        id: string;
        productName: string;
        storeName: string;
        quantity: number;
        sizeQuantities?: Record<string, number> | null;
        colorQuantities?: Record<string, number> | null;
        variantQuantities?: VariantQuantities | null;
        returnQuantity?: number | null;
        returnSizeQuantities?: Record<string, number> | null;
        returnColorQuantities?: Record<string, number> | null;
        returnVariantQuantities?: VariantQuantities | null;
        storeInventoryId?: string | null;
    };
    onConfirm: (payload: {
        id: string;
        returnQuantity: number;
        returnReason: string;
        returnSizeQuantities?: Record<string, number> | null;
        returnColorQuantities?: Record<string, number> | null;
        returnVariantQuantities?: VariantQuantities | null;
        returnProofUrl?: string | null;
    }) => Promise<void>;
    onClose: () => void;
}

const RETURN_REASONS = ['Cancelled', 'Customer Refused', 'Defective', 'Wrong Item', 'Other'];

const subtractFlatQuantities = (
    base?: Record<string, number> | null,
    subtract?: Record<string, number> | null,
) => {
    if (!base) return null;
    const next: Record<string, number> = {};
    Object.entries(base).forEach(([key, value]) => {
        next[key] = Math.max(0, Number(value) || 0);
    });
    Object.entries(subtract || {}).forEach(([key, value]) => {
        next[key] = Math.max(0, (next[key] || 0) - (Number(value) || 0));
    });
    return Object.keys(next).length ? next : null;
};

export function SaleReturnModal({ order, onConfirm, onClose }: SaleReturnModalProps) {
    const alreadyReturnedQty = Math.max(0, Number(order.returnQuantity) || 0);
    const remainingQty = Math.max(0, order.quantity - alreadyReturnedQty);
    const remainingSizeQuantities = subtractFlatQuantities(order.sizeQuantities, order.returnSizeQuantities);
    const remainingColorQuantities = subtractFlatQuantities(order.colorQuantities, order.returnColorQuantities);
    const remainingVariantQuantities = order.variantQuantities && Object.keys(order.variantQuantities).length > 0
        ? adjustVariantQuantities(order.variantQuantities, order.returnVariantQuantities, -1)
        : null;
    const variantMax = order.variantQuantities && Object.keys(order.variantQuantities).length > 0
        ? remainingVariantQuantities ?? order.variantQuantities
        : buildLegacyMaxVariantGrid(remainingColorQuantities ?? order.colorQuantities, remainingSizeQuantities ?? order.sizeQuantities);
    const variantColors = Object.keys(variantMax || {});
    const variantSizes = Array.from(new Set(Object.values(variantMax || {}).flatMap(sizes => Object.keys(sizes || {}))));
    const hasVariantGrid = variantColors.length > 0 && variantSizes.length > 0;
    const [variantInputs, setVariantInputs] = useState<VariantQuantities>(
        buildVariantGrid(variantColors, variantSizes, variantMax)
    );
    const [returnQty, setReturnQty] = useState(remainingQty || order.quantity);
    const [reason, setReason] = useState(RETURN_REASONS[0]);
    const [sizeInputs, setSizeInputs] = useState<Record<string, number>>(
        remainingSizeQuantities ? Object.fromEntries(Object.entries(remainingSizeQuantities).map(([k, v]) => [k, v])) : {}
    );
    const [colorInputs, setColorInputs] = useState<Record<string, number>>(
        remainingColorQuantities ? Object.fromEntries(Object.entries(remainingColorQuantities).map(([k, v]) => [k, v])) : {}
    );
    const [saving, setSaving] = useState(false);
    const [proofImage, setProofImage] = useState<string | null>(null);

    const hasSizes = !hasVariantGrid && remainingSizeQuantities && Object.keys(remainingSizeQuantities).length > 0;
    const hasColors = !hasVariantGrid && remainingColorQuantities && Object.keys(remainingColorQuantities).length > 0;
    const effectiveReturnQty = hasVariantGrid ? variantGrandTotal(variantInputs) : returnQty;

    const handleProofImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => setProofImage(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        if (saving) return;
        if (effectiveReturnQty < 1) return;
        setSaving(true);
        try {
            await onConfirm({
                id: order.id,
                returnQuantity: effectiveReturnQty,
                returnReason: reason,
                returnSizeQuantities: hasSizes ? sizeInputs : null,
                returnColorQuantities: hasColors ? colorInputs : null,
                returnVariantQuantities: hasVariantGrid ? variantInputs : null,
                returnProofUrl: proofImage || null,
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 620, width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Return Sale</h3>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                            {order.productName} — {order.storeName}
                        </div>
                    </div>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18 }}>&#x2715;</button>
                </div>
                <div className="modal-body" style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Return Qty */}
                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                            Return Quantity <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(max {remainingQty || order.quantity})</span>
                        </label>
                        <input
                            type="number" min={1} max={remainingQty || order.quantity}
                            value={effectiveReturnQty}
                            readOnly={hasVariantGrid}
                            onChange={e => setReturnQty(Math.min(remainingQty || order.quantity, Math.max(1, Number(e.target.value))))}
                            style={hasVariantGrid ? { width: '100%', background: 'var(--surface-2)', cursor: 'default' } : { width: '100%' }}
                        />
                    </div>

                    {hasVariantGrid && (
                        <VariantQuantityGrid
                            colors={variantColors}
                            sizes={variantSizes}
                            values={variantInputs}
                            maxValues={variantMax}
                            title="Returned by Color & Size"
                            onChange={setVariantInputs}
                        />
                    )}

                    {/* Size breakdown */}
                    {hasSizes && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Sizes Being Returned</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px,1fr))', gap: 8 }}>
                                {Object.keys(remainingSizeQuantities!).map(size => (
                                    <div key={size}>
                                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>{size}</label>
                                        <input
                                            type="number" min={0} max={remainingSizeQuantities![size]}
                                            value={sizeInputs[size] ?? 0}
                                            onChange={e => setSizeInputs(prev => ({ ...prev, [size]: Math.min(remainingSizeQuantities![size], Math.max(0, Number(e.target.value))) }))}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Color breakdown */}
                    {hasColors && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Colors Being Returned</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: 8 }}>
                                {Object.keys(remainingColorQuantities!).map(color => (
                                    <div key={color}>
                                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>{color}</label>
                                        <input
                                            type="number" min={0} max={remainingColorQuantities![color]}
                                            value={colorInputs[color] ?? 0}
                                            onChange={e => setColorInputs(prev => ({ ...prev, [color]: Math.min(remainingColorQuantities![color], Math.max(0, Number(e.target.value))) }))}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reason */}
                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Return Reason</label>
                        <select value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%' }}>
                            {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>

                    {/* Proof Image Upload */}
                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Proof Image <span style={{ fontWeight: 400 }}>(optional)</span></label>
                        <input type="file" accept="image/*" onChange={handleProofImageChange} style={{ width: '100%', fontSize: 12 }} />
                        {proofImage && (
                            <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                                <img src={proofImage} alt="proof" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                                <button onClick={() => setProofImage(null)} style={{ position: 'absolute', top: 4, right: 4, background: '#dc2626', border: 'none', borderRadius: '50%', width: 20, height: 20, color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px', textAlign: 'center', padding: 0 }}>&#x2715;</button>
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div style={{ padding: '10px 14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                        ⚠️ Returned pieces will go back to store stock as &lsquo;pending return&rsquo;.
                        Use <strong>Return to Main Store</strong> on the allotment row to send them back.
                    </div>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button className="btn btn-sm btn-glass" onClick={onClose} disabled={saving}>Cancel</button>
                        <button
                            className="btn btn-sm"
                            style={{ background: 'var(--warning, #f59e0b)', borderColor: 'var(--warning, #f59e0b)', color: '#fff' }}
                            onClick={handleSubmit}
                            disabled={saving || effectiveReturnQty < 1}
                        >
                            {saving ? 'Processing...' : `Return ${effectiveReturnQty} piece${effectiveReturnQty !== 1 ? 's' : ''}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// SALE REFUND MODAL
// Customer keeps the item. No inventory restored. Full cost absorbed as loss.
// ============================================================
export interface SaleRefundModalProps {
    order: {
        id: string;
        productName: string;
        storeName: string;
        quantity: number;
        sellingPrice: number;
        costPrice: number;
        sizeQuantities?: Record<string, number> | null;
        colorQuantities?: Record<string, number> | null;
        variantQuantities?: VariantQuantities | null;
        returnQuantity?: number | null;
        returnSizeQuantities?: Record<string, number> | null;
        returnColorQuantities?: Record<string, number> | null;
        returnVariantQuantities?: VariantQuantities | null;
        refundQuantity?: number | null;
        refundSizeQuantities?: Record<string, number> | null;
        refundColorQuantities?: Record<string, number> | null;
        refundVariantQuantities?: VariantQuantities | null;
    };
    onConfirm: (payload: {
        id: string;
        refundQuantity: number;
        refundReason: string;
        refundSizeQuantities?: Record<string, number> | null;
        refundColorQuantities?: Record<string, number> | null;
        refundVariantQuantities?: VariantQuantities | null;
        refundProofUrl?: string | null;
    }) => Promise<void>;
    onClose: () => void;
}

const REFUND_REASONS = ['Customer Dissatisfied', 'Wrong Item Sent', 'Damaged on Arrival', 'Goodwill Refund', 'Other'];

export function SaleRefundModal({ order, onConfirm, onClose }: SaleRefundModalProps) {
    const alreadyReturnedQty = Math.max(0, Number(order.returnQuantity) || 0);
    const alreadyRefundedQty = Math.max(0, Number(order.refundQuantity) || 0);
    const remainingQty = Math.max(0, order.quantity - alreadyReturnedQty - alreadyRefundedQty);

    const remainingSizeQuantities = subtractFlatQuantities(
        subtractFlatQuantities(order.sizeQuantities, order.returnSizeQuantities),
        order.refundSizeQuantities
    );
    const remainingColorQuantities = subtractFlatQuantities(
        subtractFlatQuantities(order.colorQuantities, order.returnColorQuantities),
        order.refundColorQuantities
    );
    const remainingVariantQuantities = order.variantQuantities && Object.keys(order.variantQuantities).length > 0
        ? adjustVariantQuantities(
            adjustVariantQuantities(order.variantQuantities, order.returnVariantQuantities, -1) ?? order.variantQuantities,
            order.refundVariantQuantities, -1
          )
        : null;
    const variantMax = order.variantQuantities && Object.keys(order.variantQuantities).length > 0
        ? remainingVariantQuantities ?? order.variantQuantities
        : buildLegacyMaxVariantGrid(remainingColorQuantities ?? order.colorQuantities, remainingSizeQuantities ?? order.sizeQuantities);
    const variantColors = Object.keys(variantMax || {});
    const variantSizes = Array.from(new Set(Object.values(variantMax || {}).flatMap(sizes => Object.keys(sizes || {}))));
    const hasVariantGrid = variantColors.length > 0 && variantSizes.length > 0;
    const [variantInputs, setVariantInputs] = useState<VariantQuantities>(
        buildVariantGrid(variantColors, variantSizes, variantMax)
    );
    const [refundQty, setRefundQty] = useState(Math.max(1, remainingQty));
    const [reason, setReason] = useState(REFUND_REASONS[0]);
    const [sizeInputs, setSizeInputs] = useState<Record<string, number>>(
        remainingSizeQuantities ? Object.fromEntries(Object.entries(remainingSizeQuantities).map(([k, v]) => [k, v])) : {}
    );
    const [colorInputs, setColorInputs] = useState<Record<string, number>>(
        remainingColorQuantities ? Object.fromEntries(Object.entries(remainingColorQuantities).map(([k, v]) => [k, v])) : {}
    );
    const [saving, setSaving] = useState(false);
    const [proofImage, setProofImage] = useState<string | null>(null);

    const hasSizes = !hasVariantGrid && remainingSizeQuantities && Object.keys(remainingSizeQuantities).length > 0;
    const hasColors = !hasVariantGrid && remainingColorQuantities && Object.keys(remainingColorQuantities).length > 0;
    const effectiveRefundQty = hasVariantGrid ? variantGrandTotal(variantInputs) : refundQty;
    const refundAmount = (order.sellingPrice || 0) * effectiveRefundQty;

    const handleProofImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => setProofImage(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        if (saving) return;
        if (effectiveRefundQty < 1) return;
        setSaving(true);
        try {
            await onConfirm({
                id: order.id,
                refundQuantity: effectiveRefundQty,
                refundReason: reason,
                refundSizeQuantities: hasSizes ? sizeInputs : null,
                refundColorQuantities: hasColors ? colorInputs : null,
                refundVariantQuantities: hasVariantGrid ? variantInputs : null,
                refundProofUrl: proofImage || null,
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 620, width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Refund Sale</h3>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                            {order.productName} — {order.storeName}
                        </div>
                    </div>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18 }}>&#x2715;</button>
                </div>
                <div className="modal-body" style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Warning info box */}
                    <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
                        🔴 <strong>Refund — customer keeps the item.</strong> No stock is restored. The cost of goods is fully absorbed as a loss. Commission is clawed back on refunded units.
                    </div>

                    {/* Refund Qty */}
                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                            Refund Quantity <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(max {remainingQty})</span>
                        </label>
                        <input
                            type="number" min={1} max={remainingQty}
                            value={effectiveRefundQty}
                            readOnly={hasVariantGrid}
                            onChange={e => setRefundQty(Math.min(remainingQty, Math.max(1, Number(e.target.value))))}
                            style={hasVariantGrid ? { width: '100%', background: 'var(--surface-2)', cursor: 'default' } : { width: '100%' }}
                        />
                    </div>

                    {hasVariantGrid && (
                        <VariantQuantityGrid
                            colors={variantColors}
                            sizes={variantSizes}
                            values={variantInputs}
                            maxValues={variantMax}
                            title="Refund by Color & Size"
                            onChange={setVariantInputs}
                        />
                    )}

                    {hasSizes && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Sizes Being Refunded</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px,1fr))', gap: 8 }}>
                                {Object.keys(remainingSizeQuantities!).map(size => (
                                    <div key={size}>
                                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>{size}</label>
                                        <input
                                            type="number" min={0} max={remainingSizeQuantities![size]}
                                            value={sizeInputs[size] ?? 0}
                                            onChange={e => setSizeInputs(prev => ({ ...prev, [size]: Math.min(remainingSizeQuantities![size], Math.max(0, Number(e.target.value))) }))}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {hasColors && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Colors Being Refunded</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: 8 }}>
                                {Object.keys(remainingColorQuantities!).map(color => (
                                    <div key={color}>
                                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>{color}</label>
                                        <input
                                            type="number" min={0} max={remainingColorQuantities![color]}
                                            value={colorInputs[color] ?? 0}
                                            onChange={e => setColorInputs(prev => ({ ...prev, [color]: Math.min(remainingColorQuantities![color], Math.max(0, Number(e.target.value))) }))}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Refund Reason</label>
                        <select value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%' }}>
                            {REFUND_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>

                    {/* Proof Image Upload */}
                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Proof Image <span style={{ fontWeight: 400 }}>(optional)</span></label>
                        <input type="file" accept="image/*" onChange={handleProofImageChange} style={{ width: '100%', fontSize: 12 }} />
                        {proofImage && (
                            <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                                <img src={proofImage} alt="proof" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                                <button onClick={() => setProofImage(null)} style={{ position: 'absolute', top: 4, right: 4, background: '#dc2626', border: 'none', borderRadius: '50%', width: 20, height: 20, color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px', textAlign: 'center', padding: 0 }}>&#x2715;</button>
                            </div>
                        )}
                    </div>

                    {/* Refund amount preview */}
                    <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#14532d', fontWeight: 600 }}>
                        💸 Refund amount: <strong>${refundAmount.toLocaleString()}</strong> ({effectiveRefundQty} × ${order.sellingPrice?.toLocaleString()})
                    </div>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button className="btn btn-sm btn-glass" onClick={onClose} disabled={saving}>Cancel</button>
                        <button
                            className="btn btn-sm"
                            style={{ background: '#dc2626', borderColor: '#dc2626', color: '#fff' }}
                            onClick={handleSubmit}
                            disabled={saving || effectiveRefundQty < 1}
                        >
                            {saving ? 'Processing...' : `Refund ${effectiveRefundQty} piece${effectiveRefundQty !== 1 ? 's' : ''}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// RETURN TO WAREHOUSE MODAL (Scenario B)
// ============================================================
export interface ReturnToWarehouseModalProps {
    allotment: {
        id: string;
        productName: string;
        storeName: string;
        quantityRemaining: number;
        pendingReturnQty: number;
        pendingReturnSizeQuantities?: Record<string, number> | null;
        pendingReturnColorQuantities?: Record<string, number> | null;
        pendingReturnVariantQuantities?: VariantQuantities | null;
        sizeQuantitiesRemaining?: Record<string, number> | null;
        colorQuantitiesRemaining?: Record<string, number> | null;
        variantQuantitiesRemaining?: VariantQuantities | null;
    };
    onConfirm: (payload: {
        id: string;
        returnQty: number;
        returnSizeQuantities?: Record<string, number> | null;
        returnColorQuantities?: Record<string, number> | null;
        returnVariantQuantities?: VariantQuantities | null;
        returnReason?: string;
        returnNote?: string;
        proofImage?: string | null;
    }) => Promise<void>;
    onClose: () => void;
}

export function ReturnToWarehouseModal({ allotment, onConfirm, onClose }: ReturnToWarehouseModalProps) {
    const maxQty = allotment.quantityRemaining || 0;
    const defaultQty = Math.min(allotment.pendingReturnQty > 0 ? allotment.pendingReturnQty : maxQty, maxQty);
    const [returnQty, setReturnQty] = useState(Math.max(1, defaultQty));
    const baseSizes = allotment.sizeQuantitiesRemaining || allotment.pendingReturnSizeQuantities;
    const baseColors = allotment.colorQuantitiesRemaining || allotment.pendingReturnColorQuantities;
    const baseVariants = allotment.pendingReturnVariantQuantities
        || allotment.variantQuantitiesRemaining
        || buildLegacyMaxVariantGrid(baseColors, baseSizes);
    const variantColors = Object.keys(baseVariants || {});
    const variantSizes = Array.from(new Set(Object.values(baseVariants || {}).flatMap(sizes => Object.keys(sizes || {}))));
    const hasVariantGrid = variantColors.length > 0 && variantSizes.length > 0;
    const [sizeInputs, setSizeInputs] = useState<Record<string, number>>(baseSizes ? { ...baseSizes } : {});
    const [colorInputs, setColorInputs] = useState<Record<string, number>>(baseColors ? { ...baseColors } : {});
    const [variantInputs, setVariantInputs] = useState<VariantQuantities>(
        allotment.pendingReturnVariantQuantities || allotment.variantQuantitiesRemaining
            ? buildVariantGrid(variantColors, variantSizes, baseVariants)
            : buildVariantGrid(variantColors, variantSizes)
    );
    const [reason, setReason] = useState(allotment.pendingReturnQty > 0 ? 'Customer return' : 'Unsold stock');
    const [note, setNote] = useState('');
    const [proofImage, setProofImage] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const hasSizes = !hasVariantGrid && baseSizes && Object.keys(baseSizes).length > 0;
    const hasColors = !hasVariantGrid && baseColors && Object.keys(baseColors).length > 0;
    const effectiveReturnQty = hasVariantGrid ? variantGrandTotal(variantInputs) : returnQty;

    const handleSubmit = async () => {
        if (saving) return;
        setSaving(true);
        try {
            await onConfirm({
                id: allotment.id,
                returnQty: effectiveReturnQty,
                returnSizeQuantities: hasSizes ? sizeInputs : null,
                returnColorQuantities: hasColors ? colorInputs : null,
                returnVariantQuantities: hasVariantGrid ? variantInputs : null,
                returnReason: reason,
                returnNote: note || undefined,
                proofImage: proofImage || null,
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 620, width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Return to Main Store</h3>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                            {allotment.productName} — {allotment.storeName}
                        </div>
                    </div>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18 }}>&#x2715;</button>
                </div>
                <div className="modal-body" style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {allotment.pendingReturnQty > 0 && (
                        <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1e40af', fontWeight: 600 }}>
                            📦 {allotment.pendingReturnQty} piece{allotment.pendingReturnQty !== 1 ? 's' : ''} physically back at {allotment.storeName} awaiting warehouse return.
                        </div>
                    )}

                    {/* Return Qty */}
                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                            Qty to Return to Main Store <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(max {maxQty})</span>
                        </label>
                        <input
                            type="number" min={1} max={maxQty}
                            value={effectiveReturnQty}
                            readOnly={hasVariantGrid}
                            onChange={e => setReturnQty(Math.min(maxQty, Math.max(1, Number(e.target.value))))}
                            style={hasVariantGrid ? { background: 'var(--surface-2)', cursor: 'default' } : undefined}
                        />
                    </div>

                    {hasVariantGrid && (
                        <VariantQuantityGrid
                            colors={variantColors}
                            sizes={variantSizes}
                            values={variantInputs}
                            maxValues={baseVariants}
                            title="Return by Color & Size"
                            onChange={setVariantInputs}
                        />
                    )}

                    {/* Size breakdown */}
                    {hasSizes && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Sizes Returning to Main Store</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px,1fr))', gap: 8 }}>
                                {Object.keys(baseSizes!).map(size => (
                                    <div key={size}>
                                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>{size} (max {baseSizes![size]})</label>
                                        <input
                                            type="number" min={0} max={baseSizes![size]}
                                            value={sizeInputs[size] ?? 0}
                                            onChange={e => setSizeInputs(prev => ({ ...prev, [size]: Math.min(baseSizes![size], Math.max(0, Number(e.target.value))) }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Color breakdown */}
                    {hasColors && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Colors Returning to Main Store</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: 8 }}>
                                {Object.keys(baseColors!).map(color => (
                                    <div key={color}>
                                        <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>{color} (max {baseColors![color]})</label>
                                        <input
                                            type="number" min={0} max={baseColors![color]}
                                            value={colorInputs[color] ?? 0}
                                            onChange={e => setColorInputs(prev => ({ ...prev, [color]: Math.min(baseColors![color], Math.max(0, Number(e.target.value))) }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reason */}
                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Reason</label>
                        <select value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%' }}>
                            <option>Unsold stock</option>
                            <option>Customer return</option>
                            <option>Damaged goods</option>
                            <option>Wrong item</option>
                            <option>Other</option>
                        </select>
                    </div>

                    {/* Optional note */}
                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Note <span style={{ fontWeight: 400 }}>(optional)</span></label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={2}
                            placeholder="Any additional details…"
                            style={{ width: '100%', resize: 'vertical' }}
                        />
                    </div>

                    {/* Proof image */}
                    <div className="input-group">
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Proof Image <span style={{ fontWeight: 400 }}>(optional)</span></label>
                        {proofImage ? (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                <img src={proofImage} alt="proof" style={{ maxHeight: 120, borderRadius: 8, border: '1px solid var(--border)' }} />
                                <button type="button" onClick={() => setProofImage(null)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 13, lineHeight: '22px', textAlign: 'center' }}>✕</button>
                            </div>
                        ) : (
                            <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 8, border: '1.5px dashed var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
                                📎 Attach photo
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = ev => setProofImage(ev.target?.result as string);
                                    reader.readAsDataURL(file);
                                }} />
                            </label>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button className="btn btn-sm btn-glass" onClick={onClose} disabled={saving}>Cancel</button>
                        <button
                            className="btn btn-sm btn-primary"
                            onClick={handleSubmit}
                            disabled={saving || maxQty === 0 || effectiveReturnQty < 1}
                        >
                            {saving ? 'Returning...' : `Return ${effectiveReturnQty} piece${effectiveReturnQty !== 1 ? 's' : ''} to Main Store`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
