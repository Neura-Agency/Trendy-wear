import { useEffect, useState, useCallback } from "react";
import Login from "../components/Login";
import SectionCard from "../components/SectionCard";
import { SaleModal } from "../components/Modals";
import { PageProps, Order, InventoryItem } from "../types";
import CustomSelect from "../components/CustomSelect";

const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();

// ── ISO week helper ────────────────────────────────────────────────
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ── Date filter ────────────────────────────────────────────────────
interface TableFilterProps {
  value: string;
  onChange: (value: string) => void;
}

function TableFilter({ value, onChange }: TableFilterProps) {
  const [mode, setMode] = useState<string>("All");
  const [weekDate, setWeekDate] = useState<Date | null>(null);
  const [monthDate, setMonthDate] = useState<Date | null>(null);

  const handleModeChange = (val: string) => {
    setMode(val);
    if (val === "Weekly") onChange("Weekly");
    else if (val === "Monthly") onChange("Monthly");
    else onChange("All");
  };

  const handleWeekChange = (date: Date | null) => {
    setWeekDate(date);
    if (date) {
      const year = date.getFullYear();
      const week = getISOWeek(date);
      onChange(`${year}-W${week.toString().padStart(2, "0")}`);
    } else {
      onChange("All");
    }
  };

  const handleMonthChange = (date: Date | null) => {
    setMonthDate(date);
    if (date) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      onChange(`${year}-${month}`);
    } else {
      onChange("All");
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ minWidth: 110 }}>
        <CustomSelect
          options={["All", "Weekly", "Monthly"]}
          value={mode}
          onChange={handleModeChange}
        />
      </div>
      {mode === "Weekly" && (
        <input
          type="week"
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: "0.85rem" }}
          onChange={(e) => {
            if (!e.target.value) { handleWeekChange(null); return; }
            const [y, w] = e.target.value.split("-W");
            const d = new Date(Number(y), 0, 1 + (Number(w) - 1) * 7);
            handleWeekChange(d);
          }}
        />
      )}
      {mode === "Monthly" && (
        <input
          type="month"
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: "0.85rem" }}
          onChange={(e) => {
            if (!e.target.value) { handleMonthChange(null); return; }
            const [y, m] = e.target.value.split("-");
            handleMonthChange(new Date(Number(y), Number(m) - 1, 1));
          }}
        />
      )}
    </div>
  );
}

// ── Order filter logic ─────────────────────────────────────────────
function getFiltered(ordList: Order[], filter: string): Order[] {
  const now = new Date();
  return ordList.filter((o: Order) => {
    const oDate = new Date(o.date);

    if (filter === "Weekly") {
      const day = now.getDay() || 7;
      const weekStart = new Date(now);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(now.getDate() - day + 1);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      return oDate >= weekStart && oDate < weekEnd;
    }
    if (filter === "Monthly") {
      return oDate.getFullYear() === now.getFullYear() && oDate.getMonth() === now.getMonth();
    }
    if (/^\d{4}-W\d{2}$/.test(filter)) {
      const [year, weekNum] = filter.split("-W");
      const firstDayOfYear = new Date(Date.UTC(Number(year), 0, 1));
      const daysOffset =
        (Number(weekNum) - 1) * 7 +
        (firstDayOfYear.getUTCDay() <= 4 ? 1 - firstDayOfYear.getUTCDay() : 8 - firstDayOfYear.getUTCDay());
      const weekStart = new Date(Date.UTC(Number(year), 0, 1 + daysOffset));
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
      return oDate >= weekStart && oDate < weekEnd;
    }
    if (/^\d{4}-\d{2}$/.test(filter)) {
      const [y, m] = filter.split("-").map(Number);
      return oDate.getUTCFullYear() === y && oDate.getUTCMonth() + 1 === m;
    }
    return true;
  });
}

// ── Page ───────────────────────────────────────────────────────────
export default function DirectSalesPage({ user, onLogin }: PageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");
  const [showSaleModal, setShowSaleModal] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, invRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/inventory"),
      ]);
      const ordersData = await ordersRes.json();
      const invData = await invRes.json();
      const all: Order[] = ordersData.orders || [];
      setOrders(all.filter((o) => o.storeName === "Direct"));
      setInventory(invData.inventory || []);
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

  // Only superAdmin should access this page
  const isSuperAdmin = user.role === "admin" && user.scope === "all";
  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p className="text-muted" style={{ fontSize: "1.1rem" }}>Access denied. This page is for administrators only.</p>
      </div>
    );
  }

  if (loading) return <div className="loading">Loading...</div>;

  const filtered = getFiltered(orders, filter);

  // KPI calculations
  const totalRevenue   = filtered.reduce((acc, o) => acc + (o.sellingPrice * o.quantity), 0);
  const totalUnits     = filtered.reduce((acc, o) => acc + o.quantity, 0);
  const totalExpenses  = filtered.reduce((acc, o) => acc + (o.shipmentCost || 0), 0);
  const totalProfit    = filtered.reduce((acc, o) => acc + (o.profit || 0), 0);

  const handleAddOrder = async (order: any) => {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName:  order.productName,
          quantity:     order.quantity,
          extraQty:     order.extraQty || 0,
          sellingPrice: order.sellingPrice,
          shipmentCost: order.shipmentCost || 0,
          extraCharges: order.extraCharges || 0,
          clientName:   order.clientName || "",
          orderType:    order.type || "Sale",
          occurredAt:   order.occurredAt || new Date().toISOString(),
          storeName:    "Direct",
        }),
      });
      const result = await res.json();
      if (!res.ok) { alert(result.error || "Failed to save sale"); return; }
      alert(`✅ Sale recorded! Order code: ${result.orderCode}`);
      refresh();
    } catch (e: any) {
      alert(e?.message || "Failed to save sale");
    }
  };

  return (
    <div className="home-dashboard">
      {/* ── Page header ── */}
      <header className="page-header">
        <div className="header-content">
          <div className="header-titles">
            <h1 className="main-title">Direct Warehouse Sales</h1>
            <p className="subtitle">Sales made directly from the warehouse, not through any partner shop</p>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-primary"
              style={{ padding: "0.6rem 1.4rem", fontWeight: 700, fontSize: "0.95rem" }}
              onClick={() => setShowSaleModal(true)}
            >
              + Record Sale
            </button>
          </div>
        </div>
      </header>

      {/* ── KPI cards ── */}
      <section className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card purple">
          <div className="kpi-icon">💵</div>
          <div className="kpi-label">Total Received</div>
          <div className="kpi-value">{Rs(totalRevenue)}</div>
          <div className="kpi-trend">Gross sales amount</div>
        </div>

        <div className="kpi-card gray">
          <div className="kpi-icon">💸</div>
          <div className="kpi-label">Expenses</div>
          <div className="kpi-value negative">-{Rs(totalExpenses)}</div>
          <div className="kpi-trend">Total shipment costs</div>
        </div>

        <div className="kpi-card blue">
          <div className="kpi-icon">📈</div>
          <div className="kpi-label">Net Profit</div>
          <div className={`kpi-value ${totalProfit < 0 ? "negative" : ""}`}>
            {totalProfit < 0 ? `-${Rs(Math.abs(totalProfit))}` : Rs(totalProfit)}
          </div>
          <div className="kpi-trend">After all deductions</div>
        </div>

        <div className="kpi-card orange">
          <div className="kpi-icon">📦</div>
          <div className="kpi-label">Units Sold</div>
          <div className="kpi-value">{totalUnits}</div>
          <div className="kpi-trend">{filtered.length} order{filtered.length !== 1 ? "s" : ""}</div>
        </div>
      </section>

      {/* ── Sales table ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionCard
          title={`Direct Sales${filtered.length > 0 ? ` (${filtered.length})` : ""}`}
          icon="🏠"
          action={<TableFilter value={filter} onChange={setFilter} />}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item Name</th>
                  <th>Customer</th>
                  <th>Qty</th>
                  <th>Sale Price</th>
                  <th>Shipment</th>
                  <th>Total Recv.</th>
                  <th>After Partner's Cut</th>
                  <th style={{ textAlign: "right" }}>Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map((o, idx) => (
                  <tr key={idx}>
                    <td className="text-muted">{new Date(o.date).toLocaleDateString()}</td>
                    <td className="font-bold">{o.productName}</td>
                    <td className="text-muted">{o.clientName || "—"}</td>
                    <td>{o.quantity}</td>
                    <td>{Rs(o.sellingPrice)}</td>
                    <td className="text-muted">{o.shipmentCost ? Rs(o.shipmentCost) : "—"}</td>
                    <td className="font-bold">{Rs(o.sellingPrice * o.quantity)}</td>
                    <td className="text-muted">{o.adminTake ? Rs(o.adminTake) : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: "var(--success)" }}>
                      {Rs(o.profit)}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 40 }} className="text-muted">
                      No direct warehouse sales for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* ── Sale Modal ── */}
      {showSaleModal && (
        <SaleModal
          inventory={inventory.map((item) => ({
            productName: item.productName,
            quantityAvailable: item.quantityAvailable,
            sellingPrice: item.sellingPrice ?? 0,
          }))}
          storeName="Direct"
          isAdmin={true}
          storeNames={["Direct"]}
          onAdd={handleAddOrder}
          onClose={() => setShowSaleModal(false)}
        />
      )}
    </div>
  );
}
