import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import SectionCard from "../components/SectionCard";
import Badge from "../components/Badge";

import Login from "../components/Login";

const Rs = (n) => "Rs " + (Number(n) || 0).toLocaleString();

// Premium Quantity Editor for Warehouse
function QuantityEditor({ current, onSave }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(0);

    if (!editing) return (
        <button className="btn btn-sm btn-glass" onClick={() => setEditing(true)} style={{ fontWeight: 700 }}>
            Edit Stock
        </button>
    );

    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <input
                type="number"
                placeholder="+/-"
                autoFocus
                style={{ width: 64, height: 32, padding: '0 8px', fontSize: '12px', fontWeight: 800 }}
                onChange={e => setVal(parseInt(e.target.value) || 0)}
            />
            <button
                className="btn btn-primary"
                style={{ width: 28, height: 28, padding: 0, background: 'var(--success)', borderColor: 'var(--success)' }}
                onClick={() => { onSave(current + val); setEditing(false); }}
            >
                ✓
            </button>
            <button
                className="btn btn-glass"
                style={{ width: 28, height: 28, padding: 0 }}
                onClick={() => setEditing(false)}
            >
                ✕
            </button>
        </div>
    );
}

export default function InventoryPage() {
    const [user, setUser] = useState(null);
    const [data, setData] = useState({
        inventory: [],
        storeInventory: {},
        stores: {},
        purchases: [],
    });
    // Track inventory ownership: each admin can only see/manage their own
    // Assume each inventory item has an 'owner' field (username)
    const [loading, setLoading] = useState(true);
    const [editModal, setEditModal] = useState(null); // { item, field } or null
    const [distribute, setDistribute] = useState({
        storeName: '',
        productName: '',
        quantity: 1,
        ownerSupplyPrice: 0,
        commissionPercent: ''
    });

    const refresh = useCallback(async () => {
        try {
            const [pur, sinv, sto] = await Promise.all([
                fetch("/api/purchases").then((r) => r.json()),
                fetch("/api/storeInventory").then((r) => r.json()),
                fetch("/api/store").then((r) => r.json()),
            ]);
            setData({
                inventory: pur.inventory || [],
                purchases: pur.purchases || [],
                storeInventory: sinv.storeInventory || {},
                stores: sto.stores || {},
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) setUser(JSON.parse(storedUser));
        else setLoading(false);
    }, []);

    useEffect(() => {
        if (user) refresh();
    }, [user, refresh]);

    if (loading) return <div className="loading">Loading...</div>;
    if (!user) return <Login onLogin={(u) => {
        setUser(u);
        localStorage.setItem('user', JSON.stringify(u));
    }} />;

    const isAdmin = user.role === "admin";
    const isSuperAdmin = isAdmin && user.scope === 'all';
    // Bilal: admin with managedStores, but not superadmin
    const isStoreAdmin = isAdmin && user.managedStores && user.managedStores.length > 0 && !isSuperAdmin;

    const handleAddPurchase = async (purchase) => {
        await fetch("/api/purchases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(purchase),
        });
        refresh();
    };

    const handleAssignItem = async (e) => {
        if (e) e.preventDefault();

        await fetch("/api/storeInventory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...distribute,
                ownerSupplyPrice: parseFloat(distribute.ownerSupplyPrice),
                quantity: parseInt(distribute.quantity),
                commissionPercent: distribute.commissionPercent === '' ? null : parseFloat(distribute.commissionPercent)
            }),
        });

        setDistribute({
            storeName: '',
            productName: '',
            quantity: 1,
            ownerSupplyPrice: 0,
            commissionPercent: ''
        });
        refresh();
    };

    const handleUpdateItem = async (productName, batchNumber, fields) => {
        await fetch("/api/purchases", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productName, batchNumber, ...fields }),
        });
        refresh();
    };

    // Flatten store inventory for the table
    const stockProvided = [];
    Object.entries(data.storeInventory).forEach(([storeName, items]) => {
        // Only allow superadmin to see all, store admin to see managed stores, store user to see their own
        const canSee = isSuperAdmin || (isStoreAdmin && user.managedStores.includes(storeName)) || (!isAdmin && user.storeName === storeName);
        if (canSee) {
            Object.values(items).forEach((item) => {
                // Only show items provided by this admin (or all for superadmin)
                if (isSuperAdmin || item.owner === user.username) {
                    stockProvided.push({ ...item, storeName });
                }
            });
        }
    });

    // Summary calculations
    // For superadmin: all stores. For store admin: only managed stores.
    let totalInventoryValue = 0;
    let totalItemsInWarehouse = 0;
    let totalItemsInStores = 0;
    if (isSuperAdmin) {
        totalInventoryValue = data.inventory.reduce((acc, it) => acc + (it.costPrice * it.quantityAvailable), 0);
        totalItemsInWarehouse = data.inventory.reduce((acc, it) => acc + it.quantityAvailable, 0);
        totalItemsInStores = stockProvided.reduce((acc, it) => acc + it.quantityRemaining, 0);
    } else if (isStoreAdmin) {
        // Only managed stores
        const managedStoreNames = user.managedStores || [];
        totalInventoryValue = data.inventory.filter(it => it.owner === user.username).reduce((acc, it) => acc + (it.costPrice * it.quantityAvailable), 0);
        totalItemsInWarehouse = data.inventory.filter(it => it.owner === user.username).reduce((acc, it) => acc + it.quantityAvailable, 0);
        totalItemsInStores = stockProvided.filter(it => managedStoreNames.includes(it.storeName)).reduce((acc, it) => acc + it.quantityRemaining, 0);
    } else {
        // Store user: only their own
        totalInventoryValue = data.inventory.filter(it => it.owner === user.username).reduce((acc, it) => acc + (it.costPrice * it.quantityAvailable), 0);
        totalItemsInWarehouse = data.inventory.filter(it => it.owner === user.username).reduce((acc, it) => acc + it.quantityAvailable, 0);
        totalItemsInStores = stockProvided.filter(it => it.storeName === user.storeName).reduce((acc, it) => acc + it.quantityRemaining, 0);
    }

    return (
        <Layout user={user} onLogout={() => {
            setUser(null);
            localStorage.removeItem('user');
        }}>
            <div className="inventory-page">
                <header className="page-header" style={{ marginBottom: 32 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: 4 }}>
                                {isSuperAdmin ? 'Global Inventory' : isStoreAdmin ? 'Managed Shop Inventory' : 'Shop Inventory'}
                            </h1>
                            <p className="text-muted">
                                {isSuperAdmin ? 'Manage warehouse stock and shop distributions' : isStoreAdmin ? 'View and manage inventory for your assigned shops' : 'View products supplied to your shop by the owner'}
                            </p>
                        </div>
                        {isSuperAdmin && (
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ padding: '8px 16px', textAlign: 'right', background: '#fff', borderRadius: '4px', border: '1px solid #d9d9d9' }}>
                                    <div style={{ fontSize: '12px', color: '#8c8c8c', textTransform: 'uppercase', fontWeight: 600 }}>Total Inventory Value</div>
                                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#1890ff' }}>{Rs(totalInventoryValue)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                <section className="cards-grid" style={{ marginBottom: 32 }}>
                    {isAdmin ? (
                        <>
                            <div className="summary-card blue">
                                <div className="icon">🏢</div>
                                <div className="label">Total Warehouse Goods</div>
                                <div className="value">{totalItemsInWarehouse}</div>
                            </div>
                            <div className="summary-card purple">
                                <div className="icon">🏪</div>
                                <div className="label">Total Items at Shops</div>
                                <div className="value">{totalItemsInStores}</div>
                            </div>
                            <div className="summary-card red">
                                <div className="icon">🚨</div>
                                <div className="label">Need to Restock</div>
                                <div className="value">{data.inventory.filter(i => i.quantityAvailable <= (i.lowStockWarning || 5)).length} Items</div>
                            </div>
                        </>
                    ) : (
                        <div className="summary-card blue">
                            <div className="icon">📦</div>
                            <div className="label">Current Shop Stock</div>
                            <div className="value">
                                {stockProvided.filter(s => s.storeName === user.storeName).reduce((acc, it) => acc + it.quantityRemaining, 0)} Items
                            </div>
                        </div>
                    )}
                    <div className="summary-card green">
                        <div className="icon">👗</div>
                        <div className="label">Available Products</div>
                        <div className="value">
                            {isAdmin ? data.inventory.length : stockProvided.filter(s => s.storeName === user.storeName).length} Types
                        </div>
                    </div>
                </section>

                {isAdmin && stockProvided.length === 0 && !isSuperAdmin && (
                    <div style={{ padding: 40, textAlign: 'center', background: 'var(--surface-2)', borderRadius: 12, marginTop: 24 }}>
                        <p className="text-muted">No goods have been supplied to your managed stores yet.</p>
                    </div>
                )}

                {(isSuperAdmin || isStoreAdmin) && (
                    <div className="grid-2-dynamic" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24, marginBottom: 32 }}>
                        {/* Only superadmin (yahya) can add/distribute warehouse stock */}
                        <SectionCard title={isSuperAdmin ? "Add New Stock to Warehouse" : "Add New Stock to My Inventory"} icon="📥">
                            {/* ... (Admin only form remains same) ... */}
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const fd = new FormData(e.target);
                                handleAddPurchase({
                                    productName: fd.get("productName"),
                                    category: fd.get("category"),
                                    brand: fd.get("brand"),
                                    size: fd.get("size"),
                                    color: fd.get("color"),
                                    otherVariants: fd.get("otherVariants"),
                                    batchNumber: fd.get("batchNumber"),
                                    costPrice: parseFloat(fd.get("costPrice")),
                                    sellingPrice: 0,
                                    quantity: parseInt(fd.get("quantity")),
                                    lowStockWarning: parseInt(fd.get("lowStockWarning") || 5),
                                    owner: user.username // Track who added this item
                                });
                                e.target.reset();
                            }}>
                                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div className="input-group">
                                        <label>Item Name</label>
                                        <input name="productName" required placeholder="Shirt A" />
                                    </div>
                                    <div className="input-group">
                                        <label>Brand</label>
                                        <input name="brand" placeholder="e.g. Nike, Zara" />
                                    </div>
                                    <div className="input-group">
                                        <label>Style/Type</label>
                                        <input name="category" placeholder="Apparel" />
                                    </div>
                                    <div className="input-group">
                                        <label>Batch/Lot #</label>
                                        <input name="batchNumber" required placeholder="B1" />
                                    </div>
                                    <div className="input-group">
                                        <label>Size</label>
                                        <input name="size" placeholder="S, M, L, XL, 32, 34" />
                                    </div>
                                    <div className="input-group">
                                        <label>Color</label>
                                        <input name="color" placeholder="Red, Blue, Black" />
                                    </div>
                                    <div className="input-group">
                                        <label>How Many?</label>
                                        <input name="quantity" type="number" required />
                                    </div>
                                    <div className="input-group">
                                        <label>Buying Price (Cost)</label>
                                        <input name="costPrice" type="number" required />
                                    </div>
                                    <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                        <label>Other Variants (JSON/Text)</label>
                                        <input name="otherVariants" placeholder="e.g. Material:Cotton, Season:Winter" />
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 20, height: 44 }}>Save to Warehouse</button>
                            </form>
                        </SectionCard>

                        <SectionCard title="Distribute to Shop Partners" icon="📤">
                            <form onSubmit={handleAssignItem}>
                                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div className="input-group">
                                        <label>Pick a Shop</label>
                                        <select
                                            value={distribute.storeName}
                                            onChange={e => setDistribute({ ...distribute, storeName: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Partner</option>
                                            {isSuperAdmin
                                                ? Object.keys(data.stores).map(s => <option key={s} value={s}>{s}</option>)
                                                : (user.managedStores || []).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label>Pick an Item</label>
                                        <select
                                            value={distribute.productName}
                                            onChange={e => {
                                                const item = data.inventory.find(i => i.productName === e.target.value);
                                                setDistribute({
                                                    ...distribute,
                                                    productName: e.target.value,
                                                    ownerSupplyPrice: item ? item.costPrice : 0
                                                });
                                            }}
                                            required
                                        >
                                            <option value="">Select Goods</option>
                                            {data.inventory.map(i => (
                                                <option key={i.productName + i.batchNumber} value={i.productName}>
                                                    {i.productName} ({i.quantityAvailable} left)
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                        <label>Amount to Send</label>
                                        <input
                                            type="number"
                                            value={distribute.quantity}
                                            onChange={e => setDistribute({ ...distribute, quantity: e.target.value })}
                                            required
                                            min="1"
                                        />
                                    </div>
                                    <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                        <label>Shop Commission % (Optional)</label>
                                        <input
                                            type="number"
                                            value={distribute.commissionPercent}
                                            onChange={e => setDistribute({ ...distribute, commissionPercent: e.target.value })}
                                            placeholder="Default applies if empty"
                                        />
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-success btn-full" style={{ marginTop: 20, height: 44 }}>Send to Shop</button>
                            </form>
                        </SectionCard>
                    </div>
                )}

                <SectionCard title={isAdmin ? "Goods at Shop Partners" : "Supplied Stock from Owner"} icon="🏪">
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    {isAdmin && <th>Shop Name</th>}
                                    <th>Item Name</th>
                                    <th>Owner Supply Price</th>
                                    <th>Total Sent</th>
                                    <th>In Shop Stock</th>
                                    {isAdmin && <th>Shop Cut %</th>}
                                    <th style={{ textAlign: 'right' }}>Items Sold</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stockProvided.filter(s => isAdmin || s.storeName === user.storeName).length === 0 ? (
                                    <tr><td colSpan={isAdmin ? 7 : 5} style={{ textAlign: 'center', padding: 40 }} className="text-muted">No stock available currently.</td></tr>
                                ) : (
                                    stockProvided.filter(s => isAdmin || s.storeName === user.storeName).map((item, idx) => (
                                        <tr key={idx}>
                                            {isAdmin && <td className="font-bold" style={{ color: 'var(--pri-900)' }}>{item.storeName}</td>}
                                            <td className="font-bold">{item.productName}</td>
                                            <td className="text-muted font-mono" style={{ fontWeight: 600 }}>
                                                {item.ownerSupplyPrice ? `Rs ${Number(item.ownerSupplyPrice).toLocaleString()}` : '-'}
                                            </td>
                                            <td><Badge type="gray">{item.quantityAssigned}</Badge></td>
                                            <td className="font-bold" style={{ fontSize: '1rem', color: item.quantityRemaining > 0 ? 'var(--text-main)' : 'var(--danger)' }}>
                                                {item.quantityRemaining}
                                            </td>
                                            {isAdmin && <td><Badge type="purple">{item.commissionPercent}%</Badge></td>}
                                            <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                                <Badge type={item.quantityAssigned - item.quantityRemaining > 0 ? 'blue' : 'gray'}>
                                                    {item.quantityAssigned - item.quantityRemaining}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>

                {isSuperAdmin && (
                    <SectionCard title="Warehouse Goods (Stock at Home)" icon="🏢">
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Style</th>
                                        <th>Batch</th>
                                        <th>Buy Price</th>
                                        <th>Est. Sale</th>
                                        <th>On Hand</th>
                                        <th>Status</th>
                                        <th>Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.inventory.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="font-bold">
                                                <div>{item.productName}</div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400, marginTop: 4 }}>
                                                    {item.brand && `[${item.brand}] `}
                                                    {item.size && `Size: ${item.size} `}
                                                    {item.color && `Color: ${item.color}`}
                                                </div>
                                            </td>
                                            <td><Badge type="gray">{item.category}</Badge></td>
                                            <td className="text-muted">{item.batchNumber}</td>
                                            <td>{Rs(item.costPrice)}</td>
                                            <td>{Rs(item.sellingPrice)}</td>
                                            <td className="font-bold" style={{ fontSize: '1.1rem' }}>{item.quantityAvailable}</td>
                                            <td>
                                                {item.quantityAvailable <= (item.lowStockWarning || 5) ?
                                                    <Badge type="red">🚨 Low Stock</Badge> :
                                                    <Badge type="green">✓ Good</Badge>
                                                }
                                            </td>
                                            <td>
                                                <QuantityEditor
                                                    current={item.quantityAvailable}
                                                    onSave={(newVal) => handleUpdateItem(item.productName, item.batchNumber, { quantityAvailable: newVal })}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                )}
            </div>

            <style jsx>{`
                .inventory-page {
                    animation: fadeIn 0.4s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .cards-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                }

                .summary-card {
                    background: var(--bg-card);
                    border-radius: 12px;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    box-shadow: var(--shadow-sm);
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }

                .summary-card:hover {
                    transform: translateY(-3px);
                    box-shadow: var(--shadow-md);
                }

                .summary-card .icon {
                    font-size: 2.2rem;
                    margin-bottom: 10px;
                    line-height: 1;
                }

                .summary-card .label {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 4px;
                }

                .summary-card .value {
                    font-size: 1.8rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .summary-card.blue .value { color: var(--blue-600); }
                .summary-card.purple .value { color: var(--purple-600); }
                .summary-card.red .value { color: var(--red-600); }
                .summary-card.green .value { color: var(--green-600); }

                .glass-panel {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.18);
                    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
                }
            `}</style>
        </Layout>
    );
}
