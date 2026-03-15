import React, { useState } from 'react';
import { usePopup } from './Popup';
import Badge from './Badge';
import { SaleModalProps, CreateStoreModalProps, ReportModalProps, AddInventoryModalProps, AllotToStoreModalProps, InventoryItem, Order, Product, Store, Expense } from '../types';

type SaleInventoryItem = Pick<InventoryItem, 'productName' | 'quantityAvailable' | 'sellingPrice'> & { ownerSupplyPrice?: number };

interface SaleModalPropsLocal {
    inventory: SaleInventoryItem[];
  storeName?: string;
  isAdmin?: boolean;
  storeNames?: string[];
  onAdd: (sale: any) => void;
  onClose: () => void;
}

export function EditStoreInventoryModal({ item, storeNames, onSave, onClose }: { item: any; storeNames?: string[]; onSave: (fields: any) => void; onClose: () => void }) {
    const { toast } = usePopup();
    const [form, setForm] = useState({
        storeName: item?.storeName || (storeNames && storeNames[0]) || '',
        ownerSupplyPrice: item?.ownerSupplyPrice || 0,
        commissionPercent: item?.commissionPercent || 0,
        storeSellingPrice: item?.storeSellingPrice || item?.ownerSupplyPrice || 0,
        quantityAssigned: item?.quantityAssigned || 0,
        quantityRemaining: item?.quantityRemaining || 0,
    });

    React.useEffect(() => {
        if (!form.storeName && storeNames?.length) {
            setForm(prev => ({ ...prev, storeName: storeNames[0] }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeNames]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const assigned = Number(form.quantityAssigned) || 0;
        const remaining = Number(form.quantityRemaining) || 0;
        if (assigned < 0 || remaining < 0) return toast.error('Quantities must be >= 0');
        if (remaining > assigned) return toast.error('Remaining cannot exceed assigned');

        const fields: any = {};
        if (form.ownerSupplyPrice !== undefined) fields.owner_supply_price = Number(form.ownerSupplyPrice) || 0;
        if (form.commissionPercent !== undefined) fields.commission_percent = Number(form.commissionPercent) || 0;
        if (form.storeSellingPrice !== undefined) fields.store_selling_price = Number(form.storeSellingPrice) || 0;
        if (form.quantityAssigned !== undefined) fields.quantity_assigned = Number(form.quantityAssigned) || 0;
        if (form.quantityRemaining !== undefined) fields.quantity_remaining = Number(form.quantityRemaining) || 0;
        if (form.storeName) fields.storeName = form.storeName;

        onSave(fields);
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '560px', width: '95%' }}>
                <div className="modal-head" style={{ padding: '16px 20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Edit Allotment</h3>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: '18px' }}>✕</button>
                </div>
                <div className="modal-body" style={{ padding: '22px 20px' }}>
                    <form onSubmit={handleSubmit}>
                        <div className="form-grid-2" style={{ marginBottom: 12 }}>
                            <div className="input-group">
                                <label>Store</label>
                                <select value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} required>
                                    {(storeNames || []).map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label>Item (Batch)</label>
                                <input readOnly value={item?.productName || item?.batchNumber || 'Unknown'} style={{ background: 'var(--surface-2)', fontWeight: 700 }} />
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 12 }}>
                            <div className="input-group">
                                <label>Owner Supply Price</label>
                                <input type="text" inputMode="decimal" value={form.ownerSupplyPrice} onChange={(e) => setForm({ ...form, ownerSupplyPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="input-group">
                                <label>Store Selling Price</label>
                                <input type="text" inputMode="decimal" value={form.storeSellingPrice} onChange={(e) => setForm({ ...form, storeSellingPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 12 }}>
                            <div className="input-group">
                                <label>Quantity Assigned</label>
                                <input type="text" inputMode="numeric" value={form.quantityAssigned} onChange={(e) => setForm({ ...form, quantityAssigned: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div className="input-group">
                                <label>Quantity Remaining</label>
                                <input type="text" inputMode="numeric" value={form.quantityRemaining} onChange={(e) => setForm({ ...form, quantityRemaining: parseInt(e.target.value) || 0 })} />
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ marginBottom: 16 }}>
                            <div className="input-group">
                                <label>Partner Commission %</label>
                                <input type="text" inputMode="decimal" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="input-group">
                                <label>Inventory ID</label>
                                <input readOnly value={item?.inventoryId || item?.inventory_id || item?.id || ''} style={{ background: 'var(--surface-2)', fontWeight: 700 }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="btn btn-primary">Save</button>
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
    const totalDeductions = (isAdmin ? (sale.shipmentCost || 0) : 0) + (sale.extraCharges || 0);
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
    const totRevenue    = orders.reduce((s, o) => s + (o.sellingPrice || 0) * (o.quantity || 0), 0);
    const totCOGS       = orders.reduce((s, o) => s + (o.costPrice    || 0) * (o.quantity || 0), 0);
    const totCommission = orders.reduce((s, o) => s + (o.commissionAmount || 0), 0);
    const grossProfit   = totRevenue - totCOGS;
    const totExpenses   = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit     = grossProfit - totExpenses;

    // ── Build product rows ───────────────────────────────────────────────
    const prodMap: Record<string, { product: string; orders: number; qty: number; revenue: number; cogs: number; commission: number; gp: number }> = {};
    orders.forEach(o => {
        const k = o.productName || 'Unknown';
        if (!prodMap[k]) prodMap[k] = { product: k, orders: 0, qty: 0, revenue: 0, cogs: 0, commission: 0, gp: 0 };
        prodMap[k].orders++;
        prodMap[k].qty        += o.quantity || 0;
        prodMap[k].revenue    += (o.sellingPrice || 0) * (o.quantity || 0);
        prodMap[k].cogs       += (o.costPrice    || 0) * (o.quantity || 0);
        prodMap[k].commission += o.commissionAmount || 0;
        prodMap[k].gp          = prodMap[k].revenue - prodMap[k].cogs;
    });
    const prodRows = Object.values(prodMap);

    // ── Build store rows ─────────────────────────────────────────────────
    const storeMap: Record<string, { store: string; orders: number; qty: number; revenue: number; cogs: number; commission: number; netProfit: number }> = {};
    orders.forEach(o => {
        const k = o.storeName || 'Unknown';
        if (!storeMap[k]) storeMap[k] = { store: k, orders: 0, qty: 0, revenue: 0, cogs: 0, commission: 0, netProfit: 0 };
        storeMap[k].orders++;
        storeMap[k].qty        += o.quantity || 0;
        storeMap[k].revenue    += (o.sellingPrice    || 0) * (o.quantity || 0);
        storeMap[k].cogs       += (o.costPrice       || 0) * (o.quantity || 0);
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
            <div className="modal-box" style={{ maxWidth: 960, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div className="modal-head" style={{ flexShrink: 0 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Generate Report</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={handlePDF} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Download PDF
                        </button>
                        <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18, lineHeight: 1 }}>✕</button>
                    </div>
                </div>

                <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>

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




export function AddInventoryModal({ onSave, onClose, stores, products }: AddInventoryModalProps) {
    const { toast } = usePopup();
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

        if (productMode === 'select' && !selectedProductId) return toast.error('Select a product');
        if (productMode === 'new') {
            const pn = newProduct.productName.trim();
            if (!pn) return toast.error('Enter product name');
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
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Add Warehouse Inventory</h3>
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
                                        <span style={{ fontSize: '24px', color: 'var(--text-faint)' }}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg></span>
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
                                <input type="text" inputMode="decimal" required placeholder="0.00" value={item.pricePerPiece} onChange={e => setItem({ ...item, pricePerPiece: parseFloat(e.target.value) })} />
                            </div>
                            <div className="input-group">
                                <label>Total Quantity</label>
                                <input type="text" inputMode="numeric" required value={item.quantity} onChange={e => setItem({ ...item, quantity: parseInt(e.target.value) })} />
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
    const { toast } = usePopup();
    const [form, setForm] = useState({
        storeName: stores?.[0] || '',
        batchNumber: inventory?.[0]?.batchNumber || '',
        quantity: 1,
        ownerSupplyPrice: 0,
        commissionPercent: 0,
        extraQty: 0,
    });

    const selectedInv = (inventory || []).find(i => i.batchNumber === form.batchNumber);
    const productName = selectedInv?.productName || '';
    // Key by inventory.id (batch-level) to avoid mixing up different batches of same product
    const allotedQty = allotedQtyByProduct?.[selectedInv?.id || ''] || 0;
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

        if (!form.storeName) return toast.error('Select store');
        if (!form.batchNumber) return toast.error('Select item');
        if (!form.quantity || form.quantity < 1) return toast.error('Enter quantity');
        const extraQty = Number(form.extraQty) || 0;
        if (form.quantity + extraQty > maxQty) return toast.error(`Total (qty + extra) cannot exceed available stock (${maxQty})`);
        const warehouseCost = Number(selectedInv?.costPrice) || 0;
        if (warehouseCost > 0 && Number(form.ownerSupplyPrice) < warehouseCost) {
            return toast.error(`New price cannot be less than warehouse cost (Rs ${warehouseCost.toLocaleString()})`);
        }

        onSave({
            storeName: form.storeName,
            batchNumber: form.batchNumber,
            quantity: Number(form.quantity),
            ownerSupplyPrice: Number(form.ownerSupplyPrice) || 0,
            commissionPercent: Number(form.commissionPercent) || 0,
            extraQty,
        });
        onClose();
    };

    const Rs = (n: number) => 'Rs ' + (Number(n) || 0).toLocaleString();

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '560px', width: '95%' }}>
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
                                <label>Quantity (Max {maxQty})</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
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
    const cogsTotal       = orders.reduce((s, o) => s + ((Number(o.costPrice) || 0) * (Number(o.quantity) || 1)), 0);
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
                style={{ maxWidth: 640, width: '95%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-head" style={{ padding: '16px 20px', flexShrink: 0 }}>
                    <div>
                        <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Expense Breakdown</h3>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>All costs contributing to the Expenses KPI</div>
                    </div>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18 }}>✕</button>
                </div>

                {/* Scrollable body */}
                <div className="modal-body" style={{ padding: '4px 20px 24px', overflowY: 'auto', flex: 1 }}>

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
                    <SectionHeader title="Cost of Goods Sold (COGS)" total={cogsTotal} color="#eff6ff" sectionKey="cogs" itemCount={orders.length} />
                    {expandedSections.cogs && (
                        orders.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>No orders in this period.</div>
                        ) : (
                            orders.map((o, i) => (
                                <LineItem
                                    key={o.id || i}
                                    label={o.productName}
                                    sub={`${o.quantity} unit${o.quantity !== 1 ? 's' : ''} × Rs ${(Number(o.costPrice) || 0).toLocaleString()} · ${o.storeName}`}
                                    amount={(Number(o.costPrice) || 0) * (Number(o.quantity) || 1)}
                                />
                            ))
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
