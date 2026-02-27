import React, { useState } from 'react';
import Badge from './Badge';
import { SaleModalProps, CreateStoreModalProps, ReportModalProps, AddInventoryModalProps, AllotToStoreModalProps, InventoryItem, Order, Product, Store } from '../types';

type SaleInventoryItem = Pick<InventoryItem, 'productName' | 'quantityAvailable' | 'sellingPrice'>;

interface SaleModalPropsLocal {
    inventory: SaleInventoryItem[];
  storeName?: string;
  isAdmin?: boolean;
  storeNames?: string[];
  onAdd: (sale: any) => void;
  onClose: () => void;
}

export function SaleModal({ inventory, storeName, isAdmin, storeNames, onAdd, onClose }: SaleModalPropsLocal) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const [sale, setSale] = useState<any>({
        productName: '',
        quantity: 1,
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

    const selectedItem = inventory.find(i => i.productName === sale.productName);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalPrice = currency === 'GBP' ? sale.sellingPrice * gbpRate : sale.sellingPrice;
        onAdd({
            ...sale,
            type: 'Sale',
            sellingPrice: finalPrice,
            occurredAt: sale.occurredAt || todayIso,
            extraCharges: sale.extraCharges || 0,
            extraQty: sale.extraQty || 0,
        });
        onClose();
    };

    const currentPriceInPKR = currency === 'GBP' ? sale.sellingPrice * gbpRate : sale.sellingPrice;
    const totalBill = (currentPriceInPKR * sale.quantity);
    const totalDeductions = (sale.shipmentCost || 0) + (sale.extraCharges || 0);
    const netPayable = totalBill - totalDeductions;
    const totalDispatch = (sale.quantity || 0) + (sale.extraQty || 0);

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '480px' }}>
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
                                    value={sale.productName}
                                    onChange={e => {
                                        const item = inventory.find(i => i.productName === e.target.value);
                                        setSale({ ...sale, productName: e.target.value, sellingPrice: item?.sellingPrice || 0 });
                                        setCurrency('PKR'); // Reset to PKR on item select
                                    }}
                                    required
                                >
                                    <option value="">Choose...</option>
                                    {inventory.map(i => (
                                        <option key={i.productName} value={i.productName}>
                                            {i.productName} ({i.quantityAvailable})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label>Qty Sold</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={sale.quantity}
                                    onChange={e => setSale({ ...sale, quantity: parseInt(e.target.value) || 0 })}
                                />
                            </div>

                            <div className="input-group">
                                <label>Extra Qty <span style={{ fontSize: '10px', fontWeight: 400, color: '#8c8c8c' }}>(free / bonus)</span></label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={sale.extraQty}
                                    onChange={e => setSale({ ...sale, extraQty: parseInt(e.target.value) || 0 })}
                                />
                            </div>

                            <div className="input-group">
                                <label>Selling Price ({currency})</label>
                                <input
                                    type="number"
                                    step="0.01"
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

                            <div className="input-group">
                                <label style={{ color: 'var(--danger)', fontWeight: 700 }}>Shipment Cost (PKR)</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={sale.shipmentCost}
                                    onChange={e => setSale({ ...sale, shipmentCost: parseFloat(e.target.value) || 0 })}
                                    style={{ border: '1px solid var(--danger)' }}
                                />
                            </div>

                            <div className="input-group">
                                <label style={{ color: 'var(--danger)', fontWeight: 700 }}>Extra Charges (PKR)</label>
                                <input
                                    type="number"
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
                                        type="number"
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

export function ReportModal({ data, onClose }) {
    const Rs = (n) => "Rs " + (Number(n) || 0).toLocaleString();

    // Group analysis by month
    const monthlyData = {};
    data.orders.forEach(o => {
        const month = new Date(o.date).toLocaleString('default', { month: 'long', year: 'numeric' });
        if (!monthlyData[month]) monthlyData[month] = { sales: 0, profit: 0, commission: 0 };
        monthlyData[month].sales += (o.sellingPrice * o.quantity);
        monthlyData[month].profit += o.profit;
        monthlyData[month].commission += (o.commissionAmount || 0);
    });

    const totalSales = data.orders.reduce((s, o) => s + (o.sellingPrice * o.quantity), 0);
    const totalProfit = data.orders.reduce((s, o) => s + o.profit, 0);
    const totalExpenses = data.expenses.reduce((s, e) => s + e.amount, 0);

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '800px', width: '90%' }}>
                <div className="modal-head">
                                <h3>Financial Performance Reports</h3>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-sm" onClick={async () => {
                                        // Download PDF for the provided data via POST
                                        try {
                                            const resp = await fetch('/api/report', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ orders: data.orders || [], expenses: data.expenses || [], stores: data.stores || {} })
                                            });
                                            if (!resp.ok) throw new Error('Failed to generate PDF');
                                            const blob = await resp.blob();
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `report-${new Date().toISOString().slice(0,10)}.pdf`;
                                            document.body.appendChild(a);
                                            a.click();
                                            a.remove();
                                            window.URL.revokeObjectURL(url);
                                        } catch (e) {
                                            console.error(e);
                                            alert('Failed to download PDF');
                                        }
                                    }} style={{ padding: '6px 10px' }}>
                                        ⬇️ Download PDF
                                    </button>
                                    <button className="btn btn-sm" onClick={onClose}>✕</button>
                                </div>
                </div>
                <div className="modal-body">
                    <div className="report-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                        <div style={{ padding: 16, background: 'var(--acc-soft)', borderRadius: 12 }}>
                            <div style={{ fontSize: '12px', color: 'var(--acc)', fontWeight: 700 }}>LIFE-TIME SALES</div>
                            <div style={{ fontSize: '20px', fontWeight: 800 }}>{Rs(totalSales)}</div>
                        </div>
                        <div style={{ padding: 16, background: 'rgba(39,174,96,0.1)', borderRadius: 12 }}>
                            <div style={{ fontSize: '12px', color: '#27ae60', fontWeight: 700 }}>GROSS PROFIT</div>
                            <div style={{ fontSize: '20px', fontWeight: 800 }}>{Rs(totalProfit)}</div>
                        </div>
                        <div style={{ padding: 16, background: 'rgba(235,87,87,0.1)', borderRadius: 12 }}>
                            <div style={{ fontSize: '12px', color: '#eb5757', fontWeight: 700 }}>OPERATIONAL COSTS</div>
                            <div style={{ fontSize: '20px', fontWeight: 800 }}>{Rs(totalExpenses)}</div>
                        </div>
                        <div style={{ padding: 16, background: 'var(--purple-soft)', borderRadius: 12 }}>
                            <div style={{ fontSize: '12px', color: 'var(--purple)', fontWeight: 700 }}>NET BALANCE</div>
                            <div style={{ fontSize: '20px', fontWeight: 800 }}>{Rs(totalProfit - totalExpenses)}</div>
                        </div>
                    </div>

                    <div className="table-wrap">
                        <table style={{ fontSize: '0.9rem' }}>
                            <thead>
                                <tr>
                                    <th>Month Period</th>
                                    <th>Sales Generated</th>
                                    <th>Partner Comm.</th>
                                    <th style={{ textAlign: 'right' }}>Admin Net Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(monthlyData).reverse().map(([month, vals], i) => (
                                    <tr key={i}>
                                        <td className="font-bold">{month}</td>
                                        <td>{Rs((vals as any).sales)}</td>
                                        <td style={{ color: 'var(--danger)' }}>-{Rs((vals as any).commission)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>{Rs((vals as any).profit)}</td>
                                    </tr>
                                ))}
                                {Object.keys(monthlyData).length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40 }}>No report data available yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: 24, textAlign: 'center', padding: 16, background: 'var(--surface-2)', borderRadius: 8 }}>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            * Reports are generated based on all historical system transactions.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AddInventoryModal({ onSave, onClose, stores, products }: AddInventoryModalProps) {
    const [productMode, setProductMode] = useState<'select' | 'new'>(products?.length ? 'select' : 'new');
    const [selectedProductId, setSelectedProductId] = useState<string>(products?.[0]?.id || '');

    const [item, setItem] = useState({
        itemId: 'ITEM-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        quantity: 1,
        pricePerPiece: 0,
        picture: '',
    });

    const [newProduct, setNewProduct] = useState<{
        productName: string;
        brandName: string;
        productType: string;
        customType: string;
    }>({
        productName: '',
        brandName: '',
        productType: 'T-shirt',
        customType: ''
    });

    const [colors, setColors] = useState<string[]>([]);
    const [colorInput, setColorInput] = useState('');
    const [sizes, setSizes] = useState<string[]>([]);
    const [customSize, setCustomSize] = useState('');
    const [allotedStores, setAllotedStores] = useState<string[]>([]);

    const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const itemTypes = ['T-shirt', 'Jacket', 'Sweatshirt', 'Jeans', 'Hoodie', 'Other'];

    const selectedProduct: Product | undefined = (products || []).find(p => p.id === selectedProductId);
    const displayColors = productMode === 'new' ? colors : (selectedProduct?.colors || []);
    const displaySizes = productMode === 'new' ? sizes : (selectedProduct?.sizes || []);

    const handleAddColor = () => {
        if (colorInput && !colors.includes(colorInput)) {
            setColors([...colors, colorInput.toLowerCase()]);
            setColorInput('');
        }
    };

    const toggleSize = (size: string) => {
        setSizes(prev => prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]);
    };

    const handleAddCustomSize = () => {
        if (customSize && !sizes.includes(customSize)) {
            setSizes([...sizes, customSize.toUpperCase()]);
            setCustomSize('');
        }
    };

    const toggleStore = (store: string) => {
        setAllotedStores(prev => prev.includes(store) ? prev.filter(s => s !== store) : [...prev, store]);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setItem({ ...item, picture: reader.result as string });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (productMode === 'select' && !selectedProductId) return alert('Select a product');
        if (productMode === 'new') {
            const pn = newProduct.productName.trim();
            if (!pn) return alert('Enter product name');
        }

        onSave({
            ...item,
            productId: productMode === 'select' ? selectedProductId : undefined,
            allotedStores,
            newProduct: productMode === 'new'
                ? {
                    productName: newProduct.productName.trim(),
                    brandName: newProduct.brandName.trim(),
                    productType: (newProduct.productType === 'Other' ? newProduct.customType : newProduct.productType).trim(),
                    pricePerPiece: item.pricePerPiece,
                    colors,
                    sizes
                }
                : undefined
        });
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '600px', width: '95%' }}>
                <div className="modal-head" style={{ padding: '16px 20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>📦 Add Warehouse Inventory</h3>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: '18px' }}>✕</button>
                </div>
                <div className="modal-body" style={{ padding: '24px' }}>
                    <form onSubmit={handleSubmit}>
                        <div className="input-group" style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
                                    position: 'relative',
                                    transition: 'all 0.2s ease'
                                }}
                                onClick={() => document.getElementById('item-pic-input')?.click()}
                            >
                                {item.picture ? (
                                    <img src={item.picture} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <>
                                        <span style={{ fontSize: '24px' }}>📸</span>
                                    </>
                                )}
                                <input 
                                    id="item-pic-input"
                                    type="file" 
                                    accept="image/*" 
                                    style={{ display: 'none' }} 
                                    onChange={handleImageChange}
                                />
                            </div>
                            {!item.picture && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 8 }}>Click to upload</span>}
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 20 }}>
                            <div className="input-group">
                                <label>Item ID (Auto-gen)</label>
                                <input readOnly value={item.itemId} style={{ background: '#f8fafc', fontWeight: 700, color: 'var(--acc)' }} />
                            </div>
                            <div className="input-group">
                                <label>Product</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <select
                                        value={selectedProductId}
                                        onChange={e => setSelectedProductId(e.target.value)}
                                        disabled={productMode !== 'select'}
                                        required={productMode === 'select'}
                                        style={{ flex: 1 }}
                                    >
                                        <option value="">Choose...</option>
                                        {(products || []).map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.productName}{p.brandName ? ` — ${p.brandName}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${productMode === 'new' ? 'btn-primary' : 'btn-glass'}`}
                                        onClick={() => setProductMode(productMode === 'new' ? 'select' : 'new')}
                                        style={{ whiteSpace: 'nowrap' }}
                                    >
                                        {productMode === 'new' ? 'Select Existing' : '+ New Product'}
                                    </button>
                                </div>
                                {productMode === 'select' && !products?.length && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                        No products yet. Click “+ New Product”.
                                    </div>
                                )}
                            </div>
                        </div>

                        {productMode === 'new' && (
                            <>
                                <div className="form-grid-2" style={{ marginBottom: 20 }}>
                                    <div className="input-group">
                                        <label>Product Name</label>
                                        <input
                                            required
                                            placeholder="e.g. Summer Breeze Tee"
                                            value={newProduct.productName}
                                            onChange={e => setNewProduct({ ...newProduct, productName: e.target.value })}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Brand Name</label>
                                        <input
                                            placeholder="e.g. Trendy Wear"
                                            value={newProduct.brandName}
                                            onChange={e => setNewProduct({ ...newProduct, brandName: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="input-group" style={{ marginBottom: 20 }}>
                                    <label>Product Type</label>
                                    <select value={newProduct.productType} onChange={e => setNewProduct({ ...newProduct, productType: e.target.value })}>
                                        {itemTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    {newProduct.productType === 'Other' && (
                                        <input
                                            style={{ marginTop: 8 }}
                                            placeholder="Enter custom type..."
                                            value={newProduct.customType}
                                            onChange={e => setNewProduct({ ...newProduct, customType: e.target.value })}
                                            required
                                        />
                                    )}
                                </div>
                            </>
                        )}

                        {productMode === 'select' && selectedProduct && (
                            <div style={{ marginBottom: 20, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}>
                                <div style={{ fontSize: 12, fontWeight: 800 }}>{selectedProduct.productName}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                    {selectedProduct.brandName ? `Brand: ${selectedProduct.brandName} · ` : ''}{selectedProduct.productType ? `Type: ${selectedProduct.productType}` : ''}
                                </div>
                            </div>
                        )}

                        <div className="form-grid-2" style={{ marginBottom: 20 }}>
                            <div className="input-group">
                                <label>Price Per Piece (Cost)</label>
                                <input type="number" required placeholder="0.00" value={item.pricePerPiece} onChange={e => setItem({ ...item, pricePerPiece: parseFloat(e.target.value) })} />
                            </div>
                            <div className="input-group">
                                <label>Total Quantity</label>
                                <input type="number" required min="1" value={item.quantity} onChange={e => setItem({ ...item, quantity: parseInt(e.target.value) })} />
                            </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: 20 }}>
                            <label>Colors</label>
                            {productMode === 'new' ? (
                                <>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                        <input 
                                            placeholder="Add color (e.g. red, navy, #ffaa00)..." 
                                            value={colorInput} 
                                            onChange={e => setColorInput(e.target.value)} 
                                            onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddColor())}
                                        />
                                        <button type="button" className="btn btn-primary" onClick={handleAddColor}>Add</button>
                                    </div>
                                </>
                            ) : (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                                    Colors come from the product catalog.
                                </div>
                            )}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {displayColors.map(c => (
                                    <div 
                                        key={c} 
                                        style={{ 
                                            padding: '6px 12px', 
                                            borderRadius: '20px', 
                                            background: 'var(--surface-2)', 
                                            border: '1px solid var(--border)',
                                            color: c,
                                            fontWeight: 800,
                                            fontSize: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            textTransform: 'capitalize',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                        }}
                                    >
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }}></span>
                                        {c}
                                        {productMode === 'new' && (
                                            <span style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => setColors(colors.filter(x => x !== c))}>×</span>
                                        )}
                                    </div>
                                ))}
                                {displayColors.length === 0 && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No colors set.</div>
                                )}
                            </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: 20 }}>
                            <label>Sizes</label>
                            {productMode === 'new' ? (
                                <>
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
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input 
                                            placeholder="Add custom size (e.g. 3XL)..." 
                                            value={customSize} 
                                            onChange={e => setCustomSize(e.target.value)}
                                            onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomSize())}
                                        />
                                        <button type="button" className="btn btn-sm" onClick={handleAddCustomSize} style={{ whiteSpace: 'nowrap' }}>+ Custom Size</button>
                                    </div>
                                    {sizes.some(s => !availableSizes.includes(s)) && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                            {sizes.filter(s => !availableSizes.includes(s)).map(s => (
                                                <Badge key={s} type="purple">
                                                    {s} <span style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => setSizes(sizes.filter(x => x !== s))}>×</span>
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                                        Sizes come from the product catalog.
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {displaySizes.map(s => (
                                            <Badge key={s} type="gray">{s}</Badge>
                                        ))}
                                        {displaySizes.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No sizes set.</div>}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="input-group" style={{ marginBottom: 24 }}>
                            <label>Alloted Stores</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {stores.map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        className={`btn btn-sm ${allotedStores.includes(s) ? 'btn-primary' : 'btn-glass'}`}
                                        onClick={() => toggleStore(s)}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-full" style={{ height: 52, fontSize: '16px', fontWeight: 800 }}>
                            Add to Warehouse Inventory
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export function AllotToStoreModal({ onSave, onClose, stores, inventory, allotedQtyByProduct, storeCommissionByName }: AllotToStoreModalProps) {
    const [form, setForm] = useState({
        storeName: stores?.[0] || '',
        batchNumber: inventory?.[0]?.batchNumber || '',
        quantity: 1,
        ownerSupplyPrice: 0,
        commissionPercent: 0,
    });

    const selectedInv = (inventory || []).find(i => i.batchNumber === form.batchNumber);
    const productName = selectedInv?.productName || '';
    const allotedQty = allotedQtyByProduct?.[productName] || 0;
    const totalQty = Number(selectedInv?.quantityAvailable) || 0;
    const maxQty = Math.max(0, totalQty - allotedQty);

    React.useEffect(() => {
        if (!form.storeName && stores?.length) {
            setForm(prev => ({ ...prev, storeName: stores[0] }));
        }
    }, [stores, form.storeName]);

    React.useEffect(() => {
        const inv = (inventory || []).find(i => i.batchNumber === form.batchNumber);
        const cost = Number(inv?.costPrice) || 0;
        const commission = Number(storeCommissionByName?.[form.storeName]) || 0;
        setForm(prev => ({
            ...prev,
            ownerSupplyPrice: prev.ownerSupplyPrice || cost,
            commissionPercent: prev.commissionPercent || commission,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.batchNumber, form.storeName]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!form.storeName) return alert('Select store');
        if (!form.batchNumber) return alert('Select item');
        if (!form.quantity || form.quantity < 1) return alert('Enter quantity');
        if (form.quantity > maxQty) return alert(`Quantity cannot be more than ${maxQty}`);

        onSave({
            storeName: form.storeName,
            batchNumber: form.batchNumber,
            quantity: Number(form.quantity),
            ownerSupplyPrice: Number(form.ownerSupplyPrice) || 0,
            commissionPercent: Number(form.commissionPercent) || 0,
        });
        onClose();
    };

    const Rs = (n: number) => 'Rs ' + (Number(n) || 0).toLocaleString();

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '560px', width: '95%' }}>
                <div className="modal-head" style={{ padding: '16px 20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>🏪 Alot to Store</h3>
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
                                <label>Quantity (Max {maxQty})</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={maxQty}
                                    value={form.quantity}
                                    onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                                    required
                                />
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                    Total Qty: <b>{totalQty}</b> · Aloted Qty: <b>{allotedQty}</b> · Available: <b>{maxQty}</b>
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Cost/PC (Warehouse)</label>
                                <input readOnly value={Rs(Number(selectedInv?.costPrice) || 0)} style={{ background: 'var(--surface-2)', fontWeight: 800 }} />
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 18 }}>
                            <div className="input-group">
                                <label>New Price (Supply to Store)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={form.ownerSupplyPrice}
                                    onChange={(e) => setForm({ ...form, ownerSupplyPrice: parseFloat(e.target.value) || 0 })}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <label>Partner Commission %</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={form.commissionPercent}
                                    onChange={(e) => setForm({ ...form, commissionPercent: parseFloat(e.target.value) || 0 })}
                                    required
                                />
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
