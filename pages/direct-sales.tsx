import { useState, useEffect, useCallback } from "react";
import Login from "../components/Login";
import SectionCard from "../components/SectionCard";
import Badge from "../components/Badge";
import SearchBar from "../components/SearchBar";
import DetailModal from "../components/DetailModal";
import { CartModal, SaleReturnModal, SaleRefundModal } from "../components/Modals";
import { usePopup } from "../components/Popup";
import { formatItemCode } from "../lib/catalog";
import { PageProps, InventoryItem } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────
const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();

const effectiveQty = (o: any) => {
  const soldQty = Math.max(0, Number(o.quantity) || 0);
  const returnedQty = Math.min(Math.max(0, Number(o.returnQuantity) || 0), soldQty);
  const refundedQty = Math.min(Math.max(0, Number(o.refundQuantity) || 0), soldQty - returnedQty);
  return soldQty - returnedQty - refundedQty;
};
const effectiveRevenue = (o: any) => (Number(o.sellingPrice) || 0) * effectiveQty(o);

// ── Icons ────────────────────────────────────────────────────────────
const IC = {
  warehouse: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>,
  receipt: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>,
  wallet: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,
  profit: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  trash: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
};

// ── Edit modal (price / shipment / client / date only — quantity is locked
//    since the backend doesn't reconcile warehouse stock on a quantity edit) ──
function EditDirectSaleModal({ order, onSave, onClose }: { order: any; onSave: (payload: any) => void; onClose: () => void }) {
  const [sellingPrice, setSellingPrice] = useState<number>(Number(order.sellingPrice) || 0);
  const [shipmentCost, setShipmentCost] = useState<number>(Number(order.shipmentCost) || 0);
  const [extraCharges, setExtraCharges] = useState<number>(Number(order.extraCharges) || 0);
  const [clientName, setClientName] = useState<string>(order.clientName || "");
  const [date, setDate] = useState<string>(order.date ? String(order.date).slice(0, 10) : "");

  const qty = Number(order.quantity) || 0;
  const gross = sellingPrice * qty;
  const deductions = shipmentCost + extraCharges;
  const netPayable = gross - deductions;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ padding: "12px 20px" }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>Edit Direct Sale</h3>
          <button className="btn btn-sm" onClick={onClose} style={{ border: "none", fontSize: 16 }}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="input-group full-width">
            <label>Item</label>
            <div style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {order.productName}
            </div>
          </div>
          <div className="form-grid-2">
            <div className="input-group">
              <label>Qty Sold</label>
              <input type="text" value={qty} readOnly style={{ background: "var(--surface-2)", cursor: "default" }} />
            </div>
            <div className="input-group">
              <label>Selling Price (PKR)</label>
              <input type="number" min="0" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)} style={{ fontWeight: 700 }} />
            </div>
          </div>
          <div className="input-group">
            <label style={{ color: "var(--danger)", fontWeight: 700 }}>Shipment Cost (PKR)</label>
            <input type="number" min="0" step="0.01" value={shipmentCost} onChange={(e) => setShipmentCost(parseFloat(e.target.value) || 0)} style={{ border: "1px solid var(--danger)" }} />
          </div>
          <div className="input-group">
            <label style={{ color: "var(--danger)", fontWeight: 700 }}>Extra Charges (PKR)</label>
            <input type="number" min="0" step="0.01" value={extraCharges} onChange={(e) => setExtraCharges(parseFloat(e.target.value) || 0)} style={{ border: "1px solid var(--danger)" }} />
          </div>
          <div className="input-group full-width">
            <label>Date of Sale</label>
            <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="input-group full-width">
            <label>Customer Name</label>
            <input placeholder="Client name..." value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>

          <div style={{ padding: "12px 16px", background: "#f9fafb", borderRadius: 6, border: "1px solid #1890ff30" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ color: "#8c8c8c", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Gross Order Value:</span>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Rs {gross.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #eee", paddingTop: 8 }}>
              <span style={{ color: "#000", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Final Net Payable:</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: "var(--success)" }}>Rs {netPayable.toLocaleString()}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-glass" style={{ flex: 1, height: 44 }} onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, height: 44, fontWeight: 700 }}
              onClick={() =>
                onSave({
                  id: order.id,
                  quantity: qty,
                  sellingPrice,
                  shipmentCost,
                  extraCharges,
                  clientName,
                  date,
                  size: order.size ?? null,
                  color: order.color ?? null,
                  sizeQuantities: order.sizeQuantities ?? null,
                  colorQuantities: order.colorQuantities ?? null,
                  variantQuantities: order.variantQuantities ?? null,
                })
              }
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function DirectSalesPage({ user, onLogin }: PageProps) {
  const { toast, confirmDialog, showProcessing, hideProcessing } = usePopup();
  const [data, setData] = useState<{ inventory: InventoryItem[]; orders: any[] }>({ inventory: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [search, setSearch] = useState("");
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [returningOrder, setReturningOrder] = useState<any | null>(null);
  const [refundingOrder, setRefundingOrder] = useState<any | null>(null);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);

  const isSuperAdmin = !!user && user.role === "admin" && user.scope === "all";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, ordersRes] = await Promise.all([fetch("/api/inventory"), fetch("/api/orders")]);
      const invData = await invRes.json();
      const ordersData = await ordersRes.json();
      setData({
        inventory: invData.inventory || [],
        orders: (ordersData.orders || []).filter((o: any) => o.storeName === "Direct"),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    refresh();
  }, [user, isSuperAdmin, refresh]);

  if (!user) return <Login onLogin={onLogin} />;
  if (loading) return <div className="loading">Loading...</div>;
  if (!isSuperAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Access Denied — Super Admin only.</div>;
  }

  // ── KPIs ──────────────────────────────────────────────────────────
  const totalStock = data.inventory.reduce((s, i) => s + (Number(i.quantityAvailable) || 0), 0);
  const totalUnitsSold = data.orders.reduce((s, o) => s + effectiveQty(o), 0);
  const totalRevenue = data.orders.reduce((s, o) => s + effectiveRevenue(o), 0);
  const totalProfit = data.orders.reduce((s, o) => s + (Number(o.profit) || 0), 0);

  // ── Sales table ───────────────────────────────────────────────────
  const filteredOrders = data.orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (o.productName || "").toLowerCase().includes(q) ||
      (o.clientName || "").toLowerCase().includes(q) ||
      (o.orderCode || "").toLowerCase().includes(q)
    );
  });
  const sortedOrders = [...filteredOrders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // ── Cart inventory (warehouse stock mapped to the shape CartModal expects) ─
  const cartInventory = data.inventory
    .filter((i) => (Number(i.quantityAvailable) || 0) > 0)
    .map((i: any) => ({
      productId: i.productId,
      productName: i.productName,
      sizes: Array.isArray(i.size) ? i.size : i.size ? [i.size] : [],
      colors: Array.isArray(i.color) ? i.color : i.color ? [i.color] : [],
      quantityAvailable: i.quantityAvailable,
      sellingPrice: i.sellingPrice,
      sizeQuantitiesRemaining: i.sizeQuantities || null,
      colorQuantitiesRemaining: i.colorQuantities || null,
      variantQuantitiesRemaining: i.variantQuantities || null,
    }));

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSaveEdit = async (payload: any) => {
    showProcessing("Updating sale...");
    try {
      const res = await fetch("/api/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: payload.id,
          quantity: payload.quantity,
          sellingPrice: payload.sellingPrice,
          shipmentCost: payload.shipmentCost,
          extraCharges: payload.extraCharges || 0,
          clientName: payload.clientName,
          occurredAt: payload.date,
          size: payload.size,
          color: payload.color,
          sizeQuantities: payload.sizeQuantities,
          colorQuantities: payload.colorQuantities,
          variantQuantities: payload.variantQuantities,
        }),
      });
      const result = await res.json();
      if (!res.ok) toast.error(result.error || "Failed to update sale");
      else {
        toast.success("✅ Sale updated");
        setEditingOrder(null);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to update sale");
    } finally {
      hideProcessing();
      refresh();
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog("Delete this sale? Warehouse stock will be restored and the record permanently removed."))) return;
    showProcessing("Deleting sale...");
    try {
      const res = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await res.json();
      if (!res.ok) toast.error(result.error || "Failed to delete sale");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete sale");
    } finally {
      hideProcessing();
      refresh();
    }
  };

  const handleReturn = async (payload: any) => {
    showProcessing("Processing return...");
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isReturn: true, ...payload }),
      });
      const result = await res.json();
      if (!res.ok) toast.error(result.error || "Failed to process return");
      else toast.success("✅ Order marked as returned");
    } catch (e: any) {
      toast.error(e?.message || "Failed to process return");
    } finally {
      hideProcessing();
      setReturningOrder(null);
      refresh();
    }
  };

  const handleRefund = async (payload: any) => {
    showProcessing("Processing refund...");
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRefund: true, ...payload }),
      });
      const result = await res.json();
      if (!res.ok) toast.error(result.error || "Failed to process refund");
      else toast.success(`💸 Refund processed — ${Rs(result.refundAmount || 0)} issued`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to process refund");
    } finally {
      hideProcessing();
      setRefundingOrder(null);
      refresh();
    }
  };

  const handleUndoReturn = async (id: string) => {
    showProcessing("Undoing return...");
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isUndoReturn: true, id }),
      });
      const result = await res.json();
      if (!res.ok) toast.error(result.error || "Failed to undo return");
      else toast.success("↩ Return undone");
    } catch (e: any) {
      toast.error(e?.message || "Failed to undo return");
    } finally {
      hideProcessing();
      refresh();
    }
  };

  const handleUndoRefund = async (id: string) => {
    showProcessing("Undoing refund...");
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isUndoRefund: true, id }),
      });
      const result = await res.json();
      if (!res.ok) toast.error(result.error || "Failed to undo refund");
      else toast.success("↩ Refund undone");
    } catch (e: any) {
      toast.error(e?.message || "Failed to undo refund");
    } finally {
      hideProcessing();
      refresh();
    }
  };

  return (
    <>
      <div className="direct-sales-page">
        <header className="page-header">
          <div className="header-content">
            <div className="header-titles">
              <h1 className="main-title">Direct Sales</h1>
              <p className="subtitle">Sales made directly by the owner from the main warehouse — no store partner involved</p>
            </div>
          </div>
        </header>

        <section className="kpi-grid">
          <div className="kpi-card blue">
            <div className="kpi-icon">{IC.warehouse}</div>
            <div className="kpi-label">Warehouse Stock</div>
            <div className="kpi-value">{totalStock.toLocaleString()}</div>
            <div className="kpi-trend">Units available</div>
          </div>
          <div className="kpi-card purple">
            <div className="kpi-icon">{IC.receipt}</div>
            <div className="kpi-label">Units Sold Direct</div>
            <div className="kpi-value">{totalUnitsSold.toLocaleString()}</div>
            <div className="kpi-trend">{data.orders.length} order{data.orders.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="kpi-card green">
            <div className="kpi-icon">{IC.wallet}</div>
            <div className="kpi-label">Direct Revenue</div>
            <div className="kpi-value">{Rs(totalRevenue)}</div>
            <div className="kpi-trend">Gross sales</div>
          </div>
          <div className="kpi-card orange">
            <div className="kpi-icon">{IC.profit}</div>
            <div className="kpi-label">Direct Profit</div>
            <div className={`kpi-value ${totalProfit < 0 ? "negative" : ""}`}>{totalProfit < 0 ? `-${Rs(Math.abs(totalProfit))}` : Rs(totalProfit)}</div>
            <div className="kpi-trend">100% owner's — no commission</div>
          </div>
        </section>

        <SectionCard
          title="Direct Sales History"
          icon={IC.receipt}
          action={
            <button className="btn btn-primary" onClick={() => setShowSaleModal(true)}>
              + Record Direct Sale
            </button>
          }
        >
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by item, customer, or order code…"
            resultCount={filteredOrders.length}
          />
          <div className="table-wrap">
            <table className="desktop-table-view">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Date</th>
                  <th>Item Name</th>
                  <th>Qty</th>
                  <th>Total Price</th>
                  <th>Deductions</th>
                  <th>Cost Price</th>
                  <th>Profit</th>
                  <th>Customer</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: 40 }} className="text-muted">
                      {search ? "No sales match your search." : "No direct sales recorded yet."}
                    </td>
                  </tr>
                ) : (
                  sortedOrders.map((o) => {
                    const soldQty = Number(o.quantity) || 0;
                    const returnedQty = Math.min(Number(o.returnQuantity) || 0, soldQty);
                    const refundedQty = Math.min(Number(o.refundQuantity) || 0, soldQty - returnedQty);
                    const fullyReturned = returnedQty > 0 ? returnedQty >= soldQty : Boolean(o.orderReturned);
                    const fullyRefunded = refundedQty > 0 && refundedQty >= soldQty - returnedQty;
                    const remainingQty = soldQty - returnedQty - refundedQty;
                    const isLocked = Boolean(o.orderReturned && o.restockedFromOrderId != null);
                    const eQty = effectiveQty(o);
                    const gross = (o.sellingPrice || 0) * eQty;
                    const deductions = o.shipmentCost || 0;
                    const totalCost = (o.costPrice || 0) * eQty;

                    return (
                      <tr key={o.id} style={{ opacity: returnedQty > 0 || refundedQty > 0 ? 0.65 : 1 }}>
                        <td style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 11, color: "var(--pri-600)", whiteSpace: "nowrap" }}>
                          {o.orderCode || String(o.id).slice(0, 8)}
                        </td>
                        <td className="text-muted" style={{ fontSize: "0.75rem" }}>
                          {new Date(o.date).toLocaleDateString()}
                          {fullyReturned ? (
                            <div style={{ color: "var(--danger)", fontWeight: 800, fontSize: 9, marginTop: 2 }}>RETURNED</div>
                          ) : fullyRefunded ? (
                            <div style={{ color: "var(--danger)", fontWeight: 800, fontSize: 9, marginTop: 2 }}>REFUNDED</div>
                          ) : returnedQty > 0 || refundedQty > 0 ? (
                            <div style={{ color: "#d97706", fontWeight: 800, fontSize: 9, marginTop: 2 }}>PARTIAL</div>
                          ) : null}
                        </td>
                        <td className="font-bold">
                          {o.productName}
                          <div className="muted" style={{ fontWeight: 600, fontFamily: "monospace", fontSize: 10 }}>
                            {formatItemCode(o.batchNumber || o.id)}
                          </div>
                        </td>
                        <td>{soldQty}{returnedQty > 0 && <span style={{ color: "#d97706", fontWeight: 700 }}> ↩{returnedQty}</span>}{refundedQty > 0 && <span style={{ color: "var(--danger)", fontWeight: 700 }}> 💸{refundedQty}</span>}</td>
                        <td className="font-bold">{Rs(gross)}</td>
                        <td style={{ color: "var(--danger)", fontWeight: 600 }}>-{Rs(deductions)}</td>
                        <td className="text-muted">{Rs(totalCost)}</td>
                        <td className="font-bold" style={{ color: "var(--success)", fontSize: "1.05rem" }}>{Rs(o.profit)}</td>
                        <td className="text-muted">{o.clientName || "—"}</td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                            {isLocked ? (
                              <span className="badge badge-pending" style={{ fontSize: 9, opacity: 0.75 }}>Locked (re-stocked)</span>
                            ) : (
                              <>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, padding: "4px 10px", background: "rgba(99,102,241,0.1)", color: "#4f46e5", border: "1.5px solid rgba(99,102,241,0.25)" }}
                                  onClick={() => setEditingOrder(o)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, padding: "4px 10px", background: "rgba(16,185,129,0.1)", color: "#059669", border: "1.5px solid rgba(16,185,129,0.25)" }}
                                  onClick={() => setDetailOrder(o)}
                                >
                                  Detail
                                </button>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, padding: "4px 10px", background: "rgba(239,68,68,0.09)", color: "#dc2626", border: "1.5px solid rgba(239,68,68,0.22)" }}
                                  onClick={() => handleDelete(o.id)}
                                >
                                  Delete
                                </button>
                                {returnedQty > 0 && (
                                  <button
                                    className="btn btn-sm"
                                    style={{ fontSize: 11, padding: "4px 10px", background: "rgba(107,114,128,0.1)", color: "#4b5563", border: "1.5px solid rgba(107,114,128,0.22)" }}
                                    onClick={async () => { if (await confirmDialog("Undo this return? The sale will be restored and warehouse stock deducted again.")) handleUndoReturn(o.id); }}
                                  >
                                    Undo Return
                                  </button>
                                )}
                                {refundedQty > 0 && (
                                  <button
                                    className="btn btn-sm"
                                    style={{ fontSize: 11, padding: "4px 10px", background: "rgba(107,114,128,0.1)", color: "#4b5563", border: "1.5px solid rgba(107,114,128,0.22)" }}
                                    onClick={async () => { if (await confirmDialog("Undo this refund? The sale financials will be restored.")) handleUndoRefund(o.id); }}
                                  >
                                    Undo Refund
                                  </button>
                                )}
                                {!fullyReturned && !fullyRefunded && remainingQty > 0 && (
                                  <>
                                    <button
                                      className="btn btn-sm"
                                      style={{ fontSize: 11, padding: "4px 10px", background: "rgba(245,158,11,0.1)", color: "#b45309", border: "1.5px solid rgba(245,158,11,0.28)" }}
                                      onClick={() => setReturningOrder(o)}
                                    >
                                      Return
                                    </button>
                                    <button
                                      className="btn btn-sm"
                                      style={{ fontSize: 11, padding: "4px 10px", background: "rgba(220,38,38,0.09)", color: "#b91c1c", border: "1.5px solid rgba(220,38,38,0.22)" }}
                                      onClick={() => setRefundingOrder(o)}
                                    >
                                      Refund
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* ── Mobile card view ── */}
            <div className="mobile-card-view">
              {sortedOrders.length === 0 ? (
                <div style={{ textAlign: "center", padding: 32 }} className="text-muted">
                  {search ? "No sales match your search." : "No direct sales recorded yet."}
                </div>
              ) : (
                sortedOrders.map((o) => {
                  const soldQty = Number(o.quantity) || 0;
                  const returnedQty = Math.min(Number(o.returnQuantity) || 0, soldQty);
                  const refundedQty = Math.min(Number(o.refundQuantity) || 0, soldQty - returnedQty);
                  const fullyReturned = returnedQty > 0 ? returnedQty >= soldQty : Boolean(o.orderReturned);
                  const fullyRefunded = refundedQty > 0 && refundedQty >= soldQty - returnedQty;
                  const remainingQty = soldQty - returnedQty - refundedQty;
                  const isLocked = Boolean(o.orderReturned && o.restockedFromOrderId != null);
                  const eQty = effectiveQty(o);
                  const gross = (o.sellingPrice || 0) * eQty;

                  return (
                    <div className="mobile-card" key={o.id}>
                      <div className="mobile-card-header">
                        <span className="mobile-card-title">{o.productName}</span>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--pri-600)", fontWeight: 700 }}>{o.orderCode || String(o.id).slice(0, 8)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Date</span>
                        <span className="mobile-card-value">{new Date(o.date).toLocaleDateString()}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Qty</span>
                        <span className="mobile-card-value">{soldQty}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Total</span>
                        <span className="mobile-card-value font-bold">{Rs(gross)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Profit</span>
                        <span className="mobile-card-value font-bold" style={{ color: "var(--success)" }}>{Rs(o.profit)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Customer</span>
                        <span className="mobile-card-value text-muted">{o.clientName || "—"}</span>
                      </div>
                      <div className="mobile-card-actions">
                        {isLocked ? (
                          <span className="badge badge-pending" style={{ fontSize: 9, opacity: 0.75 }}>Locked (re-stocked)</span>
                        ) : (
                          <>
                            <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 10px", background: "rgba(99,102,241,0.1)", color: "#4f46e5", border: "1.5px solid rgba(99,102,241,0.25)" }} onClick={() => setEditingOrder(o)}>Edit</button>
                            <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 10px", background: "rgba(16,185,129,0.1)", color: "#059669", border: "1.5px solid rgba(16,185,129,0.25)" }} onClick={() => setDetailOrder(o)}>Detail</button>
                            <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 10px", background: "rgba(239,68,68,0.09)", color: "#dc2626", border: "1.5px solid rgba(239,68,68,0.22)" }} onClick={() => handleDelete(o.id)}>Delete</button>
                            {!fullyReturned && !fullyRefunded && remainingQty > 0 && (
                              <>
                                <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 10px", background: "rgba(245,158,11,0.1)", color: "#b45309", border: "1.5px solid rgba(245,158,11,0.28)" }} onClick={() => setReturningOrder(o)}>Return</button>
                                <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 10px", background: "rgba(220,38,38,0.09)", color: "#b91c1c", border: "1.5px solid rgba(220,38,38,0.22)" }} onClick={() => setRefundingOrder(o)}>Refund</button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {showSaleModal && (
        <CartModal
          inventory={cartInventory as any}
          storeName="Direct"
          isAdmin={true}
          storeNames={["Direct"]}
          onAdd={() => refresh()}
          onClose={() => setShowSaleModal(false)}
        />
      )}

      {editingOrder && (
        <EditDirectSaleModal order={editingOrder} onSave={handleSaveEdit} onClose={() => setEditingOrder(null)} />
      )}

      {returningOrder && (
        <SaleReturnModal
          order={{
            id: returningOrder.id,
            productName: returningOrder.productName || "",
            storeName: returningOrder.storeName || "",
            quantity: returningOrder.quantity || 1,
            sizeQuantities: returningOrder.sizeQuantities ?? null,
            colorQuantities: returningOrder.colorQuantities ?? null,
            variantQuantities: returningOrder.variantQuantities ?? null,
            returnQuantity: returningOrder.returnQuantity ?? null,
            returnSizeQuantities: returningOrder.returnSizeQuantities ?? null,
            returnColorQuantities: returningOrder.returnColorQuantities ?? null,
            returnVariantQuantities: returningOrder.returnVariantQuantities ?? null,
            storeInventoryId: returningOrder.storeInventoryId ?? null,
          }}
          onConfirm={handleReturn}
          onClose={() => setReturningOrder(null)}
        />
      )}

      {refundingOrder && (
        <SaleRefundModal
          order={{
            id: refundingOrder.id,
            productName: refundingOrder.productName || "",
            storeName: refundingOrder.storeName || "",
            quantity: refundingOrder.quantity || 1,
            sellingPrice: refundingOrder.sellingPrice ?? 0,
            costPrice: refundingOrder.costPrice ?? 0,
            sizeQuantities: refundingOrder.sizeQuantities ?? null,
            colorQuantities: refundingOrder.colorQuantities ?? null,
            variantQuantities: refundingOrder.variantQuantities ?? null,
            returnQuantity: refundingOrder.returnQuantity ?? null,
            returnSizeQuantities: refundingOrder.returnSizeQuantities ?? null,
            returnColorQuantities: refundingOrder.returnColorQuantities ?? null,
            returnVariantQuantities: refundingOrder.returnVariantQuantities ?? null,
            refundQuantity: refundingOrder.refundQuantity ?? null,
            refundSizeQuantities: refundingOrder.refundSizeQuantities ?? null,
            refundColorQuantities: refundingOrder.refundColorQuantities ?? null,
            refundVariantQuantities: refundingOrder.refundVariantQuantities ?? null,
          }}
          onConfirm={handleRefund}
          onClose={() => setRefundingOrder(null)}
        />
      )}

      <DetailModal
        open={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        title={detailOrder ? `Order Details — ${detailOrder.orderCode || detailOrder.id}` : undefined}
        data={detailOrder || {}}
      />

      <style jsx>{`
        .direct-sales-page {
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
