import { useState, useEffect, useCallback } from "react";
import { usePopup } from '../components/Popup';
import SectionCard from "../components/SectionCard";
import Badge from "../components/Badge";
import Login from "../components/Login";
import SearchBar from "../components/SearchBar";
import DetailModal from "../components/DetailModal";
import { formatItemCode } from "../lib/catalog";
import { 
  PageProps, 
  InventoryItem,
Purchase,
    Product,
} from "../types";
import { AddInventoryModal, EditInventoryModal } from "../components/Modals";
import ContextHelp from "../components/ContextHelp";
import PageSkeleton from "../components/Skeletons";

// â”€â”€ SVG Icon Components (mono-color, inherits currentColor) â”€â”€
const IC = {
  warehouse: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>,
  store: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>,
  alert: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
  stock: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
  dress: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12l-4 9h4l-8 9 2-6H6l4-9H6Z"/></svg>,
    trash: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
};

const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();
// Search helpers — make the search bars match against every displayed field
// (including the formatted Item ID like "ITEM-1A2B3C4D").
const matchesStoreSearch = (s: any, rawQ: string) => {
    const q = String(rawQ || '').toLowerCase();
    if (!q) return true;
    const sold = Math.max(0, (Number(s.quantityAssigned) || 0) - (Number(s.quantityRemaining) || 0));
    const haystack = [
        s.storeName,                                  // Shop name
        s.productName,                                // Item name
        formatItemCode(s.batchNumber || s.inventoryId), // Item ID (ITEM-XXXXXXXX)
        s.ownerSupplyPrice,                           // Owner supply price
        s.quantityAssigned,                           // Total sent
        s.quantityRemaining,                          // In shop stock
        sold,                                         // Items sold
        s.commissionPercent,                          // Shop cut %
        s.owner,                                      // Alloted by
        s.category,
        s.brand,
    ]
        .filter(v => v !== undefined && v !== null && v !== '')
        .join(' ')
        .toLowerCase();
    return haystack.includes(q);
};

const matchesWarehouseSearch = (item: any, rawQ: string) => {
    const q = String(rawQ || '').toLowerCase();
    if (!q) return true;
    const haystack = [
        item.productName,
        item.brand,
        item.category,
        item.batchNumber,
        formatItemCode(item.batchNumber || item.id),  // Item ID (ITEM-XXXXXXXX)
        item.costPrice,
        item.quantityAvailable,
    ]
        .filter(v => v !== undefined && v !== null && v !== '')
        .join(' ')
        .toLowerCase();
    return haystack.includes(q);
};


export default function InventoryPage({ user, onLogin }: PageProps) {
    const { toast, showProcessing, hideProcessing } = usePopup();
    const [data, setData] = useState<{
        inventory: InventoryItem[];
                purchases: Purchase[];
        products: Product[];
    }>({
        inventory: [],
                        purchases: [],
        products: [],
    });
    // Track inventory ownership: each admin can only see/manage their own
    // Assume each inventory item has an 'owner' field (username)
    const [loading, setLoading] = useState<boolean>(true);
    const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
    const [showEditInventoryModal, setShowEditInventoryModal] = useState(false);
    const [showDeleteInventoryModal, setShowDeleteInventoryModal] = useState(false);
    const [editingInventoryItem, setEditingInventoryItem] = useState<any | null>(null);
    const [deletingInventoryItem, setDeletingInventoryItem] = useState<any | null>(null);
    const [showAlerts, setShowAlerts] = useState(false);
    const [inventorySearch, setInventorySearch] = useState('');
    const [detailInventoryItem, setDetailInventoryItem] = useState<any | null>(null);
    
    // Persisted across modal open/close — tracks product types hidden/replaced by the user
    const [hiddenProductTypes, setHiddenProductTypes] = useState<string[]>([]);
    const handleHideProductType = (typeName: string) => {
        setHiddenProductTypes(prev => {
            const norm = typeName.trim().toLowerCase();
            if (prev.some(t => t.trim().toLowerCase() === norm)) return prev;
            return [...prev, typeName];
        });
    };

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
             const productsRes = await fetch('/api/products');
            const productsData = await productsRes.json();
            
            // Fetch inventory from API
            const inventoryRes = await fetch('/api/inventory');
            const inventoryData = await inventoryRes.json();
            
            setData({
                inventory: inventoryData.inventory || [],
                purchases: [],
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

    if (loading) return <PageSkeleton label="Loading inventory" />;

    const isAdmin = user.role === "admin";
    const isSuperAdmin = isAdmin && user.scope === 'all';
    // Bilal: admin with managedStores, but not superadmin
    const isStoreAdmin = isAdmin && user.managedStores && user.managedStores.length > 0 && !isSuperAdmin;
    const visibleStoreNames = Array.from(new Set([...(user.managedStores || []), ...(user.storeName ? [user.storeName] : [])].filter(Boolean)));
    const storeNameMatches = (storeName: string) => visibleStoreNames.some((name) => name.trim().toLowerCase() === storeName.trim().toLowerCase());


    const handleSaveInventory = async (payload: any) => {
        showProcessing('Saving inventory...');
        try {
            const response = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...payload,
                    forceNewBatch: payload.forceNewBatch ?? false,
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to save inventory');
            }

            toast.success('✅ Inventory item added successfully!');
            refresh();
        } catch (e: any) {
            toast.error(e?.message || 'Failed to save inventory')
        } finally {
            hideProcessing();
        }
    };

    const handleUpdateInventory = async (item: InventoryItem, fields: any) => {
        if (!item?.id) return toast.error('Missing inventory id')
        showProcessing('Updating inventory...');
        try {
            const response = await fetch('/api/inventory', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id, productId: item.productId, fields })
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Failed to update inventory')

            toast.success('✅ Inventory updated')
            refresh()
        } catch (e: any) {
            toast.error(e?.message || 'Update failed')
        } finally {
            hideProcessing();
        }
    }

    const handleDeleteInventory = async (item: InventoryItem) => {
        if (!item?.id) return toast.error('Missing inventory id')
        setDeletingInventoryItem(item)
        setShowDeleteInventoryModal(true)
    }

    const confirmDeleteInventory = async () => {
        if (!deletingInventoryItem?.id) return toast.error('Missing inventory id')

        showProcessing('Deleting inventory item...');
        try {
            const response = await fetch('/api/inventory', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deletingInventoryItem.id })
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Failed to delete inventory item')

            toast.success('✅ Inventory item deleted')
            setShowDeleteInventoryModal(false)
            setDeletingInventoryItem(null)
            refresh()
        } catch (e: any) {
            toast.error(e?.message || 'Delete failed')
        } finally {
            hideProcessing();
        }
    }

    // Build alerts list
    const alerts: Array<{ type: 'out' | 'low'; product: string; detail: string; rowId: string; section: 'warehouse' }> = [];
    data.inventory.forEach(item => {
        const availableQty = Math.max(0, (Number(item.quantityAvailable) || 0));
        if (availableQty <= 0) {
            alerts.push({ type: 'out', product: item.productName, detail: `Batch ${item.batchNumber} — 0 units left in warehouse`, rowId: `inv-row-${item.batchNumber}`, section: 'warehouse' });
        } else if (availableQty <= (item.lowStockWarning || 5)) {
            alerts.push({ type: 'low', product: item.productName, detail: `Batch ${item.batchNumber} — only ${availableQty} unit${availableQty !== 1 ? 's' : ''} remaining`, rowId: `inv-row-${item.batchNumber}`, section: 'warehouse' });
        }
    });

    const scrollToAlert = (rowId: string) => {
        setShowAlerts(false);
        setTimeout(() => {
            const el = document.getElementById(rowId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.transition = 'background 0.5s ease';
                el.style.background = '#fef3c7';
                setTimeout(() => { el.style.background = ''; }, 2500);
            }
        }, 150);
    };

    // Summary calculations — inventory is one global physical pool for every role.
    const calcInventoryValue = (inventoryItems: typeof data.inventory) =>
        inventoryItems.reduce(
            (acc, it) => acc + (Number(it.costPrice) || 0) * Math.max(0, Number(it.quantityAvailable) || 0),
            0
        );

    const totalInventoryValue = calcInventoryValue(data.inventory);
    const totalItemsInWarehouse = data.inventory.reduce(
        (acc, it) => acc + Math.max(0, Number(it.quantityAvailable) || 0),
        0
    );
    const totalItemsInStores = 0;

    return (
        <>
            <div className="inventory-page">
                <header className="page-header">
                    <div className="header-content">
                        <div className="header-titles">
                            <h1 className="main-title">Global Inventory <ContextHelp id="inventory.page" /></h1>
                            <p className="subtitle">One shared physical inventory pool used by every store</p>
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
                                <div className="kpi-label">Global Stock</div>
                                <div className="kpi-value">{totalItemsInWarehouse}</div>
                                <div className="kpi-trend">Total Units</div>
                            </div>
                            <div className="kpi-card purple">
                                <div className="kpi-icon">{IC.store}</div>
                                <div className="kpi-label">Global Stock</div>
                                 <div className="kpi-value">{totalItemsInWarehouse}</div>
                                 <div className="kpi-trend">Available to Every Store</div>
                            </div>
                            <div className="kpi-card red" onClick={() => alerts.length > 0 && setShowAlerts(true)} style={{ cursor: alerts.length > 0 ? 'pointer' : 'default', position: 'relative' }}>
                                {alerts.length > 0 && (
                                    <span style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', boxShadow: '0 0 0 2px #fff' }} />
                                )}
                                <div className="kpi-icon">{IC.alert}</div>
                                <div className="kpi-label">Alerts</div>
                                <div className="kpi-value">{alerts.length}</div>
                                <div className="kpi-trend">{alerts.length > 0 ? 'Click to view' : 'All good'}</div>
                            </div>
                        </>
                    ) : (
                        <div className="kpi-card blue">
                            <div className="kpi-icon">{IC.stock}</div>
                            <div className="kpi-label">Global Stock</div>
                            <div className="kpi-value">
                                {data.inventory.reduce((acc, it) => acc + Math.max(0, Number(it.quantityAvailable) || 0), 0)}
                            </div>
                            <div className="kpi-trend">Available Across Stores</div>
                        </div>
                    )}
                    <div className="kpi-card green">
                        <div className="kpi-icon">{IC.dress}</div>
                        <div className="kpi-label">Available Types</div>
                        <div className="kpi-value">
                                    {data.inventory.length}
                        </div>
                        <div className="kpi-trend">Product Catalog</div>
                    </div>
                </section>
                <SectionCard
                     title="Global Inventory"
                     helpKey="inventory.allInventory"
                     icon={IC.stock}
                     action={isSuperAdmin ? <button className="btn btn-primary" onClick={() => setShowAddInventoryModal(true)}>+ Add Inventory</button> : undefined}
                 >
                    <div style={{ padding: "8px 0 16px", color: "var(--text-muted)", fontSize: 13 }}>
                        All stores use the same physical inventory pool. Store-specific quantities are tracked through sales and reports, not inventory ownership.
                    </div>
                    <SearchBar value={inventorySearch} onChange={setInventorySearch} placeholder="Search by name, brand, type, or item ID…" resultCount={data.inventory.filter(item => !inventorySearch || matchesWarehouseSearch(item, inventorySearch)).length} />
                    <div className="table-wrap">
                        <table className="desktop-table-view">
                            <thead><tr><th>Item Name</th><th>Type</th><th>Item ID</th>{isAdmin && <th>Cost/pc</th>}<th>Available</th><th>Status</th><th style={{textAlign:"center"}}>Actions</th></tr></thead>
                            <tbody>
                                {data.inventory.filter(item => !inventorySearch || matchesWarehouseSearch(item, inventorySearch)).map((item, idx) => {
                                    const availableQty = Math.max(0, Number(item.quantityAvailable) || 0);
                                    const picture = item.productImage || (item as any)?.otherVariants?.picture as string | undefined;
                                    const pictureSrc = (typeof picture === 'string' && picture.trim().length > 0) ? picture : '/images/size_L.webp';
                                    return <tr key={item.productName + "-" + item.batchNumber + "-" + idx}>
                                        <td className="font-bold">
                                            <div className="item-wrap">
                                                <div className="item-thumb">
                                                    <img
                                                        src={pictureSrc}
                                                        alt={item.productName}
                                                        className="item-thumb-img"
                                                        loading="lazy"
                                                        onError={(e) => {
                                                            const img = e.currentTarget;
                                                            if (img.src.includes('/images/size_L.webp')) return;
                                                            img.src = '/images/size_L.webp';
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <div>{item.productName}</div>
                                                    <div className="item-meta-tags">
                                                        {item.brand && <Badge type="gray">{item.brand}</Badge>}
                                                        {item.size && (Array.isArray(item.size) ? item.size.map((s) => <Badge key={s} type="purple">{s}</Badge>) : <Badge type="purple">{item.size}</Badge>)}
                                                        {item.color && (Array.isArray(item.color) ? item.color.map((c) => <Badge key={c} type="blue">{c}</Badge>) : <Badge type="blue">{item.color}</Badge>)}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="type-cell"><Badge type="gray"><span className="type-cell__text">{item.category}</span></Badge></td>
                                        <td className="text-muted font-mono" style={{fontWeight:700}}>{formatItemCode(item.batchNumber)}</td>
                                        {isAdmin && <td>{Rs(item.costPrice)}</td>}
                                        <td className="font-bold">{availableQty}</td>
                                        <td>{availableQty <= 0 ? <Badge type="red">Out</Badge> : availableQty <= (item.lowStockWarning || 5) ? <Badge type="orange">Low</Badge> : <Badge type="green">Good</Badge>}</td>
                                        <td style={{textAlign:"center"}}><div style={{display:"flex",justifyContent:"center",gap:8}}>
                                            <button type="button" className="btn btn-sm" onClick={() => setDetailInventoryItem(item)}>Detail</button>
                                            {isSuperAdmin && <button type="button" className="btn btn-sm btn-glass" onClick={() => { setEditingInventoryItem(item); setShowEditInventoryModal(true); }}>Edit</button>}
                                            {isSuperAdmin && <button type="button" className="btn btn-sm btn-glass" onClick={() => handleDeleteInventory(item)} style={{color:"var(--danger)"}}>{IC.trash}</button>}
                                        </div></td>
                                    </tr>
                                })}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
                 {showAddInventoryModal && (
                    <AddInventoryModal
                        stores={[]}
                        products={data.products}
                        inventory={data.inventory}
                        hiddenProductTypes={hiddenProductTypes}
                        onHideProductType={handleHideProductType}
                        onSave={async (payload: any) => {
                            await handleSaveInventory(payload);
                            setShowAddInventoryModal(false);
                        }}
                        onClose={() => setShowAddInventoryModal(false)}
                    />
                )}
                 {showEditInventoryModal && editingInventoryItem && (
                    <EditInventoryModal
                        item={editingInventoryItem}
                        minQuantity={0}
                        products={data.products}
                        onSave={async (payload: any) => {
                            await handleUpdateInventory(editingInventoryItem, payload)
                            setShowEditInventoryModal(false)
                            setEditingInventoryItem(null)
                        }}
                        onClose={() => { setShowEditInventoryModal(false); setEditingInventoryItem(null); }}
                    />
                )}

                {showDeleteInventoryModal && deletingInventoryItem && (
                    <div className="modal-overlay" onClick={() => { setShowDeleteInventoryModal(false); setDeletingInventoryItem(null); }}>
                        <div className="modal-box delete-modal" onClick={e => e.stopPropagation()}>
                            <div className="delete-modal__hero">
                                <div className="delete-modal__head">
                                    <div className="delete-modal__icon">
                                        {IC.trash}
                                    </div>
                                    <div className="delete-modal__copy">
                                        <div className="delete-modal__eyebrow">
                                            Destructive action
                                        </div>
                                        <h3 className="delete-modal__title">Delete inventory item?</h3>
                                        <div className="delete-modal__subtitle">
                                            You are about to remove <strong>{deletingInventoryItem.productName}</strong> from warehouse stock.
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="delete-modal__body">
                                <div className="delete-modal__summary">
                                    <div className="delete-modal__summary-top">
                                        <div>
                                            <div className="delete-modal__label">Item details</div>
                                            <div className="delete-modal__item-name">{deletingInventoryItem.productName}</div>
                                            <div className="delete-modal__batch">{deletingInventoryItem.batchNumber}</div>
                                        </div>
                                        <div className="delete-modal__count-wrap">
                                            <div className="delete-modal__label delete-modal__label--right">Available stock</div>
                                             <div className="delete-modal__count">{Math.max(0, Number(deletingInventoryItem.quantityAvailable) || 0)}</div>
                                        </div>
                                    </div>
                                    <div className="delete-modal__chips">
                                         <span className="badge badge-gray">Global inventory batch</span>
                                     </div>
                                 </div>

                                 <div className="delete-modal__warning">
                                     This permanently deletes this global inventory batch. Historical orders remain preserved.
                                 </div>
                            </div>
                            <div className="delete-modal__footer">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-glass delete-modal__cancel"
                                    onClick={() => { setShowDeleteInventoryModal(false); setDeletingInventoryItem(null); }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm delete-modal__confirm"
                                    onClick={confirmDeleteInventory}
                                >
                                    Delete Item
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* â”€â”€ Return to Warehouse Modal (Scenario B) â”€â”€ */}

             {/* ── Alerts Popup â”€â”€ */}
            {showAlerts && (
                <div className="modal-overlay" onClick={() => setShowAlerts(false)}>
                    <div className="modal-box" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ color: 'var(--danger)', display: 'inline-flex' }}>{IC.alert}</span>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Stock Alerts</h3>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{alerts.length} item{alerts.length !== 1 ? 's' : ''} need attention</div>
                                </div>
                            </div>
                            <button className="btn btn-sm" onClick={() => setShowAlerts(false)} style={{ border: 'none', fontSize: 18 }}>✕</button>
                        </div>
                        <div className="modal-body" style={{ padding: '8px 20px 20px' }}>
                            {alerts.map((alert, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => scrollToAlert(alert.rowId)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 12px', borderRadius: 8, marginBottom: 6,
                                        background: alert.type === 'out' ? '#fef2f2' : '#fffbeb',
                                        border: `1px solid ${alert.type === 'out' ? '#fecaca' : '#fde68a'}`,
                                        cursor: 'pointer', transition: 'opacity 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                                >
                                    <span style={{ fontSize: 18, flexShrink: 0 }}>
                                        {alert.type === 'out' ? '🚫' : '⚠️'}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-head)' }}>{alert.product}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{alert.detail}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                            background: alert.type === 'out' ? '#fee2e2' : '#fef3c7',
                                            color: alert.type === 'out' ? '#b91c1c' : '#92400e',
                                        }}>
                                            {alert.type === 'out' ? 'OUT OF STOCK' : 'LOW STOCK'}
                                        </span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .inventory-page {
                    animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes slideUp { 
                    from { opacity: 0; transform: translateY(20px); } 
                    to { opacity: 1; transform: translateY(0); } 
                }
                .item-wrap {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .item-thumb {
                    width: 44px;
                    height: 44px;
                    border-radius: 10px;
                    overflow: hidden;
                    border: 1px solid var(--border);
                    background: var(--surface-2);
                    flex: 0 0 auto;
                }
                .item-thumb-img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                }
                .item-meta-tags {
                    font-size: 10px;
                    color: var(--text-muted);
                    font-weight: 400;
                    margin-top: 4px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }
                .form-grid-2 {
                    background: var(--surface-2);
                    padding: 24px;
                    border-radius: var(--radius);
                    border: 1px solid var(--border);
                }
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
                    color: var(--text-head);
                }
                .delete-modal__subtitle {
                    margin-top: 10px;
                    color: var(--text-muted);
                    font-size: 13.5px;
                    line-height: 1.55;
                }
                .delete-modal__subtitle strong {
                    color: var(--text-head);
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
                .delete-modal__label--right {
                    text-align: right;
                }
                .delete-modal__item-name {
                    font-size: 15px;
                    font-weight: 900;
                    color: var(--text-head);
                    line-height: 1.3;
                }
                .delete-modal__batch {
                    margin-top: 6px;
                    font-size: 12px;
                    color: var(--text-muted);
                }
                .delete-modal__count-wrap {
                    text-align: right;
                }
                .delete-modal__count {
                    font-size: 22px;
                    font-weight: 900;
                    color: var(--danger);
                    line-height: 1;
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

        <DetailModal
          open={!!detailInventoryItem}
          onClose={() => setDetailInventoryItem(null)}
          title={detailInventoryItem ? `Inventory Details — ${detailInventoryItem.productName}` : undefined}
          data={detailInventoryItem ? (isAdmin ? detailInventoryItem : (() => {
            const { costPrice, sellingPrice, ...rest } = detailInventoryItem as any;
            return rest;
          })()) : {}}
        />
    </>
);
}
