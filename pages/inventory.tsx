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
  User 
} from "../types";
import { AddInventoryModal, AllotToStoreModal } from "../components/Modals";

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
    }>({
        inventory: [],
        storeInventory: {},
        stores: {},
        purchases: [],
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
        if (user) refresh();
    }, [user, refresh]);

    if (!user) return <Login onLogin={onLogin} />;

    if (loading) return <div className="loading">Loading...</div>;

    const isAdmin = user.role === "admin";
    const isSuperAdmin = isAdmin && user.scope === 'all';
    // Bilal: admin with managedStores, but not superadmin
    const isStoreAdmin = isAdmin && user.managedStores && user.managedStores.length > 0 && !isSuperAdmin;


    const handleSaveInventory = async (item: any) => {
        // Map common fields for compatibility with existing system
        const purchase = {
            productName: item.name,
            category: item.type,
            brand: item.brand,
            costPrice: item.pricePerPiece,
            quantity: item.quantity,
            batchNumber: item.itemId, // Use Item ID as batch number for now
            size: item.sizes,
            color: item.colors,
            otherVariants: {
                allotedStores: item.allotedStores,
                picture: item.picture
            },
            owner: user.username
        };

        await fetch("/api/purchases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(purchase),
        });
        refresh();
    };

    const handleUpdateItem = async (productName: string, batchNumber: string, fields: any) => {
        await fetch("/api/purchases", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productName, batchNumber, ...fields }),
        });
        refresh();
    };

    const handleAdjustQuantity = async (productName: string, batchNumber: string, quantityDelta: number) => {
        await fetch("/api/purchases", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productName, batchNumber, quantityDelta }),
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
                                <div className="kpi-icon">🏢</div>
                                <div className="kpi-label">Warehouse Goods</div>
                                <div className="kpi-value">{totalItemsInWarehouse}</div>
                                <div className="kpi-trend">Total Units</div>
                            </div>
                            <div className="kpi-card purple">
                                <div className="kpi-icon">🏪</div>
                                <div className="kpi-label">Items at Shops</div>
                                <div className="kpi-value">{totalItemsInStores}</div>
                                <div className="kpi-trend">Active Distribution</div>
                            </div>
                            <div className="kpi-card red">
                                <div className="kpi-icon">🚨</div>
                                <div className="kpi-label">Alerts</div>
                                <div className="kpi-value">{data.inventory.filter(i => i.quantityAvailable <= (i.lowStockWarning || 5)).length}</div>
                                <div className="kpi-trend">Needs Restock</div>
                            </div>
                        </>
                    ) : (
                        <div className="kpi-card blue">
                            <div className="kpi-icon">📦</div>
                            <div className="kpi-label">Shop Stock</div>
                            <div className="kpi-value">
                                {stockProvided.filter(s => s.storeName === user.storeName).reduce((acc, it) => acc + it.quantityRemaining, 0)}
                            </div>
                            <div className="kpi-trend">Total Units Received</div>
                        </div>
                    )}
                    <div className="kpi-card green">
                        <div className="kpi-icon">👗</div>
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
                        icon="🏢"
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
                                        const allotedStores = (item as any)?.otherVariants?.allotedStores as string[] | undefined;
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
                    icon="🏪"
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
                        onSave={async ({ storeName, productName, quantity, ownerSupplyPrice, commissionPercent }) => {
                            // Enforce max (total - alloted) === on-hand
                            const selected = data.inventory.find(i => i.productName === productName);
                            const alloted = allotedQtyByProduct[productName] || 0;
                            const total = Number(selected?.quantityAvailable) || 0;
                            const maxQty = Math.max(0, total - alloted);
                            if (quantity > maxQty) return alert(`Quantity cannot be more than ${maxQty}`);

                            await fetch('/api/storeInventory', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    storeName,
                                    productName,
                                    ownerSupplyPrice,
                                    quantity,
                                    commissionPercent,
                                    owner: user.username,
                                })
                            });
                            refresh();
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
