import { useState } from 'react';
import Badge from './Badge';

export function SaleModal({ inventory, storeName, isAdmin, storeNames, onAdd, onClose }) {
    const [sale, setSale] = useState({
        productName: '',
        quantity: 1,
        sellingPrice: 0,
        shipmentCost: 0,
        storeName: storeName || (storeNames && storeNames[0]) || 'Direct',
        clientName: '',
        type: 'Sale'
    });

    const [currency, setCurrency] = useState('PKR');
    const gbpRate = 360; // 1 GBP = 360 PKR (Default)

    const selectedItem = inventory.find(i => i.productName === sale.productName);

    const handleSubmit = (e) => {
        e.preventDefault();
        // Convert to PKR if entered in GBP
        const finalPrice = currency === 'GBP' ? sale.sellingPrice * gbpRate : sale.sellingPrice;
        onAdd({ ...sale, sellingPrice: finalPrice });
        onClose();
    };

    const currentPriceInPKR = currency === 'GBP' ? sale.sellingPrice * gbpRate : sale.sellingPrice;
    const totalBill = (currentPriceInPKR * sale.quantity);
    const netPayable = totalBill - (sale.shipmentCost || 0);

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '480px' }}>
                <div className="modal-head" style={{ padding: '12px 20px' }}>
                    <h3 style={{ fontSize: '16px' }}>New {sale.type}</h3>
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
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: '10px', color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Transaction Type</label>
                            <div style={{ display: 'flex', gap: 2, background: '#f5f5f5', padding: 3, borderRadius: 6 }}>
                                {['Sale', 'Gift'].map(t => (
                                    <button key={t} type="button"
                                        className="btn btn-sm"
                                        style={{
                                            flex: 1, border: 'none', borderRadius: 4, height: 28, fontSize: '12px', fontWeight: 700,
                                            background: sale.type === t ? '#fff' : 'transparent',
                                            color: sale.type === t ? '#1890ff' : '#8c8c8c',
                                            boxShadow: sale.type === t ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                                        }}
                                        onClick={() => setSale({ ...sale, type: t })}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                <label style={{ fontSize: '12px', marginBottom: 4 }}>Select Product</label>
                                <select
                                    value={sale.productName}
                                    onChange={e => {
                                        const item = inventory.find(i => i.productName === e.target.value);
                                        setSale({ ...sale, productName: e.target.value, sellingPrice: item?.sellingPrice || 0 });
                                        setCurrency('PKR'); // Reset to PKR on item select
                                    }}
                                    required
                                    style={{ height: 38, fontSize: '13px' }}
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
                                <label style={{ fontSize: '12px', marginBottom: 4 }}>Qty</label>
                                <input
                                    type="number"
                                    value={sale.quantity}
                                    onChange={e => setSale({ ...sale, quantity: parseInt(e.target.value) || 0 })}
                                    min="1"
                                    style={{ height: 38, fontSize: '13px' }}
                                />
                            </div>

                            <div className="input-group">
                                <label style={{ fontSize: '12px', marginBottom: 4 }}>Selling Price ({currency})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={sale.sellingPrice}
                                    onChange={e => setSale({ ...sale, sellingPrice: parseFloat(e.target.value) || 0 })}
                                    style={{ height: 38, fontSize: '13px', fontWeight: 700 }}
                                />
                                {currency === 'GBP' && (
                                    <div style={{ fontSize: '10px', color: 'var(--success)', marginTop: 4, fontWeight: 600 }}>
                                        ≈ Rs {currentPriceInPKR.toLocaleString()} (Rate: {gbpRate})
                                    </div>
                                )}
                            </div>

                            <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                <label style={{ fontSize: '12px', marginBottom: 4, color: 'var(--danger)', fontWeight: 700 }}>Shipment Cost (PKR - Deductible)</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={sale.shipmentCost}
                                    onChange={e => setSale({ ...sale, shipmentCost: parseFloat(e.target.value) || 0 })}
                                    style={{ height: 38, fontSize: '13px', border: '1px solid var(--danger)' }}
                                />
                            </div>

                            {isAdmin && (
                                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '12px', marginBottom: 4 }}>Location</label>
                                    <select value={sale.storeName} onChange={e => setSale({ ...sale, storeName: e.target.value })} style={{ height: 36, fontSize: '13px' }}>
                                        {Array.isArray(storeNames) && storeNames.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                <label style={{ fontSize: '12px', marginBottom: 4 }}>Customer Name</label>
                                <input placeholder="Client name..." value={sale.clientName} onChange={e => setSale({ ...sale, clientName: e.target.value })} style={{ height: 38, fontSize: '13px' }} />
                            </div>
                        </div>

                        <div style={{ marginTop: 20, padding: '12px 16px', background: '#f9fafb', borderRadius: 6, border: '1px solid #1890ff30' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ color: '#8c8c8c', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Gross Order Value:</span>
                                <span style={{ fontSize: '14px', fontWeight: 800 }}>Rs {totalBill.toLocaleString()}</span>
                            </div>
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
    const [store, setStore] = useState({ name: '', username: '', password: '', commission: 10 });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(store);
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '440px' }}>
                <div className="modal-head" style={{ padding: '16px 20px' }}>
                    <h3 style={{ fontSize: '16px' }}>Add New Shop Partner</h3>
                    <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: '16px' }}>✕</button>
                </div>
                <div className="modal-body" style={{ padding: '20px' }}>
                    <form onSubmit={handleSubmit}>
                        <div className="input-group" style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#525252' }}>Store Official Name</label>
                            <input
                                required
                                placeholder="e.g. Boutique A"
                                value={store.name}
                                onChange={e => setStore({ ...store, name: e.target.value })}
                                style={{ height: 40, fontSize: '14px' }}
                            />
                        </div>

                        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div className="input-group">
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#525252' }}>Login ID</label>
                                <input
                                    required
                                    placeholder="username"
                                    value={store.username}
                                    onChange={e => setStore({ ...store, username: e.target.value })}
                                    style={{ height: 40, fontSize: '14px' }}
                                />
                            </div>
                            <div className="input-group">
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#525252' }}>Password</label>
                                <input
                                    required
                                    type="password"
                                    placeholder="••••••••"
                                    value={store.password}
                                    onChange={e => setStore({ ...store, password: e.target.value })}
                                    style={{ height: 40, fontSize: '14px' }}
                                />
                            </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#525252' }}>Standard Partner Cut (%)</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="number"
                                    value={store.commission}
                                    onChange={e => setStore({ ...store, commission: parseFloat(e.target.value) })}
                                    style={{ height: 40, fontSize: '14px', paddingRight: 32 }}
                                />
                                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#8c8c8c' }}>%</span>
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-full" style={{ height: 44, fontSize: '14px', fontWeight: 700 }}>
                            Register Shop & Create Login
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
                                        <td>{Rs(vals.sales)}</td>
                                        <td style={{ color: 'var(--danger)' }}>-{Rs(vals.commission)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>{Rs(vals.profit)}</td>
                                    </tr>
                                ))}
                                {Object.keys(monthlyData).length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40 }}>No report data available yet.</td></tr>}
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

