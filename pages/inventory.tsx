import { useState, useEffect, useCallback } from "react";
import SectionCard from "../components/SectionCard";
import Badge from "../components/Badge";
import Login from "../components/Login";
import { 
  PageProps, 
  InventoryItem, 
  StoreInventoryItem, 
  Store, 
  Purchase,
    Product,
  User 
} from "../types";
import { AddInventoryModal, AllotToStoreModal } from "../components/Modals";

// ── SVG Icon Components (mono-color, inherits currentColor) ──
const IC = {
  warehouse: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>,
  store: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>,
  alert: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
  stock: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
  dress: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12l-4 9h4l-8 9 2-6H6l4-9H6Z"/></svg>,
};

const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();

// Premium Quantity Editor for Warehouse
interface QuantityEditorProps {
  current: number;
    onSave: (quantityDelta: number) => void;
}

function QuantityEditor({ current, onSave }: QuantityEditorProps) {
    const [editing, setEditing] = useState<boolean>(false);
    const [val, setVal] = useState<number>(0);

    if (!editing) return (
        <button className="btn btn-sm btn-glass" onClick={() => { setVal(0); setEditing(true); }} style={{ fontWeight: 700 }}>
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVal(parseInt(e.target.value) || 0)}
            />
            <button
                className="btn btn-primary"
                style={{ width: 28, height: 28, padding: 0, background: 'var(--success)', borderColor: 'var(--success)' }}
                onClick={() => { if (val !== 0) onSave(val); setEditing(false); }}
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

export default function InventoryPage({ user, onLogin }: PageProps) {
    const [data, setData] = useState<{
        inventory: InventoryItem[];
        storeInventory: Record<string, Record<string, StoreInventoryItem>>;
        stores: Record<string, Store>;
        purchases: Purchase[];
        products: Product[];
    }>({
        inventory: [],
        storeInventory: {},
        stores: {},
        purchases: [],
        products: [],
    });
    // Track inventory ownership: each admin can only see/manage their own
    // Assume each inventory item has an 'owner' field (username)
    const [loading, setLoading] = useState<boolean>(true);
    const [editModal, setEditModal] = useState<{ item: any; field: string } | null>(null); // { item, field } or null
    const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
    const [showAllotModal, setShowAllotModal] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch stores from API
            const storesRes = await fetch('/api/store');
            const storesData = await storesRes.json();
            
            // Fetch products from API
            const productsRes = await fetch('/api/products');
            const productsData = await productsRes.json();
            
            // Fetch inventory from API
            const inventoryRes = await fetch('/api/inventory');
            const inventoryData = await inventoryRes.json();

            // Fetch store inventory from API
            const storeInvRes = await fetch('/api/storeInventory');
            const storeInvData = await storeInvRes.json();
            
            setData({
                inventory: inventoryData.inventory || [],
                purchases: [],
                storeInventory: storeInvData.storeInventory || {},
                stores: storesData.stores || {},
                products: productsData.products || [],
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user) refresh();
    }, [user, refresh]);

    if (!user) return <Login onLogin={onLogin} />;

    if (loading) return <div className="loading">Loading...</div>;

    const isAdmin = user.role === "admin";
    const isSuperAdmin = isAdmin && user.scope === 'all';
    // Bilal: admin with managedStores, but not superadmin
    const isStoreAdmin = isAdmin && user.managedStores && user.managedStores.length > 0 && !isSuperAdmin;


    const handleSaveInventory = async (payload: any) => {
        try {
            const response = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to save inventory');
            }

            alert('✅ Inventory item added successfully!');
            refresh();
        } catch (e: any) {
            alert(e?.message || 'Failed to save inventory')
        }
    };

    const handleUpdateItem = async (productName: string, batchNumber: string, fields: any) => {
        // No-op: database removed
        refresh();
    };

    const handleAdjustQuantity = async (productName: string, batchNumber: string, quantityDelta: number) => {
        // No-op: database removed
        refresh();
    };

    // Flatten store inventory for the table
    const stockProvided = [];
    Object.entries(data.storeInventory).forEach(([storeName, items]) => {
        const canSee = isSuperAdmin || (isStoreAdmin && user.managedStores.includes(storeName)) || (!isAdmin && user.storeName === storeName);
        if (!canSee) return;
        Object.values(items).forEach((item) => {
            // Admins only see items they own; store users see all items assigned to their store
            if (!isAdmin || isSuperAdmin || item.owner === user.username) {
                stockProvided.push({ ...item, storeName });
            }
        });
    });

    const allotedQtyByProduct: Record<string, number> = {};
    Object.values(data.storeInventory || {}).forEach((items: any) => {
        Object.values(items || {}).forEach((it: any) => {
            const key = it?.productName;
            if (!key) return;
            allotedQtyByProduct[key] = (allotedQtyByProduct[key] || 0) + (Number(it.quantityAssigned) || 0);
        });
    });

    const storeCommissionByName: Record<string, number> = {};
    Object.entries(data.stores || {}).forEach(([name, s]) => {
        storeCommissionByName[name] = Number((s as any)?.commission) || 0;
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
        <>
            <div className="inventory-page">
                <header className="page-header">
                    <div className="header-content">
                        <div className="header-titles">
                            <h1 className="main-title">
                                {isSuperAdmin ? 'Global Inventory' : isStoreAdmin ? 'Managed Shop Inventory' : 'Shop Inventory'}
                            </h1>
                            <p className="subtitle">
                                {isSuperAdmin ? 'Manage warehouse stock and shop distributions' : isStoreAdmin ? 'View and manage inventory for your assigned shops' : 'View products supplied to your shop by the owner'}
                            </p>
                        </div>
                        {isSuperAdmin && (
                            <div className="header-actions">
                                <div className="kpi-mini-card">
                                    <span className="kpi-mini-label">Total Inventory Value</span>
                                    <span className="kpi-mini-value">{Rs(totalInventoryValue)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                <section className="kpi-grid">
                    {isAdmin ? (
                        <>
                            <div className="kpi-card blue">
                                <div className="kpi-icon">{IC.warehouse}</div>
                                <div className="kpi-label">Warehouse Goods</div>
                                <div className="kpi-value">{totalItemsInWarehouse}</div>
                                <div className="kpi-trend">Total Units</div>
                            </div>
                            <div className="kpi-card purple">
                                <div className="kpi-icon">{IC.store}</div>
                                <div className="kpi-label">Items at Shops</div>
                                <div className="kpi-value">{totalItemsInStores}</div>
                                <div className="kpi-trend">Active Distribution</div>
                            </div>
                            <div className="kpi-card red">
                                <div className="kpi-icon">{IC.alert}</div>
                                <div className="kpi-label">Alerts</div>
                                <div className="kpi-value">{data.inventory.filter(i => i.quantityAvailable <= (i.lowStockWarning || 5)).length}</div>
                                <div className="kpi-trend">Needs Restock</div>
                            </div>
                        </>
                    ) : (
                        <div className="kpi-card blue">
                            <div className="kpi-icon">{IC.stock}</div>
                            <div className="kpi-label">Shop Stock</div>
                            <div className="kpi-value">
                                {stockProvided.filter(s => s.storeName === user.storeName).reduce((acc, it) => acc + it.quantityRemaining, 0)}
                            </div>
                            <div className="kpi-trend">Total Units Received</div>
                        </div>
                    )}
                    <div className="kpi-card green">
                        <div className="kpi-icon">{IC.dress}</div>
                        <div className="kpi-label">Available Types</div>
                        <div className="kpi-value">
                            {isAdmin ? data.inventory.length : stockProvided.filter(s => s.storeName === user.storeName).length}
                        </div>
                        <div className="kpi-trend">Product Catalog</div>
                    </div>
                </section>

                {isAdmin && stockProvided.length === 0 && !isSuperAdmin && (
                    <div style={{ padding: 40, textAlign: 'center', background: 'var(--surface-2)', borderRadius: 12, marginTop: 24 }}>
                        <p className="text-muted">No goods have been supplied to your managed stores yet.</p>
                    </div>
                )}


                {isSuperAdmin && (
                    <SectionCard 
                        title="Warehouse Inventory" 
                        icon={IC.warehouse}
                        action={<button className="btn btn-primary" onClick={() => setShowAddInventoryModal(true)}>+ Add Inventory</button>}
                    >
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Type</th>
                                        <th>Item ID</th>
                                        <th>Cost/pc</th>
                                        <th>Qty</th>
                                        <th>Aloted Qty</th>
                                        <th>Alloted Stores</th>
                                        <th>Status</th>
                                        <th>Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.inventory.map((item, idx) => {
                                        const picture = (item as any)?.otherVariants?.picture as string | undefined;
                                        const pictureSrc = (typeof picture === 'string' && picture.trim().length > 0) ? picture : '/images/size_L.webp';
                                        const allotedStores = Object.entries(data.storeInventory || {})
                                            .filter(([, items]) => Boolean((items as any)?.[item.productName]))
                                            .map(([storeName]) => storeName);
                                        const allotedQty = allotedQtyByProduct[item.productName] || 0;
                                        const availableQty = Math.max(0, (Number(item.quantityAvailable) || 0) - allotedQty);

                                        return (
                                            <tr key={`${item.productName}-${item.batchNumber}-${idx}`}>
                                                <td className="font-bold">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div
                                                            style={{
                                                                width: 44,
                                                                height: 44,
                                                                borderRadius: 10,
                                                                overflow: 'hidden',
                                                                border: '1px solid var(--border)',
                                                                background: 'var(--surface-2)',
                                                                flex: '0 0 auto',
                                                            }}
                                                        >
                                                            {pictureSrc ? (
                                                                <img
                                                                    src={pictureSrc}
                                                                    alt={item.productName}
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                                    loading="lazy"
                                                                    onError={(e) => {
                                                                        const img = e.currentTarget;
                                                                        if (img.src.includes('/images/size_L.webp')) return;
                                                                        img.src = '/images/size_L.webp';
                                                                    }}
                                                                />
                                                            ) : (
                                                                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontWeight: 900 }}>
                                                                    {String(item.productName || 'Item').slice(0, 1).toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div>
                                                            <div>{item.productName}</div>
                                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                {item.brand && <Badge type="gray">{item.brand}</Badge>}
                                                                {item.size && (Array.isArray(item.size) ? item.size.map((s) => <Badge key={s} type="purple">{s}</Badge>) : <Badge type="purple">{item.size}</Badge>)}
                                                                {item.color && (Array.isArray(item.color) ? item.color.map((c) => <Badge key={c} type="blue">{c}</Badge>) : <Badge type="blue">{item.color}</Badge>)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><Badge type="gray">{item.category}</Badge></td>
                                                <td className="text-muted font-mono" style={{ fontWeight: 700 }}>{item.batchNumber}</td>
                                                <td>{Rs(item.costPrice)}</td>
                                                <td className="font-bold" style={{ fontSize: '1.05rem' }}>{item.quantityAvailable}</td>
                                                <td className="font-bold">{allotedQty}</td>
                                                <td>
                                                    {Array.isArray(allotedStores) && allotedStores.length > 0 ? (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                            {allotedStores.map((s) => (
                                                                <Badge key={s} type="blue">{s}</Badge>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted">-</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {availableQty <= 0 ? (
                                                        <Badge type="red">✕ Out</Badge>
                                                    ) : availableQty <= (item.lowStockWarning || 5) ? (
                                                        <Badge type="orange">⚠ Low</Badge>
                                                    ) : (
                                                        <Badge type="green">✓ Good</Badge>
                                                    )}
                                                </td>
                                                <td>
                                                    <QuantityEditor
                                                        current={item.quantityAvailable}
                                                        onSave={(delta) => handleAdjustQuantity(item.productName, item.batchNumber, delta)}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                )}

                <SectionCard
                    title={isAdmin ? "Partner Store's Inventory" : "Supplied Stock from Owner"}
                    icon={IC.store}
                    action={isAdmin ? (
                        <button className="btn btn-primary" onClick={() => setShowAllotModal(true)}>+ Alot to Stores</button>
                    ) : undefined}
                >
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

                {showAddInventoryModal && (
                    <AddInventoryModal 
                        stores={Object.keys(data.stores)} 
                        products={data.products}
                        onSave={handleSaveInventory} 
                        onClose={() => setShowAddInventoryModal(false)} 
                    />
                )}

                {showAllotModal && (
                    <AllotToStoreModal
                        stores={Object.keys(data.stores)}
                        inventory={data.inventory}
                        allotedQtyByProduct={allotedQtyByProduct}
                        storeCommissionByName={storeCommissionByName}
                        onSave={async ({ storeName, batchNumber, quantity, ownerSupplyPrice, commissionPercent }) => {
                            try {
                                const resp = await fetch('/api/storeInventory', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        storeName,
                                        batchNumber,
                                        quantity,
                                        ownerSupplyPrice,
                                        commissionPercent,
                                    })
                                })
                                const json = await resp.json()
                                if (!resp.ok) throw new Error(json?.error || 'Failed to save allotment')
                                alert('✅ Allotment saved')
                                refresh()
                            } catch (e: any) {
                                alert(e?.message || 'Failed to save allotment')
                            }
                        }}
                        onClose={() => setShowAllotModal(false)}
                    />
                )}
            </div>

            <style jsx>{`
                .inventory-page {
                    animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes slideUp { 
                    from { opacity: 0; transform: translateY(20px); } 
                    to { opacity: 1; transform: translateY(0); } 
                }
                .form-grid-2 {
                    background: var(--surface-2);
                    padding: 24px;
                    border-radius: var(--radius);
                    border: 1px solid var(--border);
                }
            `}</style>
        </>
    );
}
