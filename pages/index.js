import { useEffect, useState, useCallback } from "react";
// DatePicker removed
import Login from "../components/Login";
import WeekMonthPicker from '../components/WeekMonthPicker';
import Layout from "../components/Layout";
import SectionCard from "../components/SectionCard";
import Badge from "../components/Badge";
import { SaleModal, CreateStoreModal, ReportModal } from "../components/Modals";
import { AddExpenseForm } from '../components/Forms';

// Helpers
const Rs = (n) => "Rs " + (Number(n) || 0).toLocaleString();

function TableFilter({ value, onChange }) {
  const [mode, setMode] = useState('Weekly');
  const [weekDate, setWeekDate] = useState(null);
  const [monthDate, setMonthDate] = useState(null);

  // Handle dropdown change
  const handleModeChange = (e) => {
    setMode(e.target.value);
    if (e.target.value === 'Weekly') onChange('Weekly');
    if (e.target.value === 'Monthly') onChange('Monthly');
  };

  // Handle week pick
  const handleWeekChange = (date) => {
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
  const handleMonthChange = (date) => {
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
  function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f8fafc', padding: '8px 16px', borderRadius: 8 }}>
      <span style={{ fontWeight: 700, fontSize: '13px', color: '#222' }}>Filter:</span>
      <select value={mode} onChange={handleModeChange} style={{ height: 36, padding: '0 12px', fontSize: '13px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
        <option value="Weekly">By Week</option>
        <option value="Monthly">By Month</option>
      </select>
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
      onMouseOver={(e) => e.target.style.background = 'rgba(24,144,255,0.1)'}
      onMouseOut={(e) => e.target.style.background = 'transparent'}
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

// ─── STORES OVERVIEW SECTION (Refactored for Single Selection) ───────
// ─── STORES OVERVIEW SECTION (Refactored for Single Selection) ───────
function StoresOverviewSection({ stores, orders, storeInventory, filter, getFiltered, onMarkPaid, onCommissionChange, onAssignItem }) {
  const storeNames = Object.keys(stores);
  const [selected, setSelected] = useState(storeNames[0] || "");

  // Update selection if storeNames changes and current selection is invalid
  useEffect(() => {
    if (!selected && storeNames.length > 0) setSelected(storeNames[0]);
  }, [storeNames, selected]);

  if (storeNames.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No shop partners added yet.</div>;

  const name = selected;
  const s = stores[name];
  if (!s) return null;

  // Apply the same filter as the main dashboard
  const filteredOrders = getFiltered(orders, filter);

  const sOrders = filteredOrders.filter(o => o.storeName === name && o.includedInPayout !== false && o.type !== 'Gift');
  const totalSales = sOrders.reduce((acc, o) => acc + (o.sellingPrice * o.quantity || 0), 0);
  const totalShipping = sOrders.reduce((acc, o) => acc + (o.shipmentCost || 0), 0);
  const storeEarned = sOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0);
  const itemsAssigned = Object.keys(storeInventory[name] || {}).length;

  const totalStores = storeNames.length;
  const allStoresOrders = filteredOrders.filter(o => o.storeName !== 'Direct' && o.type !== 'Gift');
  const allStoresGross = allStoresOrders.reduce((acc, o) => acc + (o.sellingPrice * o.quantity || 0), 0);
  const allStoresShipping = allStoresOrders.reduce((acc, o) => acc + (o.shipmentCost || 0), 0);
  const allStoresNet = allStoresGross - allStoresShipping;

  return (
    <div className="store-selector-view">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>
            Select Shop Partner
          </label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{ height: 48, fontSize: '1rem', fontWeight: 600 }}
          >
            {storeNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={{ paddingTop: 24 }}>
          <Badge type={s.paid ? 'green' : 'blue'} style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
            {s.paid ? 'BALANCE PAID' : 'PAYMENT PENDING'}
          </Badge>
        </div>
      </div>

      <div className="store-detail-view" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, background: 'var(--surface-2)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
        <div className="detail-item">
          <div className="label" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Sales ({filter})</div>
          <div className="value" style={{ fontSize: '1.5rem', fontWeight: 800 }}>{Rs(totalSales)}</div>
        </div>

        <div className="detail-item">
          <div className="label" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Shipping ({filter})</div>
          <div className="value" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>-{Rs(totalShipping)}</div>
        </div>

        <div className="detail-item">
          <div className="label" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Earnings ({filter})</div>
          <div className="value" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>{Rs(storeEarned)}</div>
        </div>

        <div className="detail-item">
          <div className="label" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Active Stock Items</div>
          <div className="value" style={{ fontSize: '1.5rem', fontWeight: 800 }}>{itemsAssigned} Products</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        {storeEarned > 0 && !s.paid && (
          <button className="btn btn-primary" style={{ flex: 1, height: 48, background: 'var(--success)', borderColor: 'var(--success)' }} onClick={() => onMarkPaid(name, storeEarned)}>
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
          {orders.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30 }}>No direct warehouse sales yet.</td></tr>}
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
export default function Home() {

  const [user, setUser] = useState(null);
  const [data, setData] = useState({
    orders: [],
    inventory: [],
    stores: {},
    clients: [],
    expenses: [],
    storeInventory: {},
  });
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [partnerFilter, setPartnerFilter] = useState('All');
  const [partnerStore, setPartnerStore] = useState('All');
  const [directFilter, setDirectFilter] = useState('All');
  const [kpiFilter, setKpiFilter] = useState('All');

  const refresh = useCallback(async () => {
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
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
    const es = new EventSource("/api/stream");
    es.onmessage = () => refresh();
    return () => es.close();
  }, [user, refresh]);

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) return <Login onLogin={(u) => {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  }} />;

  const isAdmin = user.role === "admin";
  const isSuperAdmin = isAdmin && user.scope === 'all';

  const getFiltered = (ordList, filter) => {
    const now = new Date();
    return ordList.filter(o => {
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

  const handleAddOrder = async (order) => {
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    refresh();
  };

  const handleCreateStore = async (store) => {
    await fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: 'create',
        storeName: store.name,
        username: store.username,
        password: store.password,
        commission: store.commission
      }),
    });
    refresh();
  };

  const handleAddExpense = async (expense) => {
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expense),
    });
    refresh();
  };

  const handleMarkPaid = (storeName, amount) => {
    fetch("/api/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeName, amount }),
    }).then(() => refresh());
  };

  return (
    <Layout user={user} onLogout={() => {
      setUser(null);
      localStorage.removeItem('user');
    }}>
      <div className="home-dashboard">
        <header className="page-header" style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: 4 }}>
                Main Hub
              </h1>
              <p className="text-muted">Welcome back, <span className="font-bold">{user.username}</span></p>
            </div>
            <div style={{ marginLeft: 20 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button className="btn btn-glass" style={{ padding: '0.5rem 0.8rem', fontWeight: 700 }} onClick={() => {
                    // Prepare scoped report data based on user permissions and selected KPI filter
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
                  }}>📄 Generate Report</button>
                  <TableFilter value={kpiFilter} onChange={setKpiFilter} />
                </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', borderRadius: 12 }} onClick={() => setShowSaleModal(true)}>
              + Add New Sale
            </button>
            {isAdmin && (
              <button className="btn btn-glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12 }} onClick={() => setShowStoreModal(true)}>
                + Add Shop Partner
              </button>
            )}
          </div>
        </header>

        <section className="cards-grid" style={{ marginBottom: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="summary-card blue">
            <div className="icon">💰</div>
            <div className="label">Total Bill (Gross)</div>
            <div className="value">{Rs(totalGross)}</div>
            <div style={{ fontSize: '10px', marginTop: 4, opacity: 0.8 }}>{ordersCount} Sales</div>
          </div>
          <div className="summary-card red">
            <div className="icon">🚚</div>
            <div className="label">Total Shipping</div>
            <div className="value">-{Rs(totalShipping)}</div>
          </div>
          <div className="summary-card purple">
            <div className="icon">💵</div>
            <div className="label">Net Amount</div>
            <div className="value">{Rs(totalNetAmt)}</div>
          </div>
          <div className={`summary-card ${isAdmin ? 'orange' : 'green'}`}>
            <div className="icon">🤝</div>
            <div className="label">{isAdmin ? "Total Shop Cut" : "My Earnings (Profit)"}</div>
            <div className="value">{isAdmin ? "-" : ""}{Rs(totalShopCut)}</div>
          </div>
          <div className="summary-card gray">
            <div className="icon">📉</div>
            <div className="label">Expenses</div>
            <div className="value">{Rs(data.expenses.reduce((sum, e) => sum + (e.amount || 0), 0))}</div>
          </div>
          {isAdmin && (
            <>
              <div className="summary-card blue">
                <div className="icon">🏦</div>
                <div className="label">Admin Take (Base)</div>
                <div className="value">{Rs(totalAdminTake)}</div>
              </div>
              <div className="summary-card gray">
                <div className="icon">📦</div>
                <div className="label">Total Item Cost</div>
                <div className="value">{Rs(totalCostPrice)}</div>
              </div>
              <div className="summary-card green">
                <div className="icon">📈</div>
                <div className="label">Final Net Profit</div>
                <div className="value" style={{ fontSize: '1.8rem' }}>{Rs(totalNetProfit)}</div>
              </div>
            </>
          )}
        </section>

        {isAdmin && Object.keys(availableStores).length > 0 && (
          <SectionCard title="Shop Partners (Stores)" icon="🏪">
            <StoresOverviewSection
              stores={availableStores}
              orders={data.orders}
              storeInventory={data.storeInventory}
              filter={kpiFilter}
              getFiltered={getFiltered}
              onMarkPaid={handleMarkPaid}
              onCommissionChange={(name, v) => fetch("/api/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storeName: name, commission: v }),
              }).then(() => refresh())}
              onAssignItem={(name) => window.location.href = `/inventory?assign=${name}`}
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
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Store</label>
                  <select value={partnerStore} onChange={e => setPartnerStore(e.target.value)} style={{ height: 40, fontWeight: 700 }}>
                    <option value="All">All</option>
                    {Object.keys(availableStores).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
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
                    {data.expenses.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', padding: 20 }}>No costs recorded.</td></tr>}
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
    </Layout >
  );
}
