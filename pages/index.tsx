import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
// DatePicker removed
import Login from "../components/Login";
import WeekMonthPicker from '../components/WeekMonthPicker';
import SectionCard from "../components/SectionCard";
import Badge from "../components/Badge";
import { SaleModal, CreateStoreModal, ReportModal } from "../components/Modals";
import { AddExpenseForm } from '../components/Forms';
import CustomSelect from "../components/CustomSelect";
import { User, Order, Store, InventoryItem, Expense, Client, StoreInventoryItem, AppData, PageProps } from "../types";

// Helpers
const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();

interface TableFilterProps {
  value: string;
  onChange: (value: string) => void;
}

function TableFilter({ value, onChange }: TableFilterProps) {
  const [mode, setMode] = useState<string>('Weekly');
  const [weekDate, setWeekDate] = useState<Date | null>(null);
  const [monthDate, setMonthDate] = useState<Date | null>(null);

  // Handle dropdown change
  const handleModeChange = (val: string) => {
    setMode(val);
    if (val === 'Weekly') onChange('Weekly');
    if (val === 'Monthly') onChange('Monthly');
  };

  // Handle week pick
  const handleWeekChange = (date: Date | null) => {
    setWeekDate(date);
    if (date) {
      const year = date.getFullYear();
      const week = getISOWeek(date);
      onChange(`${year}-W${week.toString().padStart(2, '0')}`);
    } else {
      onChange('All');
    }
  };

  // Handle month pick
  const handleMonthChange = (date: Date | null) => {
    setMonthDate(date);
    if (date) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      onChange(`${year}-${month}`);
    } else {
      onChange('All');
    }
  };

  // Helper to get ISO week number
  function getISOWeek(date: Date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  return (
    <div className="table-filter-wrap" style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--surface-2)', padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
      <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Filter:</span>
      <div style={{ width: 140 }}>
        <CustomSelect 
          value={mode} 
          onChange={handleModeChange} 
          options={[{ id: 'Weekly', label: 'By Week' }, { id: 'Monthly', label: 'By Month' }]} 
          height="36px"
        />
      </div>
      {mode === 'Weekly' && (
        <WeekMonthPicker mode="Weekly" value={weekDate} onChange={(v) => handleWeekChange(v ? new Date(v) : null)} />
      )}
      {mode === 'Monthly' && (
        <WeekMonthPicker mode="Monthly" value={monthDate} onChange={(v) => handleMonthChange(v ? new Date(v) : null)} />
      )}
    </div>
  );
}
// Premium Inline Editor for Commission/Values
function InlineCommEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  if (!editing) return (
    <span
      className="inline-edit-trigger"
      onClick={() => setEditing(true)}
      style={{
        cursor: 'pointer',
        color: 'var(--acc)',
        fontWeight: 700,
        textDecoration: 'underline dotted',
        padding: '2px 4px',
        borderRadius: '4px',
        transition: 'all 0.2s'
      }}
      onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(24,144,255,0.1)'; }}
      onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {value}%
    </span>
  );

  return (
    <div className="inline-edit-box" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        autoFocus
        style={{ width: 64, height: 32, padding: '4px 8px', fontSize: '13px' }}
      />
      <button
        className="btn btn-primary"
        style={{ width: 28, height: 28, padding: 0, background: 'var(--success)', borderColor: 'var(--success)' }}
        onClick={() => { onSave(val); setEditing(false); }}
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

// ─── STORES OVERVIEW SECTION (Reworked for Table View) ───────────────
function StoresOverviewSection({ stores, orders, storeInventory, filter, getFiltered, onMarkPaid, onCommissionChange, onAssignItem, inventory }) {
  const storeNames = Object.keys(stores);
  const [selected, setSelected] = useState(storeNames[0] || "");

  useEffect(() => {
    if (!selected && storeNames.length > 0) setSelected(storeNames[0]);
  }, [storeNames, selected]);

  if (storeNames.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No shop partners added yet.</div>;

  const name = selected;
  const s = stores[name];
  if (!s) return null;

  const getCategory = (prodName) => inventory.find(i => i.productName === prodName)?.category || 'Other';

  const filteredOrders = getFiltered(orders, filter);
  const sOrders = filteredOrders.filter(o => o.storeName === name && o.includedInPayout !== false && o.type !== 'Gift');

  const categories = Array.from(new Set([
    ...sOrders.map(o => getCategory(o.productName)),
    ...Object.values(storeInventory[name] || {}).map(si => getCategory((si as StoreInventoryItem).productName))
  ]));

  return (
    <div className="store-selector-view">
      <div style={{ marginBottom: 24 }}>
        <CustomSelect
          label="Select Store Partner"
          value={selected}
          options={storeNames}
          onChange={setSelected}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product Catagory</th>
              <th>Payout</th>
              <th>Items Sold</th>
              <th>Leftover Inventory</th>
              <th>Expenses</th>
              <th>Partner's Cut</th>
              <th>Profit</th>
              <th style={{ textAlign: 'right' }}>Payment Status</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>No inventory or sales for this partner.</td></tr>
            ) : (
              categories.map(cat => {
                const catOrders = sOrders.filter(o => getCategory(o.productName) === cat);
                const catInventory = Object.values(storeInventory[name] || {}).filter(si => getCategory((si as StoreInventoryItem).productName) === cat);
                
                const payout = catOrders.reduce((acc, o) => acc + (o.sellingPrice * o.quantity - o.shipmentCost), 0);
                const itemsSold = catOrders.reduce((acc, o) => acc + o.quantity, 0);
                const leftover = catInventory.reduce((acc: number, si) => acc + ((si as StoreInventoryItem).quantityRemaining as number), 0) as number;
                const expenses = catOrders.reduce((acc, o) => acc + (o.shipmentCost || 0), 0);
                const partnerCut = catOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0);
                const profit = catOrders.reduce((acc, o) => acc + (o.profit || 0), 0);

                return (
                  <tr key={cat}>
                    <td className="font-bold">{cat}</td>
                    <td className="font-bold" style={{ color: 'var(--success)' }}>{Rs(payout)}</td>
                    <td>{itemsSold}</td>
                    <td className="font-bold" style={{ color: (leftover as number) > 0 ? 'inherit' : 'var(--danger)' }}>{leftover as number}</td>
                    <td style={{ color: 'var(--danger)' }}>{Rs(expenses)}</td>
                    <td style={{ fontWeight: 600 }}>{Rs(partnerCut)}</td>
                    <td className="font-bold" style={{ color: 'var(--acc)' }}>{Rs(profit)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge type={s.paid ? 'green' : 'blue'}>
                        {s.paid ? 'Paid' : 'Balance'}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        {sOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0) > 0 && !s.paid && (
          <button className="btn btn-primary" style={{ flex: 1, height: 48, background: 'var(--success)', borderColor: 'var(--success)' }} onClick={() => onMarkPaid(name, sOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0))}>
            Confirm & Mark as Fully Paid
          </button>
        )}
        <button className="btn btn-primary" style={{ flex: 1, height: 48 }} onClick={() => onAssignItem(name)}>
          Stock Management (Send Goods)
        </button>
      </div>
    </div>
  );
}

// ─── ORDERS SECTION ──────────────────────────────────────────────────
function OrdersSection({ orders, overallOrders = [], isAdmin, onCommissionEdit, onTogglePayout }) {
  const filteredQty = orders.reduce((s, o) => s + (o.quantity || 0), 0);
  const filteredGross = orders.reduce((s, o) => s + ((o.sellingPrice || 0) * (o.quantity || 0)), 0);
  const filteredShipping = orders.reduce((s, o) => s + (o.shipmentCost || 0), 0);
  const filteredProfit = orders.reduce((s, o) => s + (o.profit || 0), 0);

  const overallQty = (overallOrders || []).reduce((s, o) => s + (o.quantity || 0), 0);
  const overallGross = (overallOrders || []).reduce((s, o) => s + ((o.sellingPrice || 0) * (o.quantity || 0)), 0);
  const overallShipping = (overallOrders || []).reduce((s, o) => s + (o.shipmentCost || 0), 0);
  const overallProfit = (overallOrders || []).reduce((s, o) => s + (o.profit || 0), 0);

  return (
    <div>
      <div className="table-wrap">
        <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Store Name</th>
            <th>Product</th>
            <th>Quantity</th>
            <th>Total Price</th>
            <th>Delivery Fee</th>
            <th>Amount Received</th>
            <th>Store Percentage</th>
            {isAdmin && (
              <>
                <th>Platform Fee</th>
                <th>Cost Price</th>
                <th>Profit</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {orders.map((o, idx) => {
            const gross = o.sellingPrice * o.quantity;
            const shipment = o.shipmentCost || 0;
            const netAmount = gross - shipment;
            const totalCost = (o.costPrice || 0) * o.quantity;
            return (
              <tr key={idx}>
                <td className="text-muted" style={{ fontSize: '0.75rem' }}>{new Date(o.date).toLocaleDateString()}</td>
                <td className="font-bold" style={{ color: 'var(--pri-700)' }}>{o.storeName}</td>
                <td className="font-bold">{o.productName}</td>
                <td>{o.quantity}</td>
                <td className="font-bold">{Rs(gross)}</td>
                <td style={{ color: 'var(--danger)', fontWeight: 600 }}>-{Rs(shipment)}</td>
                <td className="font-bold" style={{ color: 'var(--text-main)' }}>{Rs(netAmount)}</td>
                <td>
                  {isAdmin ? (
                    <InlineCommEdit value={o.commissionPercent} onSave={(v) => onCommissionEdit(o.id, v)} />
                  ) : (
                    <span className="font-bold">{o.commissionPercent}%</span>
                  )}
                  <div style={{ fontSize: '11px', color: isAdmin ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                    {isAdmin ? "-" : "+"}{Rs(o.commissionAmount)}
                  </div>
                </td>
                {isAdmin && (
                  <>
                    <td className="font-bold" style={{ color: 'var(--pri-600)' }}>{Rs(o.adminTake)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{Rs(totalCost)}</td>
                    <td className="font-bold" style={{ color: 'var(--success)', fontSize: '1.1rem' }}>{Rs(o.profit)}</td>
                  </>
                )}
              </tr>
            );
          })}
          {orders.length === 0 && <tr><td colSpan={isAdmin ? 11 : 8} style={{ textAlign: 'center', padding: 30 }}>No partner sales match this period.</td></tr>}
        </tbody>
      </table>
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
        <div style={{ fontWeight: 700 }}>
          Showing totals: Items: {filteredQty} — Gross: {Rs(filteredGross)} — Profit: {Rs(filteredProfit)}
        </div>
        <div style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
          All partners totals: Items: {overallQty} — Gross: {Rs(overallGross)} — Profit: {Rs(overallProfit)}
        </div>
      </div>
    </div>
  );
}

function DirectSalesSection({ orders }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Item Name</th>
            <th>Quantity</th>
            <th>Sale Price</th>
            <th>Total Recv.</th>
            <th style={{ textAlign: 'right' }}>Net Profit</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, idx) => (
            <tr key={idx}>
              <td className="text-muted">{new Date(o.date).toLocaleDateString()}</td>
              <td className="font-bold">{o.productName}</td>
              <td>{o.quantity}</td>
              <td>{Rs(o.sellingPrice)}</td>
              <td className="font-bold">{Rs(o.sellingPrice * o.quantity)}</td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>{Rs(o.profit)}</td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}>No direct warehouse sales yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ─── CLIENTS SECTION ────────────────────────────────────────────────
function ClientsSection({ clients }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Sales Count</th>
            <th>Still Owes</th>
          </tr>
        </thead>
        <tbody>
          {clients.map(c => {
            const totalVal = (c.orders || []).reduce((s, o) => s + (o.sellingPrice * o.quantity), 0);
            const due = totalVal - (c.paymentsReceived || 0);
            return (
              <tr key={c.id}>
                <td className="font-bold">{c.name}</td>
                <td className="text-muted">{c.phone}</td>
                <td>{c.orders?.length || 0}</td>
                <td className={due > 0 ? 'font-bold' : ''}>{Rs(due)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────
export default function Home({ user, onLogin }: PageProps) {
  const router = useRouter();
  const [data, setData] = useState<{
    orders: Order[];
    inventory: InventoryItem[];
    stores: Record<string, Store>;
    clients: Client[];
    expenses: Expense[];
    storeInventory: Record<string, Record<string, StoreInventoryItem>>;
    settings?: any;
  }>({
    orders: [],
    inventory: [],
    stores: {},
    clients: [],
    expenses: [],
    storeInventory: {},
  });
const [loading, setLoading] = useState<boolean>(true);

  // Modal states
  const [showSaleModal, setShowSaleModal] = useState<boolean>(false);
  const [showStoreModal, setShowStoreModal] = useState<boolean>(false);
  const [showReport, setShowReport] = useState<boolean>(false);
  const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false);
  const [reportData, setReportData] = useState<any>(null);
  const [partnerFilter, setPartnerFilter] = useState<string>('All');
  const [partnerStore, setPartnerStore] = useState<string>('All');
  const [directFilter, setDirectFilter] = useState<string>('All');
  const [kpiFilter, setKpiFilter] = useState<string>('All');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ord, exp, sto, cli, sinv] = await Promise.all([
        fetch("/api/orders").then((r) => r.json()),
        fetch("/api/expenses").then((r) => r.json()),
        fetch("/api/store").then((r) => r.json()),
        fetch("/api/clients").then((r) => r.json()),
        fetch("/api/storeInventory").then((r) => r.json()),
      ]);
      setData({
        orders: ord.orders || [],
        stores: { ...sto.stores },
        inventory: (await fetch("/api/purchases").then((r) => r.json())).inventory || [], // Fetch inventory separately
        expenses: exp.expenses || [],
        clients: cli.clients || [],
        settings: sto.settings || {},
        storeInventory: sinv.storeInventory || {},
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
    const es = new EventSource("/api/stream");
    es.onmessage = () => refresh();
    return () => es.close();
  }, [user, refresh]);

  if (!user) return <Login onLogin={onLogin} />;

  if (loading) return <div className="loading">Loading...</div>;

  const isAdmin = user.role === "admin";
  const isSuperAdmin = isAdmin && user.scope === 'all';

  const getFiltered = (ordList: Order[], filter: string): Order[] => {
    const now = new Date();
    return ordList.filter((o: Order) => {
      const oDate = new Date(o.date);

      // Professional weekly filter: ISO week (Monday-Sunday)
      if (filter === 'Weekly') {
        const day = now.getDay() || 7; // Sunday is 0, set to 7
        const weekStart = new Date(now);
        weekStart.setHours(0,0,0,0);
        weekStart.setDate(now.getDate() - day + 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        return oDate >= weekStart && oDate < weekEnd;
      }
      // Professional monthly filter: calendar month
      if (filter === 'Monthly') {
        return oDate.getFullYear() === now.getFullYear() && oDate.getMonth() === now.getMonth();
      }
      // Custom week (YYYY-Wxx)
      if (/^\d{4}-W\d{2}$/.test(filter)) {
        const [year, weekNum] = filter.split('-W');
        const firstDayOfYear = new Date(Date.UTC(Number(year), 0, 1));
        const daysOffset = ((Number(weekNum) - 1) * 7) + (firstDayOfYear.getUTCDay() <= 4 ? 1 - firstDayOfYear.getUTCDay() : 8 - firstDayOfYear.getUTCDay());
        const weekStart = new Date(Date.UTC(Number(year), 0, 1 + daysOffset));
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
        return oDate >= weekStart && oDate < weekEnd;
      }
      // Custom month (YYYY-MM)
      if (/^\d{4}-\d{2}$/.test(filter)) {
        const [y, m] = filter.split('-').map(Number);
        return oDate.getUTCFullYear() === y && (oDate.getUTCMonth() + 1) === m;
      }
      return true;
    });
  };

  const dashboardOrders = (() => {
    if (isSuperAdmin) return data.orders;
    if (isAdmin && user.managedStores?.length > 0) {
      return data.orders.filter(o => user.managedStores.includes(o.storeName));
    }
    if (user.role === 'store') return data.orders.filter(o => o.storeName === user.storeName);
    return [];
  })();

  const availableStores = (() => {
    if (isSuperAdmin) return data.stores;
    if (isAdmin) {
      const filtered = {};
      (user.managedStores || []).forEach(name => {
        if (data.stores[name]) filtered[name] = data.stores[name];
      });
      return filtered;
    }
    return {};
  })();

  const kpiOrders = getFiltered(dashboardOrders, kpiFilter);
  const partnerAll = getFiltered(dashboardOrders.filter(o => o.storeName !== 'Direct'), partnerFilter);
  const partnerOrders = partnerAll.filter(o => partnerStore === 'All' ? true : o.storeName === partnerStore);
  const directOrders = getFiltered(dashboardOrders.filter(o => o.storeName === 'Direct'), directFilter);

  // Stats calculation
  const totalGross = kpiOrders.reduce((s, o) => s + (o.sellingPrice * o.quantity || 0), 0);
  const totalShipping = kpiOrders.reduce((s, o) => s + (o.shipmentCost || 0), 0);
  const totalNetAmt = totalGross - totalShipping;
  const totalShopCut = kpiOrders.reduce((s, o) => s + (o.commissionAmount || 0), 0);
  const totalAdminTake = kpiOrders.reduce((s, o) => s + (o.adminTake || 0), 0);
  const totalCostPrice = kpiOrders.reduce((s, o) => s + ((o.costPrice || 0) * (o.quantity || 1)), 0);
  const totalNetProfit = kpiOrders.reduce((s, o) => s + (o.profit || 0), 0);
  const lowStock = data.inventory.filter(i => i.quantityAvailable <= (i.lowStockWarning || 5)).length;
  const ordersCount = kpiOrders.length;

  const handleAddOrder = async (order: Partial<Order>) => {
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    refresh();
  };

  const handleCreateStore = async (store: { name: string; partnerName: string; commission: number; storeId: string }) => {
    await fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: 'create',
        storeName: store.name,
        partnerName: store.partnerName,
        storeId: store.storeId,
        commission: store.commission
      }),
    });
    refresh();
  };

  const handleAddExpense = async (expense: Partial<Expense>) => {
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expense),
    });
    refresh();
  };

  const handleMarkPaid = (storeName: string, amount: number) => {
    fetch("/api/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeName, amount }),
    }).then(() => refresh());
  };

  return (
    <>
      <div className="home-dashboard">
        <header className="page-header">
          <div className="header-content">
            <div className="header-titles">
              <h1 className="main-title">Main Hub</h1>
              <p className="subtitle">Welcome back, <span className="highlight">{user.username}</span></p>
            </div>
            
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={() => {
                let ordersForReport = kpiOrders;
                let storesForReport = data.stores || {};
                if (!isSuperAdmin) {
                  if (isAdmin) {
                    const managed = user.managedStores || [];
                    const filteredStores = {};
                    managed.forEach(name => { if (data.stores[name]) filteredStores[name] = data.stores[name]; });
                    storesForReport = filteredStores;
                    ordersForReport = kpiOrders.filter(o => managed.includes(o.storeName));
                  } else if (user.role === 'store') {
                    storesForReport = { [user.storeName]: data.stores[user.storeName] };
                    ordersForReport = kpiOrders.filter(o => o.storeName === user.storeName);
                  }
                }
                setReportData({ ...data, orders: ordersForReport, stores: storesForReport });
                setShowReport(true);
              }}>
                <span style={{ marginRight: '8px' }}>📄</span> Generate Report
              </button>
              <TableFilter value={kpiFilter} onChange={setKpiFilter} />
            </div>
          </div>
          
        </header>

        <section className="kpi-grid">
          <div className="kpi-card purple">
            <div className="kpi-icon">💵</div>
            <div className="kpi-label">Payout</div>
            <div className="kpi-value">{Rs(totalNetAmt)}</div>
            <div className="kpi-trend">Overall Earnings</div>
          </div>

          <div className="kpi-card gray">
            <div className="kpi-icon">📦</div>
            <div className="kpi-label">Base Cost</div>
            <div className="kpi-value negative">-{Rs(totalCostPrice)}</div>
            <div className="kpi-trend">Product Expenses</div>
          </div>

          <div className="kpi-card red">
            <div className="kpi-icon">🚚</div>
            <div className="kpi-label">Shipping Cost</div>
            <div className="kpi-value negative">-{Rs(totalShipping)}</div>
            <div className="kpi-trend">Logistics Cost</div>
          </div>

          <div className="kpi-card orange">
            <div className="kpi-icon">🤝</div>
            <div className="kpi-label">Store Charges</div>
            <div className="kpi-value negative">-{Rs(totalShopCut)}</div>
            <div className="kpi-trend">Partner Fees</div>
          </div>

          <div className="kpi-card blue">
            <div className="kpi-icon">🏦</div>
            <div className="kpi-label">Partner's Cut</div>
            <div className="kpi-value negative">-{Rs(totalAdminTake)}</div>
            <div className="kpi-trend">Admin Allocation</div>
          </div>
        </section>

        {isAdmin && Object.keys(availableStores).length > 0 && (
          <SectionCard 
            title="Store Partners" 
            icon="🏪"
            action={<button className="btn btn-primary" onClick={() => setShowStoreModal(true)}>+ Create Store Partner</button>}
          >
            <StoresOverviewSection
              stores={availableStores}
              orders={data.orders}
              storeInventory={data.storeInventory}
              inventory={data.inventory}
              filter={kpiFilter}
              getFiltered={getFiltered}
              onMarkPaid={handleMarkPaid}
              onCommissionChange={(name, v) => fetch("/api/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storeName: name, commission: v }),
              }).then(() => refresh())}
              onAssignItem={(name) => router.push(`/inventory?assign=${name}`)}
            />
          </SectionCard>
        )}

        <div className="vertical-stack" style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 32 }}>
          <SectionCard
            title={isAdmin ? "Partner Store Sales" : "Sales History"}
            icon="🤝"
            action={
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <TableFilter value={partnerFilter} onChange={setPartnerFilter} />
                <div style={{ width: 140 }}>
                  <CustomSelect 
                    value={partnerStore} 
                    onChange={setPartnerStore} 
                    options={['All', ...Object.keys(availableStores)]} 
                    height="36px"
                  />
                </div>
              </div>
            }
          >
            <OrdersSection
              orders={partnerOrders.slice(-20).reverse()}
              overallOrders={partnerAll}
              isAdmin={isAdmin}
              onCommissionEdit={(id, v) => fetch("/api/orders", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, commissionPercent: v }),
              }).then(() => refresh())}
              onTogglePayout={(id, inc) => fetch("/api/orders", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, includedInPayout: inc }),
              }).then(() => refresh())}
            />
          </SectionCard>

          {isSuperAdmin && (
            <SectionCard
              title="Direct Warehouse Sales"
              icon="🏠"
              action={<TableFilter value={directFilter} onChange={setDirectFilter} />}
            >
              <DirectSalesSection
                orders={directOrders.slice(-20).reverse()}
              />
            </SectionCard>
          )}
        </div>

        {isAdmin && (
          <div className="grid-2-dynamic" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, marginBottom: 32 }}>
            {/* VIP Customers table removed as requested */}
            <SectionCard title="Expenses (Money Spent)" icon="📉" action={
              <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={() => setShowExpenseModal(true)}>+ Add Expense</button>
            }>
              <div className="table-wrap">
                <table style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.slice(-5).reverse().map((e, i) => (
                      <tr key={i}>
                        <td className="text-muted">{e.title}</td>
                        <td className="text-muted">{e.category || '-'}</td>
                        <td className="font-bold" style={{ textAlign: 'right' }}>{Rs(e.amount)}</td>
                      </tr>
                    ))}
                    {data.expenses.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: 20 }}>No costs recorded.</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        )}

        {showSaleModal && (
          <SaleModal
            inventory={isAdmin ? data.inventory : Object.values(data.storeInventory[user.storeName] || {}).map(si => ({
              productName: si.productName,
              quantityAvailable: si.quantityRemaining,
              sellingPrice: si.storeSellingPrice
            }))}
            storeName={user.storeName}
            isAdmin={isAdmin}
            storeNames={isAdmin && user.scope === 'all' ? Object.keys(data.stores) : (isAdmin ? (user.managedStores || []) : [user.storeName])}
            onAdd={handleAddOrder}
            onClose={() => setShowSaleModal(false)}
          />
        )}

        {showStoreModal && (
          <CreateStoreModal
            onSave={handleCreateStore}
            onClose={() => setShowStoreModal(false)}
          />
        )}
        {showExpenseModal && (
          <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '640px' }}>
              <div className="modal-head" style={{ padding: '12px 20px' }}>
                <h3 style={{ fontSize: '16px' }}>Add Expense</h3>
                <button className="btn btn-sm" onClick={() => setShowExpenseModal(false)} style={{ border: 'none', fontSize: '16px' }}>✕</button>
              </div>
              <div className="modal-body" style={{ padding: 20 }}>
                <AddExpenseForm onAdd={(e) => { handleAddExpense(e); setShowExpenseModal(false); }} />
              </div>
            </div>
          </div>
        )}
        {showReport && (
          <ReportModal
            data={reportData || { ...data, orders: kpiOrders }}
            onClose={() => { setShowReport(false); setReportData(null); }}
          />
        )}
      </div>

      <style jsx>{`
        .home-dashboard { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .text-acc { color: var(--acc); }
      `}</style>
    </>
  );
}
