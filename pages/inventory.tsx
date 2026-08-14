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
  StoreInventoryItem, 
  Store, 
  Purchase,
    Product,
  User 
} from "../types";
import { AddInventoryModal, AllotToStoreModal, EditInventoryModal, EditStoreInventoryModal, ReturnToWarehouseModal } from "../components/Modals";

// ── SVG Icon Components (mono-color, inherits currentColor) ──
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
    const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
    const [showAllotModal, setShowAllotModal] = useState(false);
    const [showEditModalUI, setShowEditModalUI] = useState(false);
    const [editingRow, setEditingRow] = useState<any | null>(null);
    const [showEditInventoryModal, setShowEditInventoryModal] = useState(false);
    const [editingInventoryItem, setEditingInventoryItem] = useState<InventoryItem | null>(null);
    const [showDeleteInventoryModal, setShowDeleteInventoryModal] = useState(false);
    const [deletingInventoryItem, setDeletingInventoryItem] = useState<InventoryItem | null>(null);
    const [deletingAllotmentRow, setDeletingAllotmentRow] = useState<any | null>(null);
    const [deletingAllotment, setDeletingAllotment] = useState(false);
    const [returnToWarehouseRow, setReturnToWarehouseRow] = useState<any | null>(null);
    const [showAlerts, setShowAlerts] = useState(false);
    const [inventorySearch, setInventorySearch] = useState('');
    const [storeSearch, setStoreSearch] = useState('');
    const [detailInventoryItem, setDetailInventoryItem] = useState<any | null>(null);
    const [detailStoreInventoryItem, setDetailStoreInventoryItem] = useState<any | null>(null);
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

    const handleDeleteAllotment = (item: any) => {
        if (!item?.id) return toast.error('Missing allotment id')
        setDeletingAllotmentRow(item)
        setDeletingAllotment(false)
    }

    const confirmDeleteAllotment = async () => {
        if (!deletingAllotmentRow?.id) return toast.error('Missing allotment id')

        setDeletingAllotment(true)
        showProcessing('Removing allotment...');
        try {
            const response = await fetch('/api/storeInventory', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deletingAllotmentRow.id })
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Failed to delete allotment')

            const returned = Number(result?.returned) || 0
            toast.success(`✅ Returned ${returned} piece${returned === 1 ? '' : 's'} to warehouse`)
            setDeletingAllotment(false)
            setDeletingAllotmentRow(null)
            refresh()
        } catch (e: any) {
            toast.error(e?.message || 'Delete failed')
        } finally {
            setDeletingAllotment(false)
            hideProcessing();
        }
    }

    const handleReturnToWarehouse = async (payload: { id: string; returnQty: number; returnSizeQuantities?: any; returnColorQuantities?: any; returnVariantQuantities?: any }) => {
        showProcessing('Returning stock to warehouse...');
        try {
            const response = await fetch('/api/storeInventory', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'returnToWarehouse', ...payload }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Failed to return to warehouse')
            const returnedQty = result.returned ?? payload.returnQty
            toast.success(`✅ ${returnedQty} piece${returnedQty !== 1 ? 's' : ''} returned to Main Store successfully.`)
            setReturnToWarehouseRow(null)
            refresh()
        } catch (e: any) {
            toast.error(e?.message || 'Return to warehouse failed')
        } finally {
            hideProcessing();
        }
    }

    // Flatten store inventory for the table
    const stockProvided = [];
    Object.entries(data.storeInventory).forEach(([storeName, items]) => {
        const canSee = isSuperAdmin || (isStoreAdmin && storeNameMatches(storeName)) || (!isAdmin && storeNameMatches(storeName));
        if (!canSee) return;
        Object.values(items).forEach((item) => {
            stockProvided.push({ ...item, storeName });
        });
    });

    // Keyed by inventory.id (batch-level), NOT productName, to avoid cross-batch confusion
    const allotedQtyByProduct: Record<string, number> = {};
    // Per-variant allotted quantities summed across all stores, keyed by inventoryId
    const allotedVariantsByProduct: Record<string, Record<string, Record<string, number>>> = {};
    Object.values(data.storeInventory || {}).forEach((items: any) => {
        Object.values(items || {}).forEach((it: any) => {
            const key = it?.inventoryId;   // inventory.id FK — unique per batch
            if (!key) return;
            allotedQtyByProduct[key] = (allotedQtyByProduct[key] || 0) + Math.max(0, (Number(it.quantityAssigned) || 0));
            // Accumulate per-variant allotments for the Add Allotment modal
            if (it.variantQuantitiesAssigned && typeof it.variantQuantitiesAssigned === 'object') {
                if (!allotedVariantsByProduct[key]) allotedVariantsByProduct[key] = {};
                Object.entries(it.variantQuantitiesAssigned as Record<string, Record<string, number>>).forEach(([color, sizes]) => {
                    if (!allotedVariantsByProduct[key][color]) allotedVariantsByProduct[key][color] = {};
                    Object.entries(sizes || {}).forEach(([size, qty]) => {
                        allotedVariantsByProduct[key][color][size] = (allotedVariantsByProduct[key][color][size] || 0) + (Number(qty) || 0);
                    });
                });
            }
        });
    });

    // Enrich warehouse inventory items with per-variant remaining quantities for the Add Allotment modal
    const inventoryWithRemaining = data.inventory.map((item: any) => {
        const allotedVariants = allotedVariantsByProduct[item.id];
        if (!allotedVariants || !item.variantQuantities) return item;
        const variantQuantitiesRemaining: Record<string, Record<string, number>> = {};
        Object.entries(item.variantQuantities as Record<string, Record<string, number>>).forEach(([color, sizes]) => {
            variantQuantitiesRemaining[color] = {};
            Object.entries(sizes || {}).forEach(([size, total]) => {
                const alloted = allotedVariants[color]?.[size] || 0;
                variantQuantitiesRemaining[color][size] = Math.max(0, (Number(total) || 0) - alloted);
            });
        });
        return { ...item, variantQuantitiesRemaining };
    });

    const storeCommissionByName: Record<string, number> = {};
    Object.entries(data.stores || {}).forEach(([name, s]) => {
        storeCommissionByName[name] = Number((s as any)?.commission) || 0;
    });

    const deletingStoreAllotments = deletingInventoryItem
        ? stockProvided.filter((item) => item.inventoryId === deletingInventoryItem.id)
        : [];

    // Build alerts list
    const alerts: Array<{ type: 'out' | 'low' | 'store-out'; product: string; detail: string; rowId: string; section: 'warehouse' | 'store' }> = [];
    data.inventory.forEach(item => {
        const allotedQty = allotedQtyByProduct[item.id] || 0;
        const availableQty = Math.max(0, (Number(item.quantityAvailable) || 0) - allotedQty);
        if (availableQty <= 0) {
            alerts.push({ type: 'out', product: item.productName, detail: `Batch ${item.batchNumber} — 0 units left in warehouse`, rowId: `inv-row-${item.batchNumber}`, section: 'warehouse' });
        } else if (availableQty <= (item.lowStockWarning || 5)) {
            alerts.push({ type: 'low', product: item.productName, detail: `Batch ${item.batchNumber} — only ${availableQty} unit${availableQty !== 1 ? 's' : ''} remaining`, rowId: `inv-row-${item.batchNumber}`, section: 'warehouse' });
        }
    });
    stockProvided.forEach((item, idx) => {
        if ((item.quantityRemaining || 0) <= 0) {
            alerts.push({ type: 'store-out', product: item.productName, detail: `${item.storeName} — 0 units left in shop`, rowId: `store-inv-row-${item.id || idx}`, section: 'store' });
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

    // Summary calculations
    // For superadmin: all stores. For store admin: only managed stores.

    // True inventory value = (warehouse unallotted + store remaining) × cost_price
    // This excludes already-sold units so the number reflects real unsold stock value.
    const storeRemainingByProduct: Record<string, number> = {};
    // Keyed by inventoryId (batch FK) so each batch's store-remaining is tracked separately
    stockProvided.forEach(item => {
        const key = item.inventoryId || item.id;
        storeRemainingByProduct[key] = (storeRemainingByProduct[key] || 0) + (Number(item.quantityRemaining) || 0);
    });

    const calcInventoryValue = (inventoryItems: typeof data.inventory) =>
        inventoryItems.reduce((acc, it) => {
            const warehouseUnallotted = Math.max(0, (Number(it.quantityAvailable) || 0) - (allotedQtyByProduct[it.id] || 0));
            const atStores = storeRemainingByProduct[it.id] || 0;
            return acc + (Number(it.costPrice) || 0) * (warehouseUnallotted + atStores);
        }, 0);

    let totalInventoryValue = 0;
    let totalItemsInWarehouse = 0;
    let totalItemsInStores = 0;
    if (isSuperAdmin) {
        totalInventoryValue = calcInventoryValue(data.inventory);
        totalItemsInWarehouse = data.inventory.reduce((acc, it) => acc + Math.max(0, (Number(it.quantityAvailable) || 0) - (allotedQtyByProduct[it.id] || 0)), 0);
        totalItemsInStores = stockProvided.reduce((acc, it) => acc + Math.max(0, it.quantityRemaining), 0);
    } else if (isStoreAdmin) {
        const ownedItems = data.inventory.filter(it => it.owner === user.username);
        totalInventoryValue = calcInventoryValue(ownedItems);
        totalItemsInWarehouse = ownedItems.reduce((acc, it) => acc + Math.max(0, (Number(it.quantityAvailable) || 0) - (allotedQtyByProduct[it.id] || 0)), 0);
        totalItemsInStores = stockProvided.filter(it => visibleStoreNames.some((name) => name.trim().toLowerCase() === it.storeName.trim().toLowerCase())).reduce((acc, it) => acc + Math.max(0, it.quantityRemaining), 0);
    } else {
        // Store user: only their own
        const ownedItems = data.inventory.filter(it => it.owner === user.username);
        totalInventoryValue = calcInventoryValue(ownedItems);
        totalItemsInWarehouse = ownedItems.reduce((acc, it) => acc + Math.max(0, (Number(it.quantityAvailable) || 0) - (allotedQtyByProduct[it.id] || 0)), 0);
        totalItemsInStores = stockProvided.filter(it => storeNameMatches(it.storeName)).reduce((acc, it) => acc + Math.max(0, it.quantityRemaining), 0);
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
                                    {isAdmin ? data.inventory.length : stockProvided.filter(s => storeNameMatches(s.storeName)).length}
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
                        {/* Search Bar */}
                        <div style={{ padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                                <input
                                    type="text"
                                    placeholder="Search by name, brand, type, or item ID…"
                                    value={inventorySearch}
                                    onChange={e => setInventorySearch(e.target.value)}
                                    style={{ paddingLeft: 36, paddingRight: inventorySearch ? 36 : 12, height: 40, fontSize: 13, borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface-2)', width: '100%', outline: 'none' }}
                                />
                                {inventorySearch && (
                                    <button onClick={() => setInventorySearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>
                                )}
                            </div>
                            {inventorySearch && (() => {
                                const count = data.inventory.filter(item => matchesWarehouseSearch(item, inventorySearch)).length;
                                return <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{count} result{count !== 1 ? 's' : ''}</span>;
                            })()}
                        </div>
                        <div className="table-wrap">
                            <table className="desktop-table-view">
                                <thead>
                                    <tr>
                                        <th>Item Name</th>
                                        <th>Type</th>
                                        <th>Item ID</th>
                                        <th>Cost/pc</th>
                                        <th>Qty</th>
                                        <th>Allotted Qty</th>
                                        <th>Alloted Stores</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(inventorySearch.trim()
                                        ? data.inventory.filter(item => matchesWarehouseSearch(item, inventorySearch))
                                        : data.inventory
                                    ).map((item, idx) => {
                                        const picture = item.productImage || (item as any)?.otherVariants?.picture as string | undefined;
                                        const pictureSrc = (typeof picture === 'string' && picture.trim().length > 0) ? picture : '/images/size_L.webp';
                                        const allotedStores = Object.entries(data.storeInventory || {})
                                            .filter(([, items]) => Object.values(items as any).some((si: any) => si.inventoryId === item.id))
                                            .map(([storeName]) => storeName);
                                        const allotedQty = allotedQtyByProduct[item.id] || 0;
                                        const availableQty = Math.max(0, (Number(item.quantityAvailable) || 0) - allotedQty);

                                        return (
                                            <tr key={`${item.productName}-${item.batchNumber}-${idx}`} id={`inv-row-${item.batchNumber}`}>
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
                                                <td className="text-muted font-mono" style={{ fontWeight: 700 }}>{formatItemCode(item.batchNumber)}</td>
                                                <td>{Rs(item.costPrice)}</td>
                                                <td className="font-bold" style={{ fontSize: '1.05rem' }}>{availableQty}</td>
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
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm"
                                                            style={{ fontSize: 10, padding: '3px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }}
                                                            onClick={() => setDetailInventoryItem(item)}
                                                        >
                                                            Detail
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-glass"
                                                            style={{
                                                                fontWeight: 800,
                                                                color: 'var(--pri-700)',
                                                                borderColor: 'rgba(99, 102, 241, 0.22)',
                                                                background: 'rgba(99, 102, 241, 0.07)',
                                                                boxShadow: '0 8px 18px rgba(99, 102, 241, 0.08)',
                                                            }}
                                                            onClick={() => { setEditingInventoryItem(item); setShowEditInventoryModal(true); }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-glass"
                                                            onClick={() => handleDeleteInventory(item)}
                                                            title="Delete inventory item"
                                                            aria-label={`Delete ${item.productName}`}
                                                            style={{
                                                                color: 'var(--danger)',
                                                                borderColor: 'rgba(239, 68, 68, 0.25)',
                                                                background: 'rgba(239, 68, 68, 0.08)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                width: 40,
                                                                padding: 0,
                                                            }}
                                                        >
                                                            {IC.trash}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {/* ── Mobile card view ── */}
                            <div className="mobile-card-view">
                                {(inventorySearch.trim()
                                    ? data.inventory.filter(item => {
                                        const q = inventorySearch.toLowerCase();
                                        return (
                                            item.productName?.toLowerCase().includes(q) ||
                                            (item as any).brand?.toLowerCase().includes(q) ||
                                            item.category?.toLowerCase().includes(q) ||
                                            item.batchNumber?.toLowerCase().includes(q)
                                        );
                                    })
                                    : data.inventory
                                ).map((item, idx) => {
                                    const picture = item.productImage || (item as any)?.otherVariants?.picture as string | undefined;
                                    const pictureSrc = (typeof picture === 'string' && picture.trim().length > 0) ? picture : '/images/size_L.webp';
                                    const allotedStores = Object.entries(data.storeInventory || {})
                                        .filter(([, items]) => Object.values(items as any).some((si: any) => si.inventoryId === item.id))
                                        .map(([storeName]) => storeName);
                                    const allotedQty = allotedQtyByProduct[item.id] || 0;
                                    const availableQty = Math.max(0, (Number(item.quantityAvailable) || 0) - allotedQty);

                                    return (
                                        <div className="mobile-card" key={`${item.productName}-${item.batchNumber}-${idx}`} id={`inv-row-${item.batchNumber}`}>
                                            <div className="mobile-card-header">
                                                <span className="mobile-card-title">{item.productName}</span>
                                                {availableQty <= 0 ? (
                                                    <Badge type="red">Out</Badge>
                                                ) : availableQty <= (item.lowStockWarning || 5) ? (
                                                    <Badge type="orange">Low</Badge>
                                                ) : (
                                                    <Badge type="green">Good</Badge>
                                                )}
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Type</span>
                                                <span className="mobile-card-value"><Badge type="gray">{item.category}</Badge></span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Item ID</span>
                                                <span className="mobile-card-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{formatItemCode(item.batchNumber)}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Cost/pc</span>
                                                <span className="mobile-card-value">{Rs(item.costPrice)}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Qty Available</span>
                                                <span className="mobile-card-value" style={{ fontSize: '1.05rem' }}>{availableQty}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Allotted</span>
                                                <span className="mobile-card-value">{allotedQty}</span>
                                            </div>
                                            {Array.isArray(allotedStores) && allotedStores.length > 0 && (
                                                <div className="mobile-card-row">
                                                    <span className="mobile-card-label">Stores</span>
                                                    <span className="mobile-card-value" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                                                        {allotedStores.map((s) => (
                                                            <Badge key={s} type="blue" style={{ fontSize: 10 }}>{s}</Badge>
                                                        ))}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="mobile-card-actions">
                                                <button className="btn btn-sm" style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailInventoryItem(item)}>Detail</button>
                                                <button className="btn btn-sm btn-glass" style={{ fontWeight: 800, color: 'var(--pri-700)', borderColor: 'rgba(99, 102, 241, 0.22)', background: 'rgba(99, 102, 241, 0.07)' }} onClick={() => { setEditingInventoryItem(item); setShowEditInventoryModal(true); }}>Edit</button>
                                                <button className="btn btn-sm btn-glass" onClick={() => handleDeleteInventory(item)} style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.25)', background: 'rgba(239, 68, 68, 0.08)', width: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{IC.trash}</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
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
                    <SearchBar value={storeSearch} onChange={setStoreSearch} placeholder="Search by shop, product, item ID, price, qty, owner…" resultCount={stockProvided.filter(s => {
                        if (!(isAdmin || storeNameMatches(s.storeName))) return false;
                        return matchesStoreSearch(s, storeSearch);
                    }).length} />
                    <div className="table-wrap">
                        <table className="desktop-table-view">
                            <thead>
                                <tr>
                                    {isAdmin && <th>Shop Name</th>}
                                    <th>Item Name</th>
                                    <th>Item ID</th>
                                    {isAdmin && <th>Owner Supply Price</th>}
                                    <th>Total Sent</th>
                                    <th>In Shop Stock</th>
                                    {isAdmin && <th>Shop Cut %</th>}
                                    <th style={{ textAlign: 'right' }}>Items Sold</th>
                                    <th>Alloted By</th>
                                    <th style={{ textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                    {(() => {
                                        const rows = stockProvided.filter(s => {
                                            if (!(isAdmin || storeNameMatches(s.storeName))) return false;
                                            return matchesStoreSearch(s, storeSearch);
                                        });
                                        return rows.length === 0 ? (
                                            <tr><td colSpan={isAdmin ? 10 : 8} style={{ textAlign: 'center', padding: 40 }} className="text-muted">{storeSearch ? 'No stock matches your search.' : 'No stock available currently.'}</td></tr>
                                        ) : rows.map((item, idx) => (
                                        <tr key={item.id || idx} id={`store-inv-row-${item.id || idx}`}>
                                            {isAdmin && <td className="font-bold" style={{ color: 'var(--pri-900)' }}>{item.storeName}</td>}
                                            <td className="font-bold">{item.productName}</td>
                                            <td className="muted" style={{fontWeight:600, fontFamily:'monospace', fontSize:11}}>{formatItemCode(item.batchNumber || item.inventoryId)}</td>
                                            <td className="text-muted font-mono" style={{ fontWeight: 600 }}>
                                                {item.ownerSupplyPrice ? `Rs ${Number(item.ownerSupplyPrice).toLocaleString()}` : '-'}
                                            </td>
                                            <td><Badge type="gray">{Math.max(0, item.quantityAssigned)}</Badge></td>
                                            <td className="font-bold" style={{ fontSize: '1rem', color: Math.max(0, item.quantityRemaining) > 0 ? 'var(--text-body)' : 'var(--danger)' }}>
                                                {Math.max(0, item.quantityRemaining)}
                                            </td>
                                            {isAdmin && <td><Badge type="purple">{item.commissionPercent}%</Badge></td>}
                                            <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                                <Badge type={Math.max(0, item.quantityAssigned - item.quantityRemaining) > 0 ? 'blue' : 'gray'}>
                                                    {Math.max(0, item.quantityAssigned - item.quantityRemaining)}
                                                </Badge>
                                            </td>
                                            <td>
                                                <Badge type="purple">{item.owner || '—'}</Badge>
                                            </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm"
                                                            style={{ fontSize: 10, padding: '3px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }}
                                                            onClick={() => setDetailStoreInventoryItem(item)}
                                                        >
                                                            Detail
                                                        </button>
                                                        {isAdmin && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm"
                                                                style={{ fontWeight: 800, color: 'var(--pri-700)', borderColor: 'rgba(99, 102, 241, 0.22)', background: 'rgba(99, 102, 241, 0.07)', boxShadow: '0 8px 18px rgba(99, 102, 241, 0.08)' }}
                                                                onClick={() => {
                                                                    const warehouseItem = data.inventory.find((i: any) => i.id === item.inventoryId);
                                                                    const warehouseVariants = warehouseItem?.variantQuantities || {};
                                                                    const warehouseVariantRemaining: Record<string, Record<string, number>> = {};
                                                                    if (warehouseItem && Object.keys(warehouseVariants).length > 0) {
                                                                        Object.entries(warehouseVariants).forEach(([color, sizes]: [string, any]) => {
                                                                            warehouseVariantRemaining[color] = {};
                                                                            Object.entries(sizes || {}).forEach(([size, total]: [string, any]) => {
                                                                                let otherStoresAllotted = 0;
                                                                                Object.values(data.storeInventory || {}).forEach((storeItems: any) => {
                                                                                    Object.values(storeItems || {}).forEach((si: any) => {
                                                                                        if (si.inventoryId === item.inventoryId && si.id !== item.id) {
                                                                                            otherStoresAllotted += Number((si.variantQuantitiesAssigned?.[color])?.[size] || 0);
                                                                                        }
                                                                                    });
                                                                                });
                                                                                warehouseVariantRemaining[color][size] = Math.max(0, Number(total) - otherStoresAllotted);
                                                                            });
                                                                        });
                                                                    }
                                                                    setEditingRow({
                                                                        ...item,
                                                                        sizeQuantities: warehouseItem?.sizeQuantities || {},
                                                                        colorQuantities: warehouseItem?.colorQuantities || {},
                                                                        variantQuantities: warehouseItem?.variantQuantities || {},
                                                                        totalQty: warehouseItem?.quantityAvailable || 0,
                                                                        allotedQty: allotedQtyByProduct[item.inventoryId] || 0,
                                                                        sizeQuantitiesRemaining: item.sizeQuantitiesRemaining ?? warehouseItem?.sizeQuantitiesRemaining ?? {},
                                                                        colorQuantitiesRemaining: item.colorQuantitiesRemaining ?? warehouseItem?.colorQuantitiesRemaining ?? {},
                                                                        variantQuantitiesRemaining: item.variantQuantitiesRemaining ?? warehouseItem?.variantQuantitiesRemaining ?? {},
                                                                        warehouseVariantQuantitiesRemaining: warehouseVariantRemaining,
                                                                    });
                                                                     setShowEditModalUI(true);
                                                                 }}
                                                             >
                                                                 Edit
                                                                 </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm"
                                                            onClick={() => setReturnToWarehouseRow(item)}
                                                            title={`Return stock to main store (${item.quantityRemaining} in stock${(item as any).pendingReturnQty > 0 ? `, ${(item as any).pendingReturnQty} pending` : ''})`}
                                                            style={{
                                                                fontSize: 11,
                                                                fontWeight: 800,
                                                                color: '#1e40af',
                                                                borderColor: 'rgba(59,130,246,0.3)',
                                                                background: 'rgba(59,130,246,0.08)',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            &#x21A9; Return to main{(item as any).pendingReturnQty > 0 ? ` (${(item as any).pendingReturnQty} pending)` : ''}
                                                        </button>
                                                        {isAdmin && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-glass"
                                                                onClick={() => setDeletingAllotmentRow(item)}
                                                                title="Remove allotment and return unsold stock to warehouse"
                                                                aria-label={`Delete allotment for ${item.productName}`}
                                                                style={{
                                                                    color: 'var(--danger)',
                                                                    borderColor: 'rgba(239, 68, 68, 0.25)',
                                                                    background: 'rgba(239, 68, 68, 0.08)',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    width: 40,
                                                                    height: 40,
                                                                    padding: 0,
                                                                }}
                                                            >
                                                                {IC.trash}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                        </tr>
                                    ));
                                })()}
                            </tbody>
                            </table>
                            {/* ── Mobile card view ── */}
                            <div className="mobile-card-view">
                                {(() => {
                                    const rows = stockProvided.filter(s => {
                                        if (!(isAdmin || storeNameMatches(s.storeName))) return false;
                                        return matchesStoreSearch(s, storeSearch);
                                    });
                                    return rows.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 40 }} className="text-muted">{storeSearch ? 'No stock matches your search.' : 'No stock available currently.'}</div>
                                    ) : rows.map((item, idx) => (
                                        <div className="mobile-card" key={item.id || idx} id={`store-inv-row-${item.id || idx}`}>
                                            <div className="mobile-card-header">
                                                <span className="mobile-card-title">{item.productName}</span>
                                                <span className="mobile-card-badge" style={{ fontSize: 10, fontWeight: 700, color: 'var(--pri-900)' }}>{item.storeName}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Item ID</span>
                                                <span className="mobile-card-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{formatItemCode(item.batchNumber || item.inventoryId)}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Supply Price</span>
                                                <span className="mobile-card-value text-muted">{item.ownerSupplyPrice ? `Rs ${Number(item.ownerSupplyPrice).toLocaleString()}` : '-'}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Total Sent</span>
                                                <span className="mobile-card-value"><Badge type="gray">{Math.max(0, item.quantityAssigned)}</Badge></span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">In Stock</span>
                                                <span className="mobile-card-value" style={{ color: Math.max(0, item.quantityRemaining) > 0 ? 'inherit' : 'var(--danger)', fontSize: '1rem' }}>{Math.max(0, item.quantityRemaining)}</span>
                                            </div>
                                            {isAdmin && (
                                                <div className="mobile-card-row">
                                                    <span className="mobile-card-label">Shop Cut</span>
                                                    <span className="mobile-card-value"><Badge type="purple">{item.commissionPercent}%</Badge></span>
                                                </div>
                                            )}
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Items Sold</span>
                                                <span className="mobile-card-value"><Badge type={Math.max(0, item.quantityAssigned - item.quantityRemaining) > 0 ? 'blue' : 'gray'}>{Math.max(0, item.quantityAssigned - item.quantityRemaining)}</Badge></span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Alloted By</span>
                                                <span className="mobile-card-value"><Badge type="purple">{item.owner || '—'}</Badge></span>
                                            </div>
                                            <div className="mobile-card-actions">
                                                <button className="btn btn-sm" style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailStoreInventoryItem(item)}>Detail</button>
                                                {isAdmin && (
                                                    <button className="btn btn-sm" style={{ fontWeight: 800, color: 'var(--pri-700)', borderColor: 'rgba(99, 102, 241, 0.22)', background: 'rgba(99, 102, 241, 0.07)' }} onClick={() => {
                                                        const warehouseItem = data.inventory.find((i: any) => i.id === item.inventoryId);
                                                        setEditingRow({
                                                            ...item,
                                                            sizeQuantities: warehouseItem?.sizeQuantities || {},
                                                            colorQuantities: warehouseItem?.colorQuantities || {},
                                                            variantQuantities: warehouseItem?.variantQuantities || {},
                                                            totalQty: warehouseItem?.quantityAvailable || 0,
                                                            allotedQty: allotedQtyByProduct[item.inventoryId] || 0,
                                                        });
                                                        setShowEditModalUI(true);
                                                    }}>Edit</button>
                                                )}
                                                <button className="btn btn-sm" style={{ fontSize: 11, fontWeight: 800, color: '#1e40af', borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)' }} onClick={() => setReturnToWarehouseRow(item)}>Return</button>
                                                {isAdmin && (
                                                    <button className="btn btn-sm btn-glass" onClick={() => setDeletingAllotmentRow(item)} style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.25)', background: 'rgba(239, 68, 68, 0.08)', width: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{IC.trash}</button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                })()}
                            </div>
                        </div>
                </SectionCard>

                {isSuperAdmin && (() => {
                    const extras: Array<{ storeName: string; productName: string; extraQty: number; date: string; costPerPc: number; batchNumber: string }> = [];
                    Object.entries(data.storeInventory || {}).forEach(([sName, items]) => {
                        Object.values(items).forEach((si: any) => {
                            if ((si.extraQty || 0) > 0) {
                                const inv = data.inventory.find(i => i.id === si.inventoryId);
                                extras.push({
                                    storeName: sName,
                                    productName: si.productName,
                                    extraQty: si.extraQty,
                                    date: si.created_at ? new Date(si.created_at).toLocaleDateString() : '—',
                                    costPerPc: inv?.costPrice || 0,
                                    batchNumber: inv?.batchNumber || si.batchNumber || '',
                                });
                            }
                        });
                    });
                    if (extras.length === 0) return null;
                    const totalExtraCost = extras.reduce((acc, e) => acc + e.extraQty * e.costPerPc, 0);
                    return (
                        <SectionCard
                            title="Store Gifts & Extras"
                            icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>}
                        >
                            <div className="table-wrap">
                                <table className="desktop-table-view">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Store</th>
                                            <th>Item Name</th>
                                            <th>Item ID</th>
                                            <th>Extra Qty</th>
                                            <th>Cost/PC</th>
                                            <th>Total Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {extras.map((e, i) => (
                                            <tr key={i}>
                                                <td className="text-muted" style={{ fontSize: '0.75rem' }}>{e.date}</td>
                                                <td className="font-bold" style={{ color: 'var(--pri-700)' }}>{e.storeName}</td>
                                                <td className="font-bold">{e.productName}</td>
                                                <td className="muted" style={{fontWeight:600, fontFamily:'monospace', fontSize:11}}>{formatItemCode(e.batchNumber)}</td>
                                                <td><Badge type="orange">{e.extraQty}</Badge></td>
                                                <td className="text-muted">{e.costPerPc ? `Rs ${e.costPerPc.toLocaleString()}` : '—'}</td>
                                                <td className="font-bold" style={{ color: 'var(--danger)' }}>
                                                    {e.costPerPc ? `Rs ${(e.extraQty * e.costPerPc).toLocaleString()}` : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {/* ── Mobile card view ── */}
                                <div className="mobile-card-view">
                                    {extras.map((e, i) => (
                                        <div className="mobile-card" key={i}>
                                            <div className="mobile-card-header">
                                                <span className="mobile-card-title">{e.productName}</span>
                                                <span className="mobile-card-value" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.date}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Store</span>
                                                <span className="mobile-card-value" style={{ color: 'var(--pri-700)' }}>{e.storeName}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Item ID</span>
                                                <span className="mobile-card-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{formatItemCode(e.batchNumber)}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Extra Qty</span>
                                                <span className="mobile-card-value"><Badge type="orange">{e.extraQty}</Badge></span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Cost/PC</span>
                                                <span className="mobile-card-value text-muted">{e.costPerPc ? `Rs ${e.costPerPc.toLocaleString()}` : '—'}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Total Cost</span>
                                                <span className="mobile-card-value" style={{ color: 'var(--danger)' }}>{e.costPerPc ? `Rs ${(e.extraQty * e.costPerPc).toLocaleString()}` : '—'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, fontWeight: 700, color: 'var(--danger)' }}>
                                Total gifted cost: Rs {totalExtraCost.toLocaleString()}
                            </div>
                        </SectionCard>
                    );
                })()}

                {showAddInventoryModal && (
                    <AddInventoryModal 
                        stores={Object.keys(data.stores)} 
                        products={data.products}
                        inventory={data.inventory}
                        hiddenProductTypes={hiddenProductTypes}
                        onHideProductType={handleHideProductType}
                        onSave={handleSaveInventory} 
                        onClose={() => setShowAddInventoryModal(false)} 
                    />
                )}

                {showAllotModal && (
                    <AllotToStoreModal
                        stores={Object.keys(data.stores)}
                        inventory={inventoryWithRemaining}
                        allotedQtyByProduct={allotedQtyByProduct}
                        storeCommissionByName={storeCommissionByName}
                        onSave={async ({ storeName, batchNumber, quantity, ownerSupplyPrice, commissionPercent, extraQty, sizeQuantitiesAssigned, colorQuantitiesAssigned, variantQuantitiesAssigned }) => {
                            try {
                                const resp = await fetch('/api/storeInventory', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        storeName,
                                        batchNumber,
                                        quantity,
                                        variantQuantitiesAssigned,
                                        sizeQuantitiesAssigned,
                                        colorQuantitiesAssigned,
                                        ownerSupplyPrice,
                                        commissionPercent,
                                        extraQty: extraQty || 0,
                                    })
                                })
                                const json = await resp.json()
                                if (!resp.ok) throw new Error(json?.error || 'Failed to save allotment')
                                toast.success('✅ Allotment saved')
                                refresh()
                            } catch (e: any) {
                                toast.error(e?.message || 'Failed to save allotment')
                            }
                        }}
                        onClose={() => setShowAllotModal(false)}
                    />
                )}

                {showEditModalUI && editingRow && (
                    <EditStoreInventoryModal
                        item={editingRow}
                        storeNames={Object.keys(data.stores)}
                        onSave={async (fields: any) => {
                            try {
                                const resp = await fetch('/api/storeInventory', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: editingRow.id, fields })
                                })
                                const json = await resp.json()
                                if (!resp.ok) throw new Error(json?.error || 'Failed to update allotment')
                                toast.success('✅ Allotment updated')
                                setShowEditModalUI(false)
                                setEditingRow(null)
                                refresh()
                            } catch (e: any) {
                                toast.error(e?.message || 'Update failed')
                            }
                        }}
                        onClose={() => { setShowEditModalUI(false); setEditingRow(null); }}
                    />
                )}

                {deletingAllotmentRow && (
                    <div className="modal-overlay" onClick={() => { if (!deletingAllotment) { setDeletingAllotmentRow(null); } }}>
                        <div className="modal-box delete-modal" onClick={e => e.stopPropagation()}>
                            <div className="delete-modal__hero">
                                <div className="delete-modal__head">
                                    <div className="delete-modal__icon">
                                        {IC.trash}
                                    </div>
                                    <div className="delete-modal__copy">
                                        <div className="delete-modal__eyebrow">Destructive action</div>
                                        <h3 className="delete-modal__title">Delete store allotment?</h3>
                                        <div className="delete-modal__subtitle">
                                            This will remove the allotment for <strong>{deletingAllotmentRow.productName}</strong> from <strong>{deletingAllotmentRow.storeName}</strong>.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {(() => {
                                const totalSent = Math.max(0, Number(deletingAllotmentRow.quantityAssigned) || 0)
                                const remaining = Math.max(0, Number(deletingAllotmentRow.quantityRemaining) || 0)
                                const sold = Math.max(0, totalSent - remaining)

                                return (
                                    <div className="delete-modal__body">
                                        <div className="delete-modal__summary">
                                            <div className="delete-modal__summary-top">
                                                <div>
                                                    <div className="delete-modal__label">Item details</div>
                                                    <div className="delete-modal__item-name">{deletingAllotmentRow.productName}</div>
                                                    <div className="delete-modal__batch">{deletingAllotmentRow.storeName}</div>
                                                </div>
                                                <div className="delete-modal__count-wrap">
                                                    <div className="delete-modal__label delete-modal__label--right">Will return</div>
                                                    <div className="delete-modal__count">{remaining}</div>
                                                </div>
                                            </div>
                                            <div className="delete-modal__chips">
                                                <span className="badge badge-red">Total sent: {totalSent}</span>
                                                <span className="badge badge-blue">Items sold: {sold}</span>
                                                <span className="badge badge-gray">In shop stock: {remaining}</span>
                                            </div>
                                        </div>

                                        <div className="delete-modal__warning">
                                            Deleting this allotment will keep the sold pieces as-is and return only the remaining {remaining} piece{remaining === 1 ? '' : 's'} to warehouse stock.
                                        </div>
                                    </div>
                                )
                            })()}

                            <div className="delete-modal__footer">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-glass delete-modal__cancel"
                                    onClick={() => { if (!deletingAllotment) { setDeletingAllotmentRow(null); } }}
                                    disabled={deletingAllotment}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm delete-modal__confirm"
                                    onClick={confirmDeleteAllotment}
                                    disabled={deletingAllotment}
                                >
                                    {deletingAllotment ? 'Deleting...' : 'Delete Allotment'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showEditInventoryModal && editingInventoryItem && (
                    <EditInventoryModal
                        item={editingInventoryItem}
                        minQuantity={editingInventoryItem.id ? (allotedQtyByProduct[editingInventoryItem.id] || 0) : 0}
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
                                            <div className="delete-modal__label delete-modal__label--right">Linked allotments</div>
                                            <div className="delete-modal__count">
                                                {deletingStoreAllotments.length}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="delete-modal__chips">
                                        <span className="badge badge-red">Warehouse item</span>
                                        {deletingStoreAllotments.length > 0 ? (
                                            deletingStoreAllotments.slice(0, 3).map((item) => (
                                                <Badge key={`${item.storeName}-${item.id}`} type="blue">
                                                    {item.storeName}
                                                </Badge>
                                            ))
                                        ) : (
                                            <span className="text-muted">No store allotments found</span>
                                        )}
                                        {deletingStoreAllotments.length > 3 && <Badge type="gray">+{deletingStoreAllotments.length - 3} more</Badge>}
                                    </div>
                                </div>

                                <div className="delete-modal__warning">
                                    This permanently deletes the item and every linked allotment. The action cannot be undone.
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

            {/* ── Return to Warehouse Modal (Scenario B) ── */}
            {returnToWarehouseRow && (
                <ReturnToWarehouseModal
                    allotment={{
                        id: returnToWarehouseRow.id,
                        productName: returnToWarehouseRow.productName,
                        storeName: returnToWarehouseRow.storeName,
                        quantityRemaining: Number(returnToWarehouseRow.quantityRemaining) || 0,
                        pendingReturnQty: Number(returnToWarehouseRow.pendingReturnQty) || 0,
                        pendingReturnSizeQuantities: returnToWarehouseRow.pendingReturnSizeQuantities ?? null,
                        pendingReturnColorQuantities: returnToWarehouseRow.pendingReturnColorQuantities ?? null,
                        pendingReturnVariantQuantities: returnToWarehouseRow.pendingReturnVariantQuantities ?? null,
                        sizeQuantitiesRemaining: returnToWarehouseRow.sizeQuantitiesRemaining ?? null,
                        colorQuantitiesRemaining: returnToWarehouseRow.colorQuantitiesRemaining ?? null,
                        variantQuantitiesRemaining: returnToWarehouseRow.variantQuantitiesRemaining ?? null,
                    }}
                    onConfirm={handleReturnToWarehouse}
                    onClose={() => setReturnToWarehouseRow(null)}
                />
            )}

            {/* ── Alerts Popup ── */}
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
                                        background: alert.type === 'out' || alert.type === 'store-out' ? '#fef2f2' : '#fffbeb',
                                        border: `1px solid ${alert.type === 'out' || alert.type === 'store-out' ? '#fecaca' : '#fde68a'}`,
                                        cursor: 'pointer', transition: 'opacity 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                                >
                                    <span style={{ fontSize: 18, flexShrink: 0 }}>
                                        {alert.type === 'out' || alert.type === 'store-out' ? '🚫' : '⚠️'}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{alert.product}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{alert.detail}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                            background: alert.type === 'out' || alert.type === 'store-out' ? '#fee2e2' : '#fef3c7',
                                            color: alert.type === 'out' || alert.type === 'store-out' ? '#b91c1c' : '#92400e',
                                        }}>
                                            {alert.type === 'out' ? 'OUT OF STOCK' : alert.type === 'store-out' ? 'SHOP EMPTY' : 'LOW STOCK'}
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
          data={detailInventoryItem || {}}
        />
        <DetailModal
          open={!!detailStoreInventoryItem}
          onClose={() => setDetailStoreInventoryItem(null)}
          title={detailStoreInventoryItem ? `Store Inventory Details — ${detailStoreInventoryItem.productName}` : undefined}
          data={detailStoreInventoryItem || {}}
        />
    </>
);
}
